#pragma once

// The docs sync protocol semantics shared with the Payload server
// (src/sync/*). Every function here has a TypeScript twin; the shared
// vectors in contracts/vectors/ pin both (see contracts/README.md).

#include <nlohmann/json.hpp>

#include <cstddef>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace pmdocs::contract {

using json = nlohmann::ordered_json;

constexpr std::size_t kDefaultMaxFileBytes = 500'000;
constexpr std::size_t kDefaultMaxFiles = 500;
constexpr std::size_t kDefaultMaxTotalBytes = 5'000'000;
constexpr std::size_t kDefaultMaxBodyBytes = 5'000'000;

struct Issue {
  std::string code;
  std::string message;
  std::optional<std::string> path;
};

struct NormalizedPath {
  bool ok = false;
  std::string path;
  std::vector<std::string> route_segments;
  std::string code;
  std::string message;
};

struct NormalizedAssetPath {
  bool ok = false;
  std::string path;
  std::vector<std::string> segments;
  std::string code;
  std::string message;
};

struct Frontmatter {
  std::vector<std::string> dependencies;
  bool has_dependencies = false;
  std::optional<std::string> description;
  std::optional<bool> draft;
  std::optional<std::string> nav_title;
  std::optional<double> order;
  std::vector<std::string> redirect_from;
  bool has_redirect_from = false;
  std::optional<std::string> slug;
  std::optional<std::string> status;
  std::vector<std::string> tags;
  bool has_tags = false;
  std::optional<std::string> title;
};

struct ParsedFrontmatter {
  std::string content;
  Frontmatter frontmatter;
  std::vector<Issue> issues;
  std::vector<Issue> warnings;
};

struct RouteSegmentCheck {
  std::vector<std::string> unservable;
  std::vector<std::string> whitespace;
};

struct AssetRouteResult {
  bool ok = false;
  std::optional<std::string> route;
  std::string code;
  std::string message;
  std::optional<Issue> warning;
};

struct ValidatedFile {
  std::string content;
  Frontmatter frontmatter;
  std::string path;
  std::string route;
  std::string sha256;
  std::string title;
};

struct ValidatedAsset {
  std::string content;
  std::string content_type;
  std::string kind;
  std::string path;
  std::optional<std::string> route;
  std::string sha256;
};

struct ValidationOptions {
  std::optional<std::vector<std::string>> allowed_source_ids;
  std::string asset_route_base;
  std::size_t max_assets = kDefaultMaxFiles;
  std::size_t max_file_bytes = kDefaultMaxFileBytes;
  std::size_t max_files = kDefaultMaxFiles;
  std::size_t max_total_bytes = kDefaultMaxTotalBytes;
  std::string route_base;
};

struct ValidationResult {
  std::vector<ValidatedAsset> assets;
  std::string delete_behavior = "archive";
  std::vector<ValidatedFile> files;
  bool mode_dry_run = true;
  bool ok = false;
  bool publish = false;
  std::string source_id;
  std::optional<std::string> source_branch;
  std::optional<std::string> source_commit;
  std::optional<std::string> source_repository;
  std::vector<Issue> issues;
  std::vector<Issue> warnings;
};

struct RouteCollision {
  std::vector<std::string> paths;
  std::string reason;
  std::string route;
  std::vector<std::string> routes;
};

// Text primitives.
std::string js_trim(std::string_view value);
std::string js_trim_start(std::string_view value);
std::string strip_byte_order_mark(std::string_view value);
std::vector<std::string> split_markdown_lines(std::string_view value);
bool is_valid_utf8(std::string_view value);
std::string sanitize_utf8(std::string_view value);

// Paths and routes.
NormalizedPath normalize_docs_path(std::string_view input);
NormalizedAssetPath normalize_asset_path(std::string_view input);
std::string normalize_route_path(std::string_view route);
std::string join_route_paths(const std::vector<std::string>& segments);
bool is_route_descendant_or_equal(std::string_view parent, std::string_view child);
std::string derive_route_from_source_path(
  const std::string& source_path,
  const std::string& route_base,
  const std::optional<std::string>& slug
);
RouteSegmentCheck check_route_segments(
  const std::string& source_path,
  const std::string& route_base,
  const std::optional<std::string>& slug
);
std::optional<std::string> derive_asset_route(
  const std::string& kind,
  const std::string& asset_route_base,
  const std::string& source_id,
  const std::string& source_path
);
AssetRouteResult resolve_asset_route(
  const std::string& kind,
  const std::optional<std::string>& route,
  const std::string& asset_route_base,
  const std::string& source_id,
  const std::string& source_path
);

// Frontmatter and titles.
ParsedFrontmatter parse_frontmatter(const std::string& markdown, const std::optional<std::string>& path = std::nullopt);
std::optional<double> parse_js_number(std::string_view value);
std::string strip_inline_markdown(std::string_view value);
std::optional<std::string> infer_title_from_markdown(std::string_view content);
std::string title_from_source_path(const std::string& source_path);
std::string resolve_title(const ParsedFrontmatter& parsed, const std::string& source_path);
json frontmatter_to_json(const Frontmatter& frontmatter);

// Assets.
std::string asset_content_type(std::string_view asset_path);
bool is_allowed_asset_content_type(std::string_view content_type);

// Manifests.
bool is_valid_delete_behavior(const std::string& value);
ValidationResult validate_manifest(const json& manifest, const ValidationOptions& options);
std::vector<RouteCollision> find_route_collisions(const ValidationResult& validation);
std::string serialize_body(const json& manifest);

// Signing helpers used by the vectors.
bool verify_ed25519_signature(
  const std::string& public_key_pem,
  std::string_view message,
  const std::string& signature_base64
);

} // namespace pmdocs::contract
