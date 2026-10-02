// Runs the shared TS <-> C++ protocol vectors in contracts/vectors/ against
// the native implementation. The server runs the same files from
// src/sync/contracts.spec.ts. See contracts/README.md.

#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include <doctest/doctest.h>

#include "pmdocs/contract.hpp"
#include "pmdocs/docs.hpp"

#include <nlohmann/json.hpp>

#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

using ordered_json = nlohmann::ordered_json;
using plain_json = nlohmann::json;
namespace contract = pmdocs::contract;

std::filesystem::path vectors_dir() {
  if (const char* configured = std::getenv("PMDOCS_CONTRACT_VECTORS_DIR"); configured != nullptr && *configured != '\0') {
    return configured;
  }

  // Fallback for running the binary from the build directory by hand.
  return std::filesystem::path{__FILE__}.parent_path().parent_path().parent_path() / "contracts" / "vectors";
}

ordered_json load(const std::string& name) {
  const auto path = vectors_dir() / name;
  std::ifstream input{path, std::ios::binary};

  if (!input) {
    throw std::runtime_error{"Could not read contract vector file: " + path.string()};
  }

  std::ostringstream out;
  out << input.rdbuf();
  auto data = ordered_json::parse(out.str());
  REQUIRE(data["contractVersion"] == 1);
  return data;
}

// Key order is not part of the contract; compare as unordered JSON.
plain_json plain(const ordered_json& value) {
  return plain_json::parse(value.dump());
}

std::optional<std::string> optional_string(const ordered_json& value, const char* key) {
  if (value.contains(key) && value[key].is_string()) {
    return value[key].get<std::string>();
  }

  return std::nullopt;
}

ordered_json issues_json(const std::vector<contract::Issue>& issues, bool with_message) {
  ordered_json output = ordered_json::array();

  for (const auto& issue : issues) {
    ordered_json item = {{"code", issue.code}};

    if (with_message) {
      item["message"] = issue.message;
    }

    if (issue.path) {
      item["path"] = *issue.path;
    }

    output.push_back(item);
  }

  return output;
}

ordered_json string_array(const std::vector<std::string>& values) {
  ordered_json output = ordered_json::array();

  for (const auto& value : values) {
    output.push_back(value);
  }

  return output;
}

std::vector<unsigned char> from_hex(const std::string& hex) {
  std::vector<unsigned char> bytes;

  for (std::size_t index = 0; index + 1 < hex.size(); index += 2) {
    bytes.push_back(static_cast<unsigned char>(std::stoul(hex.substr(index, 2), nullptr, 16)));
  }

  return bytes;
}

} // namespace

TEST_CASE("contract vectors: routes") {
  const auto vectors = load("routes.json");

  for (const auto& test_case : vectors["cases"]) {
    INFO(test_case["name"].get<std::string>());
    const auto source_path = test_case["sourcePath"].get<std::string>();
    const auto route_base = test_case["routeBase"].get<std::string>();
    const auto slug = optional_string(test_case, "slug");
    const auto normalized = contract::normalize_docs_path(source_path);
    const auto& expect = test_case["expect"];

    if (expect.contains("error")) {
      CHECK_FALSE(normalized.ok);
      CHECK(normalized.code == expect["error"].get<std::string>());
      continue;
    }

    REQUIRE(normalized.ok);
    const auto check = contract::check_route_segments(source_path, route_base, slug);
    const ordered_json actual = {
      {"path", normalized.path},
      {"route", contract::derive_route_from_source_path(source_path, route_base, slug)},
      {"unservableSegments", string_array(check.unservable)},
      {"whitespaceSegments", string_array(check.whitespace)},
    };
    CHECK(plain(actual) == plain(expect));
  }
}

TEST_CASE("contract vectors: titles") {
  const auto vectors = load("titles.json");

  for (const auto& test_case : vectors["infer"]) {
    INFO("infer: " << test_case["name"].get<std::string>());
    const auto inferred = contract::infer_title_from_markdown(test_case["markdown"].get<std::string>());
    const ordered_json actual = inferred ? ordered_json(*inferred) : ordered_json(nullptr);
    CHECK(actual == test_case["expect"]);
  }

  for (const auto& test_case : vectors["sourcePath"]) {
    INFO("source path: " << test_case["sourcePath"].get<std::string>());
    CHECK(contract::title_from_source_path(test_case["sourcePath"].get<std::string>()) == test_case["expect"].get<std::string>());
  }

  for (const auto& test_case : vectors["resolve"]) {
    INFO("resolve: " << test_case["name"].get<std::string>());
    const auto source_path = test_case["sourcePath"].get<std::string>();
    const auto parsed = contract::parse_frontmatter(test_case["markdown"].get<std::string>(), source_path);
    CHECK(contract::resolve_title(parsed, source_path) == test_case["expect"].get<std::string>());
  }
}

TEST_CASE("contract vectors: frontmatter") {
  const auto vectors = load("frontmatter.json");

  for (const auto& test_case : vectors["cases"]) {
    INFO(test_case["name"].get<std::string>());
    const auto parsed = contract::parse_frontmatter(test_case["markdown"].get<std::string>());
    const ordered_json actual = {
      {"content", parsed.content},
      {"frontmatter", contract::frontmatter_to_json(parsed.frontmatter)},
      {"issues", issues_json(parsed.issues, true)},
      {"warnings", issues_json(parsed.warnings, true)},
    };
    CHECK(plain(actual) == plain(test_case["expect"]));
  }
}

TEST_CASE("contract vectors: asset routes") {
  const auto vectors = load("asset-routes.json");

  for (const auto& test_case : vectors["cases"]) {
    INFO(test_case["name"].get<std::string>());
    const auto result = contract::resolve_asset_route(
      test_case["kind"].get<std::string>(),
      optional_string(test_case, "route"),
      test_case["assetRouteBase"].get<std::string>(),
      test_case["sourceId"].get<std::string>(),
      test_case["sourcePath"].get<std::string>()
    );
    ordered_json actual;

    if (result.ok) {
      actual = {
        {"route", result.route ? ordered_json(*result.route) : ordered_json(nullptr)},
        {"warning", result.warning ? ordered_json(result.warning->code) : ordered_json(nullptr)},
      };
    } else {
      actual = {{"error", result.code}};
    }

    CHECK(plain(actual) == plain(test_case["expect"]));
  }
}

TEST_CASE("contract vectors: manifests") {
  const auto vectors = load("manifests.json");

  for (const auto& test_case : vectors["cases"]) {
    INFO(test_case["name"].get<std::string>());
    const auto manifest = test_case.contains("manifestJson")
      ? ordered_json::parse(test_case["manifestJson"].get<std::string>())
      : test_case["manifest"];
    const auto& options_json = test_case["options"];
    contract::ValidationOptions options;
    options.route_base = options_json.value("routeBase", std::string{"/docs"});
    options.asset_route_base = options_json.value("assetRouteBase", options.route_base);
    options.max_assets = options_json.value("maxAssets", contract::kDefaultMaxFiles);
    options.max_file_bytes = options_json.value("maxFileBytes", contract::kDefaultMaxFileBytes);
    options.max_files = options_json.value("maxFiles", contract::kDefaultMaxFiles);
    options.max_total_bytes = options_json.value("maxTotalBytes", contract::kDefaultMaxTotalBytes);

    if (options_json.contains("allowedSourceIds")) {
      options.allowed_source_ids = options_json["allowedSourceIds"].get<std::vector<std::string>>();
    }

    const auto result = contract::validate_manifest(manifest, options);
    ordered_json actual = {
      {"ok", result.ok},
      {"issues", issues_json(result.issues, false)},
      {"warnings", issues_json(result.warnings, false)},
    };

    if (result.ok) {
      actual["files"] = ordered_json::array();
      for (const auto& file : result.files) {
        actual["files"].push_back({{"path", file.path}, {"route", file.route}, {"title", file.title}});
      }

      actual["assets"] = ordered_json::array();
      for (const auto& asset : result.assets) {
        actual["assets"].push_back({
          {"path", asset.path},
          {"route", asset.route ? ordered_json(*asset.route) : ordered_json(nullptr)},
        });
      }

      actual["routeCollisions"] = ordered_json::array();
      for (const auto& collision : contract::find_route_collisions(result)) {
        actual["routeCollisions"].push_back({
          {"paths", string_array(collision.paths)},
          {"reason", collision.reason},
          {"route", collision.route},
          {"routes", string_array(collision.routes)},
        });
      }
    }

    CHECK(plain(actual) == plain(test_case["expect"]));
  }
}

TEST_CASE("contract vectors: signing") {
  const auto vectors = load("signing.json");

  for (const auto& test_case : vectors["sha256"]) {
    INFO("sha256 of " << test_case["input"].dump());
    CHECK(pmdocs::sha256_hex(test_case["input"].get<std::string>()) == test_case["expect"].get<std::string>());
  }

  for (const auto& test_case : vectors["canonical"]) {
    INFO("canonical for " << test_case["path"].dump());
    CHECK(pmdocs::build_canonical_signing_string(
      test_case["bodySha256"].get<std::string>(),
      test_case["method"].get<std::string>(),
      test_case["path"].get<std::string>(),
      test_case["timestamp"].get<std::string>(),
      test_case["nonce"].get<std::string>()
    ) == test_case["expect"].get<std::string>());
  }

  for (const auto& test_case : vectors["endpointPath"]) {
    INFO("endpoint " << test_case["endpoint"].get<std::string>());
    CHECK(pmdocs::endpoint_path(test_case["endpoint"].get<std::string>()) == test_case["expect"].get<std::string>());
  }

  const auto& key = vectors["key"];
  const auto& request = vectors["request"];

  for (const auto* key_field : {"privateKeyPem", "privateKeyBase64Der", "privateKeyOpenSsh"}) {
    INFO("signing with " << key_field);
    const auto signed_request = pmdocs::sign_docs_sync_request(
      request["body"].get<std::string>(),
      request["endpoint"].get<std::string>(),
      request["keyId"].get<std::string>(),
      key[key_field].get<std::string>(),
      request["nonce"].get<std::string>(),
      request["timestamp"].get<std::string>()
    );
    ordered_json headers = ordered_json::object();

    for (const auto& [name, value] : signed_request.headers) {
      headers[name] = value;
    }

    CHECK(plain(headers) == plain(request["expect"]["headers"]));
  }

  CHECK(pmdocs::build_canonical_signing_string(
    pmdocs::sha256_hex(request["body"].get<std::string>()),
    "POST",
    pmdocs::endpoint_path(request["endpoint"].get<std::string>()),
    request["timestamp"].get<std::string>(),
    request["nonce"].get<std::string>()
  ) == request["expect"]["canonical"].get<std::string>());
  CHECK(contract::verify_ed25519_signature(
    key["publicKeyPem"].get<std::string>(),
    request["expect"]["canonical"].get<std::string>(),
    request["expect"]["headers"]["X-VL-MD-DOCS-Signature"].get<std::string>()
  ));
  CHECK_FALSE(contract::verify_ed25519_signature(
    key["publicKeyPem"].get<std::string>(),
    request["expect"]["canonical"].get<std::string>() + "x",
    request["expect"]["headers"]["X-VL-MD-DOCS-Signature"].get<std::string>()
  ));
}

TEST_CASE("contract vectors: limits") {
  const auto vectors = load("limits.json");
  CHECK(vectors["defaultMaxBodyBytes"].get<std::size_t>() == contract::kDefaultMaxBodyBytes);

  for (const auto& test_case : vectors["serialization"]) {
    INFO(test_case["name"].get<std::string>());
    const auto body = contract::serialize_body(test_case["manifest"]);
    std::size_t content_bytes = 0;

    for (const auto& file : test_case["manifest"]["files"]) {
      content_bytes += file["content"].get<std::string>().size();
    }

    if (test_case["manifest"].contains("assets")) {
      for (const auto& asset : test_case["manifest"]["assets"]) {
        content_bytes += asset["content"].get<std::string>().size();
      }
    }

    CHECK(body.size() == test_case["expect"]["bodyBytes"].get<std::size_t>());
    CHECK(content_bytes == test_case["expect"]["contentBytes"].get<std::size_t>());
    CHECK(pmdocs::sha256_hex(body) == test_case["expect"]["sha256"].get<std::string>());
  }

  for (const auto& test_case : vectors["decisions"]) {
    const auto too_large = test_case["bodyBytes"].get<std::size_t>() > test_case["maxBodyBytes"].get<std::size_t>();
    CHECK(too_large == test_case["expect"]["tooLarge"].get<bool>());
  }
}

TEST_CASE("contract vectors: content types") {
  const auto vectors = load("content-types.json");

  for (const auto& test_case : vectors["byPath"]) {
    INFO(test_case["path"].get<std::string>());
    CHECK(contract::asset_content_type(test_case["path"].get<std::string>()) == test_case["expect"].get<std::string>());
  }

  for (const auto& test_case : vectors["allowed"]) {
    INFO(test_case["contentType"].get<std::string>());
    CHECK(contract::is_allowed_asset_content_type(test_case["contentType"].get<std::string>()) == test_case["expect"].get<bool>());
  }
}

TEST_CASE("contract vectors: utf-8") {
  const auto vectors = load("utf8.json");

  for (const auto& test_case : vectors["cases"]) {
    INFO(test_case["hex"].get<std::string>());
    const auto bytes = from_hex(test_case["hex"].get<std::string>());
    const std::string value{bytes.begin(), bytes.end()};
    CHECK(contract::is_valid_utf8(value) == test_case["expect"]["valid"].get<bool>());
  }
}
