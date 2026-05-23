#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include <doctest/doctest.h>

#include "pmdocs/cli.hpp"
#include "pmdocs/docs.hpp"

#include <nlohmann/json.hpp>

#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>

#include <array>
#include <cctype>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <system_error>
#include <thread>
#include <utility>
#include <unistd.h>
#include <vector>

namespace {

class TempDir {
public:
  explicit TempDir(std::string_view prefix) {
    const auto base = std::filesystem::temp_directory_path();

    for (int attempt = 0; attempt < 100; ++attempt) {
      const auto candidate = base / (
        std::string{prefix}
        + "-"
        + std::to_string(::getpid())
        + "-"
        + std::to_string(attempt)
      );
      std::error_code error;

      if (std::filesystem::create_directory(candidate, error)) {
        path_ = candidate;
        return;
      }

      if (error && !std::filesystem::exists(candidate)) {
        throw std::runtime_error{"Could not create temp directory: " + error.message()};
      }
    }

    throw std::runtime_error{"Could not allocate unique temp directory"};
  }

  TempDir(const TempDir&) = delete;
  TempDir& operator=(const TempDir&) = delete;

  ~TempDir() {
    if (!path_.empty()) {
      std::error_code error;
      std::filesystem::remove_all(path_, error);
    }
  }

  [[nodiscard]] const std::filesystem::path& path() const {
    return path_;
  }

private:
  std::filesystem::path path_;
};

class EnvGuard {
public:
  EnvGuard(std::string name, std::string value)
    : name_{std::move(name)}
  {
    if (const char* current = std::getenv(name_.c_str())) {
      previous_ = current;
    }

    ::setenv(name_.c_str(), value.c_str(), 1);
  }

  EnvGuard(const EnvGuard&) = delete;
  EnvGuard& operator=(const EnvGuard&) = delete;

  ~EnvGuard() {
    if (previous_.empty()) {
      ::unsetenv(name_.c_str());
    } else {
      ::setenv(name_.c_str(), previous_.c_str(), 1);
    }
  }

private:
  std::string name_;
  std::string previous_;
};

class CwdGuard {
public:
  explicit CwdGuard(const std::filesystem::path& next)
    : previous_{std::filesystem::current_path()}
  {
    std::filesystem::current_path(next);
  }

  CwdGuard(const CwdGuard&) = delete;
  CwdGuard& operator=(const CwdGuard&) = delete;

  ~CwdGuard() {
    std::error_code error;
    std::filesystem::current_path(previous_, error);
  }

private:
  std::filesystem::path previous_;
};

class SingleRequestServer {
public:
  explicit SingleRequestServer(int status, std::string body, std::string content_type = "application/json; charset=utf-8")
    : status_{status}
    , body_{std::move(body)}
    , content_type_{std::move(content_type)}
  {
    listen_fd_ = ::socket(AF_INET, SOCK_STREAM, 0);
    if (listen_fd_ < 0) {
      throw std::runtime_error{"Could not create local test socket."};
    }

    int reuse = 1;
    if (::setsockopt(listen_fd_, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse)) != 0) {
      close_listen_socket();
      throw std::runtime_error{"Could not configure local test socket."};
    }

    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_port = htons(0);
    if (::inet_pton(AF_INET, "127.0.0.1", &address.sin_addr) != 1) {
      close_listen_socket();
      throw std::runtime_error{"Could not configure local test address."};
    }

    if (::bind(listen_fd_, reinterpret_cast<sockaddr*>(&address), sizeof(address)) != 0) {
      close_listen_socket();
      throw std::runtime_error{"Could not bind local test server."};
    }

    if (::listen(listen_fd_, 1) != 0) {
      close_listen_socket();
      throw std::runtime_error{"Could not listen on local test server."};
    }

    sockaddr_in bound{};
    socklen_t length = sizeof(bound);
    if (::getsockname(listen_fd_, reinterpret_cast<sockaddr*>(&bound), &length) != 0) {
      close_listen_socket();
      throw std::runtime_error{"Could not read local test server port."};
    }
    port_ = ntohs(bound.sin_port);

    worker_ = std::thread{[this]() { handle_request(); }};
  }

  SingleRequestServer(const SingleRequestServer&) = delete;
  SingleRequestServer& operator=(const SingleRequestServer&) = delete;

  ~SingleRequestServer() {
    close_listen_socket();
    if (worker_.joinable()) {
      worker_.join();
    }
  }

  [[nodiscard]] std::string url() const {
    return "http://127.0.0.1:" + std::to_string(port_) + "/api/documentation/sync";
  }

  [[nodiscard]] std::string captured_request() {
    if (worker_.joinable()) {
      worker_.join();
    }
    return request_;
  }

private:
  static std::string reason_phrase(int status) {
    if (status >= 200 && status < 300) {
      return "OK";
    }
    if (status == 422) {
      return "Unprocessable Content";
    }
    if (status >= 500) {
      return "Internal Server Error";
    }
    return "Error";
  }

  static std::size_t parse_content_length(std::string_view headers) {
    std::string lower{headers};
    for (auto& ch : lower) {
      ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
    }

    const auto marker = std::string{"content-length:"};
    const auto offset = lower.find(marker);
    if (offset == std::string::npos) {
      return 0;
    }

    const auto value_start = offset + marker.size();
    const auto value_end = lower.find("\r\n", value_start);
    const auto value = lower.substr(value_start, value_end == std::string::npos ? std::string::npos : value_end - value_start);
    return static_cast<std::size_t>(std::stoul(std::string{value}));
  }

  void handle_request() {
    const int client = ::accept(listen_fd_, nullptr, nullptr);
    if (client < 0) {
      return;
    }

    close_listen_socket();

    std::string request;
    std::array<char, 4096> buffer{};
    std::size_t expected_size = 0;

    while (true) {
      const auto read_count = ::recv(client, buffer.data(), buffer.size(), 0);
      if (read_count <= 0) {
        break;
      }

      request.append(buffer.data(), static_cast<std::size_t>(read_count));
      const auto header_end = request.find("\r\n\r\n");
      if (header_end != std::string::npos) {
        const auto body_start = header_end + 4;
        expected_size = body_start + parse_content_length(std::string_view{request}.substr(0, header_end));
        if (request.size() >= expected_size) {
          break;
        }
      }
    }

    request_ = std::move(request);

    const auto response = std::string{"HTTP/1.1 "}
      + std::to_string(status_)
      + " "
      + reason_phrase(status_)
      + "\r\nContent-Type: "
      + content_type_
      + "\r\nContent-Length: "
      + std::to_string(body_.size())
      + "\r\nConnection: close\r\n\r\n"
      + body_;
    (void)::send(client, response.data(), response.size(), 0);
    ::close(client);
  }

  void close_listen_socket() {
    if (listen_fd_ >= 0) {
      ::close(listen_fd_);
      listen_fd_ = -1;
    }
  }

  int listen_fd_ = -1;
  int port_ = 0;
  int status_;
  std::string body_;
  std::string content_type_;
  std::string request_;
  std::thread worker_;
};

void write_text(const std::filesystem::path& path, std::string_view content) {
  std::filesystem::create_directories(path.parent_path());
  std::ofstream output{path, std::ios::binary | std::ios::trunc};
  REQUIRE(output.good());
  output.write(content.data(), static_cast<std::streamsize>(content.size()));
  REQUIRE(output.good());
}

std::string read_text(const std::filesystem::path& path) {
  std::ifstream input{path, std::ios::binary};
  REQUIRE(input.good());
  std::ostringstream out;
  out << input.rdbuf();
  return out.str();
}

std::vector<std::string_view> args(std::initializer_list<std::string_view> values) {
  return {values.begin(), values.end()};
}

std::filesystem::path create_skill_fixture(const std::filesystem::path& root) {
  const auto data_root = root / "data";
  const auto skill_root = data_root / "skills" / "payload-markdown-docs" / "codex";

  write_text(
    skill_root / "SKILL.md",
    "Docs root: {{docsRoot}}\nPackage manager: {{packageManager}}\n"
    "{{packageManager}} exec payload-markdown-docs validate {{docsRoot}}\n"
  );
  write_text(skill_root / "reference" / "workflow.md", "Workflow for {{docsRoot}}\n");

  return data_root;
}

} // namespace

TEST_CASE("help, version, and doctor are available") {
  TempDir temp{"pmdocs-test-help"};
  const auto data_root = create_skill_fixture(temp.path());
  EnvGuard env{"PMDOCS_DATA_DIR", data_root.string()};

  const auto help = pmdocs::run(args({"--help"}));
  CHECK(help.exit_code == 0);
  CHECK(help.stdout_text.find("pmdocs skill install") != std::string::npos);

  const auto version = pmdocs::run(args({"--version"}));
  CHECK(version.exit_code == 0);
  CHECK(version.stdout_text.find("pmdocs ") != std::string::npos);

  const auto doctor = pmdocs::run(args({"doctor"}));
  CHECK(doctor.exit_code == 0);
  CHECK(doctor.stdout_text.find("skill_status: found") != std::string::npos);
  CHECK(doctor.stdout_text.find("project_skill_path:") != std::string::npos);
}

TEST_CASE("skill install help is available") {
  TempDir temp{"pmdocs-test-install-help"};
  const auto data_root = create_skill_fixture(temp.path());
  EnvGuard env{"PMDOCS_DATA_DIR", data_root.string()};

  const auto result = pmdocs::run(args({"skill", "install", "--help"}));

  CHECK(result.exit_code == 0);
  CHECK(result.stdout_text.find("--docs-root") != std::string::npos);
  CHECK(result.stdout_text.find("--package-manager") != std::string::npos);
  CHECK(result.stdout_text.find("Bundled skill source:") != std::string::npos);
}

TEST_CASE("skill install dry-run prints planned files without writing") {
  TempDir temp{"pmdocs-test-dry-run"};
  const auto data_root = create_skill_fixture(temp.path());
  const auto project_root = temp.path() / "project";
  std::filesystem::create_directory(project_root);
  EnvGuard env{"PMDOCS_DATA_DIR", data_root.string()};
  CwdGuard cwd{project_root};

  const auto result = pmdocs::run(args({"skill", "install", "--dry-run"}));

  CHECK(result.exit_code == 0);
  CHECK(result.stdout_text.find("dry-run") != std::string::npos);
  CHECK(result.stdout_text.find("SKILL.md") != std::string::npos);
  CHECK_FALSE(std::filesystem::exists(project_root / ".codex"));
}

TEST_CASE("skill install copies bundled files to the default project path") {
  TempDir temp{"pmdocs-test-install"};
  const auto data_root = create_skill_fixture(temp.path());
  const auto project_root = temp.path() / "project";
  std::filesystem::create_directory(project_root);
  EnvGuard env{"PMDOCS_DATA_DIR", data_root.string()};
  CwdGuard cwd{project_root};

  const auto result = pmdocs::run(args({"skill", "install"}));
  const auto target = project_root / ".codex" / "skills" / "payload-markdown-docs";

  CHECK(result.exit_code == 0);
  CHECK(std::filesystem::exists(target / "SKILL.md"));
  CHECK(std::filesystem::exists(target / "reference" / "workflow.md"));
  CHECK(read_text(target / "SKILL.md").find("Docs root: docs") != std::string::npos);
  CHECK(read_text(target / "SKILL.md").find("Package manager: npm") != std::string::npos);
}

TEST_CASE("skill install renders placeholders from flags") {
  TempDir temp{"pmdocs-test-render"};
  const auto data_root = create_skill_fixture(temp.path());
  const auto project_root = temp.path() / "project";
  const auto out = project_root / "custom-skill";
  const auto out_string = out.string();
  std::filesystem::create_directory(project_root);
  EnvGuard env{"PMDOCS_DATA_DIR", data_root.string()};
  CwdGuard cwd{project_root};

  const auto result = pmdocs::run(args({
    "skill",
    "install",
    "--out",
    out_string,
    "--docs-root",
    "content/docs",
    "--package-manager",
    "pnpm",
  }));

  CHECK(result.exit_code == 0);
  const auto skill = read_text(out / "SKILL.md");
  CHECK(skill.find("Docs root: content/docs") != std::string::npos);
  CHECK(skill.find("Package manager: pnpm") != std::string::npos);
  CHECK(skill.find("pnpm exec payload-markdown-docs validate content/docs") != std::string::npos);
}

TEST_CASE("skill install reports conflicts without force and overwrites with force") {
  TempDir temp{"pmdocs-test-conflict"};
  const auto data_root = create_skill_fixture(temp.path());
  const auto project_root = temp.path() / "project";
  const auto out = project_root / "skill";
  const auto out_string = out.string();
  std::filesystem::create_directory(project_root);
  EnvGuard env{"PMDOCS_DATA_DIR", data_root.string()};
  CwdGuard cwd{project_root};

  const auto first = pmdocs::run(args({"skill", "install", "--out", out_string}));
  REQUIRE(first.exit_code == 0);

  write_text(out / "SKILL.md", "stale\n");

  const auto conflict = pmdocs::run(args({"skill", "install", "--out", out_string}));
  CHECK(conflict.exit_code == 1);
  CHECK(conflict.stderr_text.find("Use --force") != std::string::npos);
  CHECK(read_text(out / "SKILL.md") == "stale\n");

  const auto forced = pmdocs::run(args({"skill", "install", "--out", out_string, "--force"}));
  CHECK(forced.exit_code == 0);
  CHECK(read_text(out / "SKILL.md") != "stale\n");
}

TEST_CASE("skill install skips bundled symlinks") {
  TempDir temp{"pmdocs-test-symlink"};
  const auto data_root = create_skill_fixture(temp.path());
  const auto skill_root = data_root / "skills" / "payload-markdown-docs" / "codex";
  const auto project_root = temp.path() / "project";
  const auto out = project_root / "skill";
  const auto out_string = out.string();
  std::filesystem::create_directory(project_root);

  std::error_code error;
  std::filesystem::create_symlink(skill_root / "SKILL.md", skill_root / "linked.md", error);

  EnvGuard env{"PMDOCS_DATA_DIR", data_root.string()};
  CwdGuard cwd{project_root};

  const auto result = pmdocs::run(args({"skill", "install", "--out", out_string}));

  CHECK(result.exit_code == 0);
  CHECK_FALSE(std::filesystem::exists(out / "linked.md"));
}

TEST_CASE("sha256 matches known test vector") {
  CHECK(pmdocs::sha256_hex("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
}

TEST_CASE("keygen prints and writes Ed25519 keys") {
  const auto printed = pmdocs::run(args({"keygen"}));
  REQUIRE(printed.exit_code == 0);
  CHECK(printed.stdout_text.find("-----BEGIN PUBLIC KEY-----") != std::string::npos);
  CHECK(printed.stdout_text.find("-----BEGIN PRIVATE KEY-----") != std::string::npos);

  TempDir temp{"pmdocs-test-keygen"};
  const auto out = temp.path() / "keys";
  const auto out_string = out.string();
  const auto first = pmdocs::run(args({"keygen", "--out", out_string}));
  const auto second = pmdocs::run(args({"keygen", "--out", out_string}));
  const auto forced = pmdocs::run(args({"keygen", "--out", out_string, "--force"}));

  CHECK(first.exit_code == 0);
  CHECK(second.exit_code == 1);
  CHECK(second.stderr_text.find("Key files already exist.") != std::string::npos);
  CHECK(forced.exit_code == 0);
  CHECK(read_text(out / "docs-sync-public.pem").find("BEGIN PUBLIC KEY") != std::string::npos);
  CHECK(read_text(out / "docs-sync-private.pem").find("BEGIN PRIVATE KEY") != std::string::npos);
}

TEST_CASE("signing builds canonical headers for PEM and base64 keys") {
  const auto pem_keys = pmdocs::generate_ed25519_key_pair("pem");
  const auto base64_keys = pmdocs::generate_ed25519_key_pair("base64");
  const auto canonical = pmdocs::build_canonical_signing_string(
    "ABCDEF",
    "post",
    "/api/documentation/sync/",
    "2026-01-01T00:00:00.000Z",
    "nonce-1"
  );

  CHECK(canonical == "v1\nPOST\n/api/documentation/sync\n2026-01-01T00:00:00.000Z\nnonce-1\nabcdef");

  const auto signed_pem = pmdocs::sign_docs_sync_request(
    "{\"version\":1}",
    "https://example.com/api/documentation/sync?ignored=true",
    "github-actions-main",
    pem_keys.private_key,
    "nonce-1",
    "2026-01-01T00:00:00.000Z"
  );
  const auto signed_base64 = pmdocs::sign_docs_sync_request(
    "{\"version\":1}",
    "https://example.com/api/documentation/sync",
    "github-actions-main",
    base64_keys.private_key,
    "nonce-1",
    "2026-01-01T00:00:00.000Z"
  );

  CHECK(signed_pem.headers.at("X-VL-MD-DOCS-Body-SHA256") == pmdocs::sha256_hex("{\"version\":1}"));
  CHECK(signed_pem.headers.at("X-VL-MD-DOCS-Key-Id") == "github-actions-main");
  CHECK(signed_pem.headers.at("X-VL-MD-DOCS-Nonce") == "nonce-1");
  CHECK_FALSE(signed_pem.headers.at("X-VL-MD-DOCS-Signature").empty());
  CHECK_FALSE(signed_base64.headers.at("X-VL-MD-DOCS-Signature").empty());
}

TEST_CASE("push command parses help and rejects invalid auth combinations before networking") {
  TempDir temp{"pmdocs-test-push-options"};
  const auto root = temp.path() / "docs";
  const auto root_string = root.string();
  const auto keys = pmdocs::generate_ed25519_key_pair("pem");
  const auto key_path = temp.path() / "docs-sync-private.pem";
  const auto key_path_string = key_path.string();
  write_text(root / "index.md", "# Home\n");
  write_text(key_path, keys.private_key);

  const auto help = pmdocs::run(args({"push", "--help"}));
  CHECK(help.exit_code == 0);
  CHECK(help.stdout_text.find("--github-oidc") != std::string::npos);
  CHECK(help.stdout_text.find("sync.allowHardDelete") != std::string::npos);

  const auto unknown_sync = pmdocs::run(args({
    "push",
    root_string,
    "--endpoint",
    "https://example.com/api/documentation/sync",
    "--key-id",
    "github-actions-main",
    "--private-key-file",
    key_path_string,
    "--sync",
  }));
  CHECK(unknown_sync.exit_code != 0);

  const auto missing_endpoint = pmdocs::run(args({
    "push",
    root_string,
    "--key-id",
    "github-actions-main",
    "--private-key-file",
    key_path_string,
  }));
  CHECK(missing_endpoint.exit_code == 1);
  CHECK(missing_endpoint.stderr_text.find("Push requires --endpoint") != std::string::npos);

  const auto invalid_endpoint = pmdocs::run(args({
    "push",
    root_string,
    "--endpoint",
    "ftp://example.com/sync",
    "--key-id",
    "github-actions-main",
    "--private-key-file",
    key_path_string,
  }));
  CHECK(invalid_endpoint.exit_code == 1);
  CHECK(invalid_endpoint.stderr_text.find("http:// or https://") != std::string::npos);

  const auto oidc_conflict = pmdocs::run(args({
    "push",
    root_string,
    "--endpoint",
    "https://example.com/api/documentation/sync",
    "--github-oidc",
    "--private-key-file",
    key_path_string,
  }));
  CHECK(oidc_conflict.exit_code == 1);
  CHECK(oidc_conflict.stderr_text.find("Do not use Ed25519 private key flags") != std::string::npos);

  {
    EnvGuard oidc_url{"ACTIONS_ID_TOKEN_REQUEST_URL", "not-a-url"};
    EnvGuard oidc_request_token{"ACTIONS_ID_TOKEN_REQUEST_TOKEN", "request-token"};
    const auto oidc_invalid_url = pmdocs::run(args({
      "push",
      root_string,
      "--endpoint",
      "https://example.com/api/documentation/sync",
      "--github-oidc",
    }));
    CHECK(oidc_invalid_url.exit_code == 1);
    CHECK(oidc_invalid_url.stderr_text.find("ACTIONS_ID_TOKEN_REQUEST_URL is not a valid URL.") != std::string::npos);
  }

  const auto bad_key_path = temp.path() / "not-a-key";
  const auto bad_key_path_string = bad_key_path.string();
  write_text(bad_key_path, "not a private key\n");
  const auto bad_key = pmdocs::run(args({
    "push",
    root_string,
    "--endpoint",
    "https://example.com/api/documentation/sync",
    "--key-id",
    "github-actions-main",
    "--private-key-file",
    bad_key_path_string,
  }));
  CHECK(bad_key.exit_code == 1);
  CHECK(bad_key.stderr_text.find("Private key must be an Ed25519") != std::string::npos);

  const auto llms_path = temp.path() / "llms.txt";
  const auto llms_path_string = llms_path.string();
  write_text(llms_path, "# llms\n");
  const auto project_root = temp.path();
  CwdGuard cwd{project_root};
  const auto strict_routes = pmdocs::run(args({
    "push",
    "--docs",
    root_string,
    "--llms",
    llms_path_string,
    "--endpoint",
    "https://example.com/api/documentation/sync",
    "--key-id",
    "github-actions-main",
    "--private-key-file",
    key_path_string,
    "--strict-routes",
  }));
  CHECK(strict_routes.exit_code == 1);
  CHECK(strict_routes.stderr_text.find("public asset route files were not found") != std::string::npos);
}

TEST_CASE("push posts docs to a local HTTP endpoint with GitHub OIDC and publish intent") {
  TempDir temp{"pmdocs-test-push-http"};
  const auto root = temp.path() / "docs";
  const auto root_string = root.string();
  write_text(root / "index.md", "# Home\n");
  EnvGuard oidc{"PMDOCS_TEST_OIDC_TOKEN", "oidc-token"};
  SingleRequestServer server{
    200,
    R"({"ok":true,"summary":{"create":1,"warnings":0},"syncRunId":"sync_1","deleteBehavior":"archive","publishRequested":true})",
  };
  const auto endpoint = server.url();

  const auto result = pmdocs::run(args({
    "push",
    root_string,
    "--endpoint",
    endpoint,
    "--source",
    "payload-markdown-docs",
    "--github-oidc",
    "--oidc-token-env",
    "PMDOCS_TEST_OIDC_TOKEN",
    "--dry-run",
    "--publish",
  }));

  CHECK(result.exit_code == 0);
  CHECK(result.stdout_text.find("Status: accepted") != std::string::npos);
  CHECK(result.stdout_text.find("Publish requested: yes") != std::string::npos);
  CHECK(result.stdout_text.find("Sync run: sync_1") != std::string::npos);

  const auto request = server.captured_request();
  CHECK(request.find("POST /api/documentation/sync HTTP/1.1") != std::string::npos);
  CHECK(request.find("Authorization: Bearer oidc-token") != std::string::npos);
  CHECK(request.find("\"source\":{\"id\":\"payload-markdown-docs\"}") != std::string::npos);
  CHECK(request.find("\"mode\":\"dry-run\"") != std::string::npos);
  CHECK(request.find("\"publish\":true") != std::string::npos);
}

TEST_CASE("push JSON output returns server response metadata") {
  TempDir temp{"pmdocs-test-push-json"};
  const auto root = temp.path() / "docs";
  const auto root_string = root.string();
  write_text(root / "index.md", "# Home\n");
  EnvGuard oidc{"PMDOCS_TEST_OIDC_TOKEN", "oidc-token"};
  SingleRequestServer server{
    200,
    R"({"ok":true,"summary":{"create":1},"syncRunId":"sync_json","publishRequested":false})",
  };
  const auto endpoint = server.url();

  const auto result = pmdocs::run(args({
    "push",
    root_string,
    "--endpoint",
    endpoint,
    "--source",
    "payload-markdown-docs",
    "--github-oidc",
    "--oidc-token-env",
    "PMDOCS_TEST_OIDC_TOKEN",
    "--dry-run",
    "--json",
  }));

  REQUIRE(result.exit_code == 0);
  const auto output = nlohmann::json::parse(result.stdout_text);
  CHECK(output["status"] == 200);
  CHECK(output["sourceId"] == "payload-markdown-docs");
  CHECK(output["response"]["ok"] == true);
  CHECK(output["response"]["syncRunId"] == "sync_json");
  CHECK(output["package"]["docs"] == 1);
  (void)server.captured_request();
}

TEST_CASE("push reports JSON and non-JSON server failures") {
  TempDir temp{"pmdocs-test-push-failures"};
  const auto root = temp.path() / "docs";
  const auto root_string = root.string();
  write_text(root / "index.md", "# Home\n");
  EnvGuard oidc{"PMDOCS_TEST_OIDC_TOKEN", "oidc-token"};

  {
    SingleRequestServer server{
      422,
      R"({"error":{"message":"No writes allowed"}})",
    };
    const auto endpoint = server.url();
    const auto result = pmdocs::run(args({
      "push",
      root_string,
      "--endpoint",
      endpoint,
      "--source",
      "payload-markdown-docs",
      "--github-oidc",
      "--oidc-token-env",
      "PMDOCS_TEST_OIDC_TOKEN",
      "--dry-run",
    }));

    CHECK(result.exit_code == 1);
    CHECK(result.stderr_text.find("No writes allowed") != std::string::npos);
    (void)server.captured_request();
  }

  {
    SingleRequestServer server{500, "server exploded", "text/plain; charset=utf-8"};
    const auto endpoint = server.url();
    const auto result = pmdocs::run(args({
      "push",
      root_string,
      "--endpoint",
      endpoint,
      "--source",
      "payload-markdown-docs",
      "--github-oidc",
      "--oidc-token-env",
      "PMDOCS_TEST_OIDC_TOKEN",
      "--dry-run",
    }));

    CHECK(result.exit_code == 1);
    CHECK(result.stderr_text.find("HTTP status 500") != std::string::npos);
    CHECK(result.stderr_text.find("server exploded") != std::string::npos);
    (void)server.captured_request();
  }
}

TEST_CASE("validate succeeds for valid docs and reports invalid frontmatter") {
  TempDir temp{"pmdocs-test-validate"};
  const auto root = temp.path() / "docs";
  const auto root_string = root.string();
  write_text(root / "index.md", "# Home\n");
  write_text(root / "bad.md", "---\norder: nope\n---\n# Bad\n");

  const auto invalid = pmdocs::run(args({"validate", root_string, "--source", "main-docs"}));
  CHECK(invalid.exit_code == 1);
  CHECK(invalid.stdout_text.find("Status: invalid") != std::string::npos);
  CHECK(invalid.stdout_text.find("Frontmatter field \"order\" must be a number.") != std::string::npos);

  std::filesystem::remove(root / "bad.md");
  const auto valid = pmdocs::run(args({"validate", root_string, "--source", "main-docs"}));
  CHECK(valid.exit_code == 0);
  CHECK(valid.stdout_text.find("Source: main-docs") != std::string::npos);
  CHECK(valid.stdout_text.find("Status: valid") != std::string::npos);
}

TEST_CASE("validate JSON output includes warnings") {
  TempDir temp{"pmdocs-test-validate-json"};
  const auto root = temp.path() / "docs";
  const auto root_string = root.string();
  write_text(root / "index.md", "---\nunknown: value\n---\n# Home\n");

  const auto result = pmdocs::run(args({"validate", root_string, "--json"}));
  REQUIRE(result.exit_code == 0);

  const auto output = nlohmann::json::parse(result.stdout_text);
  CHECK(output["fileCount"] == 1);
  CHECK(output["validation"]["ok"] == true);
  CHECK(output["validation"]["warnings"].size() == 1);
  CHECK(output["validation"]["warnings"][0]["message"].get<std::string>().find("Unknown frontmatter field") != std::string::npos);
}

TEST_CASE("manifest includes skill and llms assets") {
  TempDir temp{"pmdocs-test-assets"};
  const auto root = temp.path() / "docs";
  const auto root_string = root.string();
  const auto skills = temp.path() / "skills";
  const auto skills_string = skills.string();
  const auto llms = temp.path() / "llms.txt";
  const auto llms_string = llms.string();
  write_text(root / "index.md", "# Home\n");
  write_text(root / "index.ai.yml", "version: 1\norder:\n  - ./missing.md\n");
  write_text(skills / "main-docs" / "codex" / "SKILL.md", "# Skill\n");
  write_text(skills / "main-docs" / "codex" / "config.json", "{}\n");
  write_text(llms, "# llms\n");

  const auto validate = pmdocs::run(args({
    "validate",
    root_string,
    "--source",
    "main-docs",
    "--skills",
    skills_string,
    "--llms",
    llms_string,
  }));
  CHECK(validate.exit_code == 0);
  CHECK(validate.stdout_text.find("Assets: 3") != std::string::npos);
  CHECK(validate.stdout_text.find("Skills: 2") != std::string::npos);
  CHECK(validate.stdout_text.find("llms.txt: present") != std::string::npos);

  const auto manifest_result = pmdocs::run(args({
    "manifest",
    root_string,
    "--source",
    "main-docs",
    "--skills",
    skills_string,
    "--llms",
    llms_string,
  }));
  REQUIRE(manifest_result.exit_code == 0);
  const auto manifest = nlohmann::json::parse(manifest_result.stdout_text);
  CHECK(manifest["files"].size() == 1);
  CHECK(manifest["assets"].size() == 3);
  CHECK(manifest["assets"][0]["kind"] == "llms");
  CHECK(manifest["assets"][0]["route"] == "/llms.txt");

  bool found_skill = false;
  for (const auto& asset : manifest["assets"]) {
    if (asset["path"] == "skills/main-docs/codex/SKILL.md") {
      found_skill = true;
      CHECK_FALSE(asset.contains("route"));
    }
  }
  CHECK(found_skill);

  const auto plan_result = pmdocs::run(args({
    "plan",
    root_string,
    "--source",
    "main-docs",
    "--skills",
    skills_string,
    "--llms",
    llms_string,
    "--json",
  }));
  REQUIRE(plan_result.exit_code == 0);
  const auto plan = nlohmann::json::parse(plan_result.stdout_text);
  CHECK(plan["docs"]["create"].size() == 1);
  CHECK(plan["assets"]["create"].size() == 3);
  CHECK(plan["package"]["assets"] == 3);
}

TEST_CASE("manifest fails when generated manifest is invalid") {
  TempDir temp{"pmdocs-test-manifest-invalid"};
  const auto root = temp.path() / "docs";
  const auto root_string = root.string();
  write_text(root / "index.md", "---\nstatus: live\n---\n# Home\n");

  const auto result = pmdocs::run(args({"manifest", root_string}));

  CHECK(result.exit_code == 1);
  CHECK(result.stderr_text.find("Manifest is invalid.") != std::string::npos);
}

TEST_CASE("plan supports existing records and delete behavior") {
  TempDir temp{"pmdocs-test-plan"};
  const auto root = temp.path() / "docs";
  const auto root_string = root.string();
  const auto existing_path = temp.path() / "existing.json";
  const auto existing_string = existing_path.string();
  write_text(root / "index.md", "# Home\n");
  write_text(
    existing_path,
    R"([
      {
        "route": "/docs",
        "sourceHash": "old-hash",
        "sourcePath": "index.md",
        "title": "Home"
      },
      {
        "route": "/docs/old",
        "sourceHash": "old-hash",
        "sourcePath": "old.md",
        "title": "Old"
      }
    ])"
  );

  const auto result = pmdocs::run(args({"plan", root_string, "--existing", existing_string}));
  CHECK(result.exit_code == 0);
  CHECK(result.stdout_text.find("Update: 1") != std::string::npos);
  CHECK(result.stdout_text.find("Archive: 1") != std::string::npos);

  const auto ignored = pmdocs::run(args({"plan", root_string, "--existing", existing_string, "--delete-behavior", "ignore"}));
  CHECK(ignored.exit_code == 0);
  CHECK(ignored.stdout_text.find("Archive: 0") != std::string::npos);

  const auto json_result = pmdocs::run(args({"plan", root_string, "--json"}));
  REQUIRE(json_result.exit_code == 0);
  const auto plan = nlohmann::json::parse(json_result.stdout_text);
  CHECK(plan["docs"]["create"].size() == 1);
  CHECK(plan["assets"]["create"].size() == 0);
}
