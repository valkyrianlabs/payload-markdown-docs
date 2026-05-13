#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include <doctest/doctest.h>

#include "pmdocs/cli.hpp"
#include "pmdocs/docs.hpp"

#include <nlohmann/json.hpp>

#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <system_error>
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
  const auto skill_root = data_root / "skills" / "payload-markdown-docs";

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
  const auto skill_root = data_root / "skills" / "payload-markdown-docs";
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

TEST_CASE("AI export manifest is parsed and missing order paths warn") {
  TempDir temp{"pmdocs-test-ai-export"};
  const auto root = temp.path() / "docs";
  const auto root_string = root.string();
  write_text(root / "index.md", "# Home\n");
  write_text(
    root / "index.ai.yml",
    "version: 1\n"
    "title: Payload Markdown Documentation\n"
    "canonical: /plugins/payload-markdown\n"
    "output: /plugins/payload-markdown.md\n"
    "preamble: |\n"
    "  This file is intended for AI agents.\n"
    "order:\n"
    "  - ./index.md\n"
    "  - ./missing.md\n"
    "orphans: append\n"
    "headingMode: normalize\n"
  );

  const auto validate = pmdocs::run(args({"validate", root_string}));
  CHECK(validate.exit_code == 0);
  CHECK(validate.stdout_text.find("Warnings:") != std::string::npos);
  CHECK(validate.stdout_text.find("missing.md") != std::string::npos);

  const auto manifest_result = pmdocs::run(args({"manifest", root_string, "--source", "main-docs"}));
  REQUIRE(manifest_result.exit_code == 0);
  const auto manifest = nlohmann::json::parse(manifest_result.stdout_text);
  CHECK(manifest["files"].size() == 1);
  CHECK(manifest["aiExport"]["title"] == "Payload Markdown Documentation");
  CHECK(manifest["aiExport"]["canonical"] == "/plugins/payload-markdown");
  CHECK(manifest["aiExport"]["output"] == "/plugins/payload-markdown.md");
  CHECK(manifest["aiExport"]["preamble"] == "This file is intended for AI agents.");
  CHECK(manifest["aiExport"]["order"][0] == "index.md");

  const auto plan_result = pmdocs::run(args({"plan", root_string, "--source", "main-docs", "--json"}));
  REQUIRE(plan_result.exit_code == 0);
  const auto plan = nlohmann::json::parse(plan_result.stdout_text);
  CHECK(plan["warnings"].empty());
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
  CHECK(plan["create"].size() == 1);
}
