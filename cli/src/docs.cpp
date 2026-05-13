#include "pmdocs/docs.hpp"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <array>
#include <bit>
#include <cctype>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iterator>
#include <limits>
#include <map>
#include <optional>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <system_error>
#include <utility>
#include <vector>

namespace pmdocs {
namespace {

using json = nlohmann::ordered_json;

constexpr std::size_t kDefaultMaxFileBytes = 500'000;
constexpr std::size_t kDefaultMaxFiles = 500;
constexpr std::size_t kDefaultMaxTotalBytes = 5'000'000;

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

struct Frontmatter {
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

struct WalkedDocsFile {
  std::string content;
  std::string path;
};

struct AiExportManifest {
  std::optional<std::string> canonical;
  std::optional<std::string> description;
  std::vector<std::string> exclude;
  std::string heading_mode = "normalize";
  std::vector<std::string> order;
  std::string orphans = "append";
  std::optional<std::string> output;
  std::optional<std::string> preamble;
  std::string source_path = "index.ai.yml";
  std::optional<std::string> title;
};

struct AiExportReadResult {
  std::optional<AiExportManifest> manifest;
  bool ok = true;
  std::vector<Issue> issues;
  std::vector<Issue> warnings;
};

struct ValidatedFile {
  std::string content;
  Frontmatter frontmatter;
  std::string path;
  std::string route;
  std::string sha256;
  std::string title;
};

struct ValidationResult {
  std::optional<json> ai_export;
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

struct ExistingRecord {
  std::optional<bool> archived;
  std::string route;
  std::optional<std::string> source_hash;
  std::string source_path;
  std::optional<std::string> status;
  std::optional<std::string> title;
};

struct PlannedChange {
  std::optional<ExistingRecord> current;
  std::optional<ValidatedFile> desired;
  std::string reason;
  std::string source_path;
};

struct Plan {
  std::vector<PlannedChange> archive;
  std::vector<PlannedChange> create;
  std::vector<PlannedChange> delete_items;
  std::vector<PlannedChange> draft;
  std::vector<PlannedChange> unchanged;
  std::vector<PlannedChange> update;
  std::vector<Issue> warnings;
};

std::string read_file(const std::filesystem::path& path) {
  std::ifstream input{path, std::ios::binary};

  if (!input) {
    throw std::runtime_error{"Could not read file: " + path.string()};
  }

  std::ostringstream out;
  out << input.rdbuf();

  return out.str();
}

std::string trim(std::string_view value) {
  const auto first = value.find_first_not_of(" \t\r\n");

  if (first == std::string_view::npos) {
    return {};
  }

  const auto last = value.find_last_not_of(" \t\r\n");

  return std::string{value.substr(first, last - first + 1)};
}

bool starts_with(std::string_view value, std::string_view prefix) {
  return value.substr(0, prefix.size()) == prefix;
}

bool ends_with(std::string_view value, std::string_view suffix) {
  return value.size() >= suffix.size() && value.substr(value.size() - suffix.size()) == suffix;
}

std::vector<std::string> split_lines(std::string_view input) {
  std::vector<std::string> lines;
  std::string normalized;
  normalized.reserve(input.size());

  for (std::size_t index = 0; index < input.size(); ++index) {
    const auto ch = input[index];

    if (ch == '\r') {
      if (index + 1 < input.size() && input[index + 1] == '\n') {
        continue;
      }

      normalized.push_back('\n');
      continue;
    }

    normalized.push_back(ch);
  }

  std::string current;

  for (const auto ch : normalized) {
    if (ch == '\n') {
      lines.push_back(current);
      current.clear();
      continue;
    }

    current.push_back(ch);
  }

  lines.push_back(current);

  return lines;
}

std::string join_lines(const std::vector<std::string>& lines, std::size_t start) {
  std::ostringstream out;

  for (std::size_t index = start; index < lines.size(); ++index) {
    if (index > start) {
      out << '\n';
    }

    out << lines[index];
  }

  auto content = out.str();

  if (starts_with(content, "\n")) {
    content.erase(0, 1);
  }

  return content;
}

std::string strip_quotes(std::string_view value) {
  auto stripped = trim(value);

  if (stripped.size() >= 2) {
    const auto first = stripped.front();
    const auto last = stripped.back();

    if ((first == '"' && last == '"') || (first == '\'' && last == '\'')) {
      stripped = stripped.substr(1, stripped.size() - 2);
    }
  }

  return stripped;
}

std::string trim_comment(std::string value) {
  for (std::size_t index = 0; index + 1 < value.size(); ++index) {
    if (std::isspace(static_cast<unsigned char>(value[index])) && value[index + 1] == '#') {
      value.resize(index);
      break;
    }
  }

  while (!value.empty() && std::isspace(static_cast<unsigned char>(value.back()))) {
    value.pop_back();
  }

  return value;
}

std::string unquote_manifest_value(std::string_view value) {
  return strip_quotes(trim_comment(trim(value)));
}

std::vector<std::string> split_path(std::string_view path) {
  std::vector<std::string> segments;
  std::string current;

  for (const auto ch : path) {
    if (ch == '/') {
      segments.push_back(current);
      current.clear();
      continue;
    }

    current.push_back(ch);
  }

  segments.push_back(current);

  return segments;
}

std::string normalize_slashes(std::string value) {
  for (auto& ch : value) {
    if (ch == '\\') {
      ch = '/';
    }
  }

  std::string normalized;
  normalized.reserve(value.size());
  bool previous_slash = false;

  for (const auto ch : value) {
    if (ch == '/') {
      if (!previous_slash) {
        normalized.push_back(ch);
      }

      previous_slash = true;
      continue;
    }

    previous_slash = false;
    normalized.push_back(ch);
  }

  return normalized;
}

NormalizedPath normalize_docs_path(std::string_view input) {
  if (trim(input).empty()) {
    return {
      .code = "invalid_path",
      .message = "Docs path must be a non-empty string.",
    };
  }

  auto normalized = normalize_slashes(trim(input));

  if (normalized.size() >= 3 && std::isalpha(static_cast<unsigned char>(normalized[0])) && normalized[1] == ':' && normalized[2] == '/') {
    return {
      .code = "invalid_path",
      .message = "Docs path must not be an absolute Windows path.",
    };
  }

  if (starts_with(normalized, "/")) {
    return {
      .code = "invalid_path",
      .message = "Docs path must not be an absolute path.",
    };
  }

  while (starts_with(normalized, "./")) {
    normalized.erase(0, 2);
  }

  if (normalized.empty() || ends_with(normalized, "/")) {
    return {
      .code = "invalid_path",
      .message = "Docs path must point to a Markdown file.",
    };
  }

  const auto segments = split_path(normalized);

  for (const auto& segment : segments) {
    if (segment == "..") {
      return {
        .code = "path_traversal",
        .message = "Docs path must not contain path traversal segments.",
      };
    }

    if (segment.empty() || segment == ".") {
      return {
        .code = "invalid_path",
        .message = "Docs path contains an invalid path segment.",
      };
    }
  }

  if (!ends_with(normalized, ".md")) {
    return {
      .code = "non_markdown_file",
      .message = "Docs path must end in .md.",
    };
  }

  const auto& file_name = segments.back();

  if (file_name == ".md") {
    return {
      .code = "invalid_path",
      .message = "Docs path must include a Markdown filename.",
    };
  }

  auto route_segments = segments;
  route_segments.back() = route_segments.back().substr(0, route_segments.back().size() - 3);

  if (!route_segments.empty() && route_segments.back() == "index") {
    route_segments.pop_back();
  }

  return {
    .ok = true,
    .path = normalized,
    .route_segments = route_segments,
  };
}

std::string normalize_route_base(std::string route_base) {
  route_base = normalize_slashes(trim(route_base));
  route_base = "/" + route_base;
  route_base = normalize_slashes(route_base);

  while (route_base.size() > 1 && route_base.back() == '/') {
    route_base.pop_back();
  }

  return route_base.empty() ? "/" : route_base;
}

std::string normalize_route_like_path(std::optional<std::string> value) {
  if (!value || value->empty()) {
    return {};
  }

  const auto trimmed = trim(*value);

  if (trimmed.find("://") != std::string::npos) {
    return trimmed;
  }

  return normalize_route_base(trimmed);
}

std::string derive_route_from_source_path(const std::string& source_path, const std::string& route_base, const std::optional<std::string>& slug) {
  const auto normalized_path = normalize_docs_path(source_path);
  const auto normalized_route_base = normalize_route_base(route_base);

  if (!normalized_path.ok) {
    return normalized_route_base;
  }

  auto route_segments = normalized_path.route_segments;
  auto base_segments = split_path(normalized_route_base.substr(1));

  if (base_segments.size() == 1 && base_segments.front().empty()) {
    base_segments.clear();
  }

  if (base_segments.size() <= route_segments.size()) {
    bool has_base_prefix = true;

    for (std::size_t index = 0; index < base_segments.size(); ++index) {
      if (route_segments[index] != base_segments[index]) {
        has_base_prefix = false;
        break;
      }
    }

    if (has_base_prefix) {
      route_segments.erase(route_segments.begin(), route_segments.begin() + static_cast<std::ptrdiff_t>(base_segments.size()));
    }
  }

  if (slug && !slug->empty()) {
    if (!route_segments.empty()) {
      route_segments.back() = *slug;
    } else {
      route_segments.push_back(*slug);
    }
  }

  if (route_segments.empty()) {
    return normalized_route_base;
  }

  std::ostringstream suffix;

  for (std::size_t index = 0; index < route_segments.size(); ++index) {
    if (index > 0) {
      suffix << '/';
    }

    suffix << route_segments[index];
  }

  return normalize_slashes(normalized_route_base + "/" + suffix.str());
}

Issue issue(std::string code, std::string message, std::optional<std::string> path = std::nullopt) {
  return {
    .code = std::move(code),
    .message = std::move(message),
    .path = std::move(path),
  };
}

json issue_to_json(const Issue& item) {
  json output = {
    {"code", item.code},
    {"message", item.message},
  };

  if (item.path) {
    output["path"] = *item.path;
  }

  return output;
}

json issues_to_json(const std::vector<Issue>& issues) {
  json output = json::array();

  for (const auto& item : issues) {
    output.push_back(issue_to_json(item));
  }

  return output;
}

std::string format_issue(const Issue& item) {
  if (item.path) {
    return "- " + *item.path + ": " + item.message;
  }

  return "- " + item.message;
}

std::string format_issues(const std::vector<Issue>& issues) {
  std::ostringstream out;

  for (std::size_t index = 0; index < issues.size(); ++index) {
    if (index > 0) {
      out << '\n';
    }

    out << format_issue(issues[index]);
  }

  return out.str();
}

bool is_frontmatter_key(std::string_view value) {
  if (value.empty() || !std::isalpha(static_cast<unsigned char>(value.front()))) {
    return false;
  }

  return std::ranges::all_of(value, [](const auto ch) {
    return std::isalnum(static_cast<unsigned char>(ch));
  });
}

std::optional<Issue> assign_frontmatter_value(Frontmatter& frontmatter, const std::string& key, const std::string& raw_value, const std::optional<std::string>& path) {
  const auto value = strip_quotes(raw_value);

  if (key == "description") {
    frontmatter.description = value;
    return std::nullopt;
  }

  if (key == "navTitle") {
    frontmatter.nav_title = value;
    return std::nullopt;
  }

  if (key == "slug") {
    frontmatter.slug = value;
    return std::nullopt;
  }

  if (key == "title") {
    frontmatter.title = value;
    return std::nullopt;
  }

  if (key == "draft") {
    if (value == "true" || value == "false") {
      frontmatter.draft = value == "true";
      return std::nullopt;
    }

    return issue("invalid_frontmatter", "Frontmatter field \"draft\" must be a boolean.", path);
  }

  if (key == "order") {
    try {
      std::size_t consumed = 0;
      const auto parsed = std::stod(value, &consumed);

      if (consumed == value.size() && std::isfinite(parsed)) {
        frontmatter.order = parsed;
        return std::nullopt;
      }
    } catch (...) {
    }

    return issue("invalid_frontmatter", "Frontmatter field \"order\" must be a number.", path);
  }

  if (key == "status") {
    if (value == "draft" || value == "published") {
      frontmatter.status = value;
      return std::nullopt;
    }

    return issue("invalid_frontmatter", "Frontmatter field \"status\" must be \"draft\" or \"published\".", path);
  }

  return std::nullopt;
}

std::vector<Issue> validate_frontmatter(const Frontmatter& frontmatter, const std::optional<std::string>& path) {
  std::vector<Issue> issues;

  if (frontmatter.slug) {
    const auto& slug = *frontmatter.slug;
    const auto valid = !slug.empty() && std::ranges::all_of(slug, [](const auto ch) {
      return std::isalnum(static_cast<unsigned char>(ch)) || ch == '-';
    });

    if (!valid || !std::isalnum(static_cast<unsigned char>(slug.front()))) {
      issues.push_back(issue("invalid_frontmatter", "Frontmatter field \"slug\" must contain only letters, numbers, and hyphens.", path));
    }
  }

  return issues;
}

ParsedFrontmatter parse_frontmatter(const std::string& markdown, std::optional<std::string> path = std::nullopt) {
  ParsedFrontmatter result;
  result.content = markdown;

  if (!starts_with(markdown, "---\n") && !starts_with(markdown, "---\r\n")) {
    return result;
  }

  const auto lines = split_lines(markdown);
  std::optional<std::size_t> closing_index;

  for (std::size_t index = 1; index < lines.size(); ++index) {
    if (trim(lines[index]) == "---") {
      closing_index = index;
      break;
    }
  }

  if (!closing_index) {
    result.issues.push_back(issue("invalid_frontmatter", "Frontmatter block is missing a closing delimiter.", path));
    return result;
  }

  std::optional<std::string> current_array_key;
  static const std::set<std::string> known_fields = {
    "description",
    "draft",
    "navTitle",
    "order",
    "redirectFrom",
    "slug",
    "status",
    "tags",
    "title",
  };
  static const std::set<std::string> array_fields = {"redirectFrom", "tags"};

  for (std::size_t index = 1; index < *closing_index; ++index) {
    const auto& line = lines[index];

    if (trim(line).empty()) {
      continue;
    }

    auto trimmed_start = line;
    trimmed_start.erase(trimmed_start.begin(), std::ranges::find_if(trimmed_start, [](const auto ch) {
      return !std::isspace(static_cast<unsigned char>(ch));
    }));

    if (starts_with(trimmed_start, "- ")) {
      if (!current_array_key) {
        result.issues.push_back(issue("invalid_frontmatter", "Frontmatter array item does not belong to a supported array field.", path));
        continue;
      }

      if (*current_array_key == "redirectFrom") {
        result.frontmatter.redirect_from.push_back(strip_quotes(trimmed_start.substr(2)));
      } else if (*current_array_key == "tags") {
        result.frontmatter.tags.push_back(strip_quotes(trimmed_start.substr(2)));
      }

      continue;
    }

    const auto separator = line.find(':');
    const auto key = separator == std::string::npos ? std::string{} : trim(std::string_view{line}.substr(0, separator));
    const auto raw_value = separator == std::string::npos ? std::string{} : trim(std::string_view{line}.substr(separator + 1));

    if (!is_frontmatter_key(key)) {
      result.issues.push_back(issue("invalid_frontmatter", "Unsupported frontmatter line: " + line, path));
      current_array_key.reset();
      continue;
    }

    current_array_key.reset();

    if (!known_fields.contains(key)) {
      result.warnings.push_back(issue("invalid_frontmatter", "Unknown frontmatter field \"" + key + "\" was ignored.", path));
      continue;
    }

    if (array_fields.contains(key)) {
      if (!trim(raw_value).empty()) {
        result.issues.push_back(issue("invalid_frontmatter", "Frontmatter field \"" + key + "\" must use list item syntax.", path));
        continue;
      }

      current_array_key = key;

      if (key == "redirectFrom") {
        result.frontmatter.has_redirect_from = true;
        result.frontmatter.redirect_from.clear();
      } else {
        result.frontmatter.has_tags = true;
        result.frontmatter.tags.clear();
      }

      continue;
    }

    if (auto field_issue = assign_frontmatter_value(result.frontmatter, key, raw_value, path)) {
      result.issues.push_back(std::move(*field_issue));
    }
  }

  auto more_issues = validate_frontmatter(result.frontmatter, path);
  result.issues.insert(result.issues.end(), more_issues.begin(), more_issues.end());
  result.content = join_lines(lines, *closing_index + 1);

  return result;
}

std::optional<std::string> infer_title_from_markdown(const std::string& content) {
  for (const auto& line : split_lines(content)) {
    const auto trimmed = trim(line);

    if (starts_with(trimmed, "# ") && !starts_with(trimmed, "##")) {
      auto title = trim(std::string_view{trimmed}.substr(2));

      while (!title.empty() && title.back() == '#') {
        title.pop_back();
      }

      title = trim(title);

      if (!title.empty()) {
        return title;
      }
    }
  }

  return std::nullopt;
}

std::string title_from_source_path(const std::string& source_path) {
  const auto normalized = normalize_docs_path(source_path);

  if (!normalized.ok) {
    return "Untitled";
  }

  const auto segments = split_path(normalized.path);
  auto base = segments.back() == "index.md" && segments.size() > 1 ? segments[segments.size() - 2] : segments.back();

  if (ends_with(base, ".md")) {
    base.resize(base.size() - 3);
  }

  std::ostringstream title;
  std::string part;
  bool first = true;

  const auto flush = [&]() {
    if (part.empty()) {
      return;
    }

    if (!first) {
      title << ' ';
    }

    part[0] = static_cast<char>(std::toupper(static_cast<unsigned char>(part[0])));
    title << part;
    first = false;
    part.clear();
  };

  for (const auto ch : base) {
    if (ch == '-' || ch == '_' || std::isspace(static_cast<unsigned char>(ch))) {
      flush();
      continue;
    }

    part.push_back(ch);
  }

  flush();

  auto output = title.str();
  return output.empty() ? "Untitled" : output;
}

std::string resolve_title(const ParsedFrontmatter& parsed, const std::string& source_path) {
  if (parsed.frontmatter.title) {
    return *parsed.frontmatter.title;
  }

  if (const auto inferred = infer_title_from_markdown(parsed.content)) {
    return *inferred;
  }

  return title_from_source_path(source_path);
}

json frontmatter_to_json(const Frontmatter& frontmatter) {
  json output = json::object();

  if (frontmatter.description) {
    output["description"] = *frontmatter.description;
  }
  if (frontmatter.draft) {
    output["draft"] = *frontmatter.draft;
  }
  if (frontmatter.nav_title) {
    output["navTitle"] = *frontmatter.nav_title;
  }
  if (frontmatter.order) {
    output["order"] = *frontmatter.order;
  }
  if (frontmatter.has_redirect_from) {
    output["redirectFrom"] = frontmatter.redirect_from;
  }
  if (frontmatter.slug) {
    output["slug"] = *frontmatter.slug;
  }
  if (frontmatter.status) {
    output["status"] = *frontmatter.status;
  }
  if (frontmatter.has_tags) {
    output["tags"] = frontmatter.tags;
  }
  if (frontmatter.title) {
    output["title"] = *frontmatter.title;
  }

  return output;
}

json ai_export_to_json(const AiExportManifest& manifest) {
  json output = json::object();
  output["version"] = 1;

  if (manifest.title) {
    output["title"] = *manifest.title;
  }
  if (manifest.canonical) {
    output["canonical"] = *manifest.canonical;
  }
  if (manifest.output) {
    output["output"] = *manifest.output;
  }
  if (manifest.description) {
    output["description"] = *manifest.description;
  }
  if (manifest.preamble) {
    output["preamble"] = *manifest.preamble;
  }

  output["order"] = manifest.order;
  output["exclude"] = manifest.exclude;
  output["orphans"] = manifest.orphans;
  output["headingMode"] = manifest.heading_mode;
  output["sourcePath"] = manifest.source_path;

  return output;
}

std::string json_string(const json& value, bool pretty) {
  return value.dump(pretty ? 2 : -1) + "\n";
}

std::string get_repository_name() {
  const auto* repository = std::getenv("GITHUB_REPOSITORY");

  if (repository == nullptr || *repository == '\0') {
    return {};
  }

  const std::string value{repository};
  const auto slash = value.find('/');

  if (slash == std::string::npos) {
    return value;
  }

  return value.substr(slash + 1);
}

std::string default_source_id(const std::filesystem::path& docs_root) {
  if (const auto repository = get_repository_name(); !repository.empty()) {
    return repository;
  }

  const auto name = std::filesystem::absolute(docs_root).filename().string();

  return name == "docs" ? "local-docs" : name;
}

std::string source_id_for(const DocsCommandOptions& options) {
  if (options.source_id && !options.source_id->empty()) {
    return *options.source_id;
  }

  return default_source_id(options.docs_root);
}

std::vector<WalkedDocsFile> walk_docs_files(const std::filesystem::path& root) {
  static const std::set<std::string> ignored_directories = {".git", ".next", "build", "dist", "node_modules"};
  const auto absolute_root = std::filesystem::absolute(root).lexically_normal();
  std::error_code error;

  if (!std::filesystem::is_directory(absolute_root, error)) {
    throw std::runtime_error{"Docs root is not a directory: " + root.string()};
  }

  std::vector<WalkedDocsFile> files;
  std::filesystem::recursive_directory_iterator iterator{absolute_root, error};
  const std::filesystem::recursive_directory_iterator end;

  if (error) {
    throw std::runtime_error{"Could not read docs root: " + error.message()};
  }

  for (; iterator != end; iterator.increment(error)) {
    if (error) {
      throw std::runtime_error{"Could not walk docs root: " + error.message()};
    }

    const auto& entry = *iterator;
    const auto status = entry.symlink_status(error);

    if (error) {
      throw std::runtime_error{"Could not inspect docs entry: " + error.message()};
    }

    if (std::filesystem::is_symlink(status)) {
      if (std::filesystem::is_directory(entry.path(), error)) {
        iterator.disable_recursion_pending();
      }

      continue;
    }

    if (std::filesystem::is_directory(status)) {
      if (ignored_directories.contains(entry.path().filename().string())) {
        iterator.disable_recursion_pending();
      }

      continue;
    }

    if (!std::filesystem::is_regular_file(status) || entry.path().extension() != ".md") {
      continue;
    }

    auto relative = std::filesystem::relative(entry.path(), absolute_root, error);

    if (error) {
      throw std::runtime_error{"Could not compute docs relative path: " + error.message()};
    }

    const auto normalized = normalize_docs_path(relative.generic_string());

    if (!normalized.ok) {
      throw std::runtime_error{normalized.message};
    }

    files.push_back({
      .content = read_file(entry.path()),
      .path = normalized.path,
    });
  }

  std::ranges::sort(files, {}, &WalkedDocsFile::path);

  return files;
}

std::optional<std::pair<std::string, std::string>> top_level_key_line(const std::string& line) {
  if (!line.empty() && std::isspace(static_cast<unsigned char>(line.front()))) {
    return std::nullopt;
  }

  const auto separator = line.find(':');

  if (separator == std::string::npos || separator == 0) {
    return std::nullopt;
  }

  const auto key = line.substr(0, separator);

  if (key.empty() || !std::isalpha(static_cast<unsigned char>(key.front()))) {
    return std::nullopt;
  }

  if (!std::ranges::all_of(key, [](const auto ch) {
    return std::isalnum(static_cast<unsigned char>(ch));
  })) {
    return std::nullopt;
  }

  return std::pair{key, trim(std::string_view{line}.substr(separator + 1))};
}

std::vector<std::string> strip_common_indent(std::vector<std::string> lines) {
  std::optional<std::size_t> common_indent;

  for (const auto& line : lines) {
    if (trim(line).empty()) {
      continue;
    }

    std::size_t indent = 0;
    while (indent < line.size() && line[indent] == ' ') {
      ++indent;
    }

    common_indent = common_indent ? std::min(*common_indent, indent) : indent;
  }

  if (!common_indent || *common_indent == 0) {
    return lines;
  }

  for (auto& line : lines) {
    if (line.size() >= *common_indent) {
      line.erase(0, *common_indent);
    }
  }

  return lines;
}

std::vector<std::string> strip_outer_blank_lines(std::vector<std::string> lines) {
  while (!lines.empty() && trim(lines.front()).empty()) {
    lines.erase(lines.begin());
  }

  while (!lines.empty() && trim(lines.back()).empty()) {
    lines.pop_back();
  }

  return lines;
}

std::string fold_block_lines(const std::vector<std::string>& lines) {
  std::vector<std::string> paragraphs;
  std::vector<std::string> current;

  for (const auto& line : lines) {
    if (trim(line).empty()) {
      if (!current.empty()) {
        std::ostringstream paragraph;
        for (std::size_t index = 0; index < current.size(); ++index) {
          if (index > 0) {
            paragraph << ' ';
          }
          paragraph << trim(current[index]);
        }
        paragraphs.push_back(paragraph.str());
        current.clear();
      }
      paragraphs.emplace_back();
      continue;
    }

    current.push_back(line);
  }

  if (!current.empty()) {
    std::ostringstream paragraph;
    for (std::size_t index = 0; index < current.size(); ++index) {
      if (index > 0) {
        paragraph << ' ';
      }
      paragraph << trim(current[index]);
    }
    paragraphs.push_back(paragraph.str());
  }

  std::ostringstream out;
  for (std::size_t index = 0; index < paragraphs.size(); ++index) {
    if (index > 0) {
      out << '\n';
    }
    out << paragraphs[index];
  }

  return trim(out.str());
}

std::pair<std::string, std::size_t> collect_block(const std::vector<std::string>& lines, std::size_t start, char style) {
  std::vector<std::string> block_lines;
  auto index = start;

  while (index < lines.size()) {
    if (top_level_key_line(lines[index])) {
      break;
    }

    block_lines.push_back(lines[index]);
    ++index;
  }

  auto stripped = strip_outer_blank_lines(strip_common_indent(std::move(block_lines)));

  if (style == '|') {
    std::ostringstream out;
    for (std::size_t line_index = 0; line_index < stripped.size(); ++line_index) {
      if (line_index > 0) {
        out << '\n';
      }
      out << stripped[line_index];
    }

    return {out.str(), index};
  }

  return {fold_block_lines(stripped), index};
}

std::pair<std::vector<std::string>, std::size_t> collect_list(const std::vector<std::string>& lines, std::size_t start) {
  std::vector<std::string> values;
  auto index = start;
  bool saw_list = false;

  while (index < lines.size()) {
    const auto line = lines[index];

    if (trim(line).empty()) {
      ++index;
      continue;
    }

    if (top_level_key_line(line)) {
      break;
    }

    auto trimmed_start = line;
    trimmed_start.erase(trimmed_start.begin(), std::ranges::find_if(trimmed_start, [](const auto ch) {
      return !std::isspace(static_cast<unsigned char>(ch));
    }));

    if (trimmed_start.size() < 2 || (trimmed_start[0] != '-' && trimmed_start[0] != '*') || trimmed_start[1] != ' ') {
      break;
    }

    saw_list = true;
    values.push_back(unquote_manifest_value(trimmed_start.substr(2)));
    ++index;
  }

  return {saw_list ? values : std::vector<std::string>{}, saw_list ? index : start};
}

std::optional<std::vector<std::string>> parse_inline_array(const std::string& raw_value) {
  const auto cleaned = trim_comment(trim(raw_value));

  if (!starts_with(cleaned, "[") || !ends_with(cleaned, "]")) {
    return std::nullopt;
  }

  const auto body = trim(std::string_view{cleaned}.substr(1, cleaned.size() - 2));

  if (body.empty()) {
    return std::vector<std::string>{};
  }

  std::vector<std::string> values;
  std::string current;

  for (const auto ch : body) {
    if (ch == ',') {
      values.push_back(unquote_manifest_value(current));
      current.clear();
      continue;
    }

    current.push_back(ch);
  }

  values.push_back(unquote_manifest_value(current));

  return values;
}

std::optional<std::string> normalize_manifest_docs_path(std::vector<Issue>& issues, const std::string& path, const std::string& source_path) {
  auto trimmed_path = normalize_slashes(trim(path));

  if (starts_with(trimmed_path, "./")) {
    trimmed_path.erase(0, 2);
  }

  const auto normalized = normalize_docs_path(trimmed_path);

  if (!normalized.ok) {
    issues.push_back(issue("invalid_ai_export_manifest", "AI export manifest order path \"" + path + "\" is invalid: " + normalized.message, source_path));
    return std::nullopt;
  }

  return normalized.path;
}

std::optional<std::string> normalize_exclude_pattern(std::vector<Issue>& issues, const std::string& pattern, const std::string& source_path) {
  auto trimmed_pattern = normalize_slashes(trim(pattern));

  if (starts_with(trimmed_pattern, "./")) {
    trimmed_pattern.erase(0, 2);
  }

  if (trimmed_pattern.empty() || trimmed_pattern.find("..") != std::string::npos || starts_with(trimmed_pattern, "/")) {
    issues.push_back(issue("invalid_ai_export_manifest", "AI export manifest exclude pattern \"" + pattern + "\" is invalid.", source_path));
    return std::nullopt;
  }

  return trimmed_pattern;
}

AiExportReadResult validate_ai_export_manifest(const json& input, const std::string& source_path, const std::optional<std::set<std::string>>& known_docs_paths = std::nullopt) {
  AiExportReadResult result;
  result.manifest = AiExportManifest{.source_path = source_path};

  if (!input.is_object()) {
    result.ok = false;
    result.issues.push_back(issue("invalid_ai_export_manifest", "AI export manifest must be an object.", source_path));
    result.manifest.reset();
    return result;
  }

  if (!input.contains("version") || !input["version"].is_number_integer() || input["version"].get<int>() != 1) {
    result.issues.push_back(issue("invalid_ai_export_manifest", "AI export manifest version must be 1.", source_path));
  }

  auto get_optional_string = [&](const std::string& key) -> std::optional<std::string> {
    if (!input.contains(key)) {
      return std::nullopt;
    }

    if (input[key].is_string()) {
      const auto value = input[key].get<std::string>();
      return trim(value).empty() ? std::optional<std::string>{} : value;
    }

    result.issues.push_back(issue("invalid_ai_export_manifest", "AI export manifest field \"" + key + "\" must be a string.", source_path));
    return std::nullopt;
  };

  auto get_string_array = [&](const std::string& key) {
    std::vector<std::string> values;

    if (!input.contains(key)) {
      return values;
    }

    if (!input[key].is_array()) {
      result.issues.push_back(issue("invalid_ai_export_manifest", "AI export manifest field \"" + key + "\" must be a list of strings.", source_path));
      return values;
    }

    for (const auto& item : input[key]) {
      if (!item.is_string()) {
        result.issues.push_back(issue("invalid_ai_export_manifest", "AI export manifest field \"" + key + "\" must be a list of strings.", source_path));
        return values;
      }

      values.push_back(item.get<std::string>());
    }

    return values;
  };

  if (input.contains("orphans")) {
    if (input["orphans"].is_string() && (input["orphans"] == "append" || input["orphans"] == "ignore")) {
      result.manifest->orphans = input["orphans"].get<std::string>();
    } else {
      result.issues.push_back(issue("invalid_ai_export_manifest", "AI export manifest orphans must be \"append\" or \"ignore\".", source_path));
    }
  }

  if (input.contains("headingMode")) {
    if (input["headingMode"].is_string() && (input["headingMode"] == "normalize" || input["headingMode"] == "preserve")) {
      result.manifest->heading_mode = input["headingMode"].get<std::string>();
    } else {
      result.issues.push_back(issue("invalid_ai_export_manifest", "AI export manifest headingMode must be \"normalize\" or \"preserve\".", source_path));
    }
  }

  for (const auto& item : get_string_array("order")) {
    if (auto normalized = normalize_manifest_docs_path(result.issues, item, source_path)) {
      result.manifest->order.push_back(*normalized);
    }
  }

  for (const auto& item : get_string_array("exclude")) {
    if (auto normalized = normalize_exclude_pattern(result.issues, item, source_path)) {
      result.manifest->exclude.push_back(*normalized);
    }
  }

  if (known_docs_paths) {
    for (const auto& ordered_path : result.manifest->order) {
      if (!known_docs_paths->contains(ordered_path)) {
        result.warnings.push_back(issue("missing_ai_export_order_path", "AI export manifest order path \"" + ordered_path + "\" does not exist in the docs files.", source_path));
      }
    }
  }

  result.manifest->title = get_optional_string("title");
  if (const auto canonical = normalize_route_like_path(get_optional_string("canonical")); !canonical.empty()) {
    result.manifest->canonical = canonical;
  }
  if (const auto output = normalize_route_like_path(get_optional_string("output")); !output.empty()) {
    result.manifest->output = output;
  }
  result.manifest->description = get_optional_string("description");
  result.manifest->preamble = get_optional_string("preamble");

  if (!result.issues.empty()) {
    result.ok = false;
    result.manifest.reset();
  }

  return result;
}

AiExportReadResult parse_ai_export_yaml(const std::string& content, const std::string& source_path) {
  json parsed = json::object();
  parsed["sourcePath"] = source_path;
  const auto lines = split_lines(content);
  std::size_t index = 0;

  while (index < lines.size()) {
    const auto line = lines[index];

    if (trim(line).empty() || starts_with(trim(std::string_view{line}), "#")) {
      ++index;
      continue;
    }

    const auto key_line = top_level_key_line(line);

    if (!key_line) {
      return {
        .ok = false,
        .issues = {issue("invalid_ai_export_manifest", "Could not parse AI export manifest line: " + trim(line), source_path)},
      };
    }

    const auto& [key, raw] = *key_line;

    if (raw == "|" || raw == ">") {
      const auto [value, next_index] = collect_block(lines, index + 1, raw[0]);
      parsed[key] = value;
      index = next_index;
      continue;
    }

    if (const auto inline_array = parse_inline_array(raw)) {
      parsed[key] = *inline_array;
      ++index;
      continue;
    }

    if (raw.empty()) {
      const auto [values, next_index] = collect_list(lines, index + 1);

      if (next_index != index + 1 || !values.empty()) {
        parsed[key] = values;
        index = next_index;
        continue;
      }
    }

    const auto scalar = unquote_manifest_value(raw);
    if (!scalar.empty() && std::ranges::all_of(scalar, [](const auto ch) {
      return std::isdigit(static_cast<unsigned char>(ch)) || ch == '-';
    })) {
      try {
        parsed[key] = std::stoi(scalar);
      } catch (...) {
        parsed[key] = scalar;
      }
    } else {
      parsed[key] = scalar;
    }

    ++index;
  }

  return validate_ai_export_manifest(parsed, source_path);
}

AiExportReadResult read_ai_export_manifest(const std::filesystem::path& root) {
  const std::array<std::string, 2> filenames = {"index.ai.yml", "index.ai.yaml"};
  std::vector<std::string> present;

  for (const auto& filename : filenames) {
    std::error_code error;
    if (std::filesystem::exists(root / filename, error)) {
      present.push_back(filename);
    }
  }

  if (present.empty()) {
    return {};
  }

  const auto selected = present.front();
  auto parsed = parse_ai_export_yaml(read_file(root / selected), selected);

  if (present.size() > 1) {
    parsed.warnings.push_back(issue("invalid_ai_export_manifest", "Both index.ai.yml and index.ai.yaml exist. Using index.ai.yml.", selected));
  }

  return parsed;
}

json source_to_json(const std::string& source_id, const DocsCommandOptions& options) {
  json source = json::object();
  source["id"] = source_id;

  if (options.branch) {
    source["branch"] = *options.branch;
  }
  if (options.commit) {
    source["commit"] = *options.commit;
  }
  if (options.repository) {
    source["repository"] = *options.repository;
  }

  return source;
}

json build_manifest(const std::vector<WalkedDocsFile>& files, const std::string& source_id, const DocsCommandOptions& options, const std::optional<AiExportManifest>& ai_export, const std::optional<std::string>& delete_behavior = std::nullopt) {
  json manifest = json::object();
  manifest["version"] = 1;
  manifest["source"] = source_to_json(source_id, options);
  if (delete_behavior) {
    manifest["deleteBehavior"] = *delete_behavior;
  }
  manifest["files"] = json::array();

  for (const auto& file : files) {
    manifest["files"].push_back({
      {"path", file.path},
      {"content", file.content},
      {"sha256", sha256_hex(file.content)},
    });
  }

  if (ai_export) {
    manifest["aiExport"] = ai_export_to_json(*ai_export);
  }

  return manifest;
}

bool is_valid_delete_behavior(const std::string& value) {
  return value == "archive" || value == "delete" || value == "draft" || value == "ignore";
}

ValidationResult validate_manifest(const json& manifest, const DocsCommandOptions& options, const std::string& route_base) {
  ValidationResult result;
  const auto max_file_bytes = options.max_file_bytes.value_or(kDefaultMaxFileBytes);
  const auto max_files = options.max_files.value_or(kDefaultMaxFiles);
  const auto max_total_bytes = options.max_total_bytes.value_or(kDefaultMaxTotalBytes);

  if (!manifest.is_object()) {
    result.issues.push_back(issue("invalid_manifest", "Manifest must be an object."));
    return result;
  }

  if (!manifest.contains("version") || !manifest["version"].is_number_integer() || manifest["version"].get<int>() != 1) {
    result.issues.push_back(issue("invalid_version", "Manifest version must be 1."));
  }

  if (!manifest.contains("source") || !manifest["source"].is_object() || !manifest["source"].contains("id") || !manifest["source"]["id"].is_string() || trim(manifest["source"]["id"].get<std::string>()).empty()) {
    result.issues.push_back(issue("invalid_source", "Manifest source.id is required."));
  } else {
    result.source_id = manifest["source"]["id"].get<std::string>();
    if (manifest["source"].contains("branch") && manifest["source"]["branch"].is_string()) {
      result.source_branch = manifest["source"]["branch"].get<std::string>();
    }
    if (manifest["source"].contains("commit") && manifest["source"]["commit"].is_string()) {
      result.source_commit = manifest["source"]["commit"].get<std::string>();
    }
    if (manifest["source"].contains("repository") && manifest["source"]["repository"].is_string()) {
      result.source_repository = manifest["source"]["repository"].get<std::string>();
    }
  }

  if (manifest.contains("mode")) {
    if (!manifest["mode"].is_string() || (manifest["mode"] != "dry-run" && manifest["mode"] != "sync")) {
      result.issues.push_back(issue("invalid_mode", "Manifest mode must be \"dry-run\" or \"sync\"."));
    } else {
      result.mode_dry_run = manifest["mode"] == "dry-run";
    }
  }

  if (manifest.contains("deleteBehavior")) {
    if (!manifest["deleteBehavior"].is_string() || !is_valid_delete_behavior(manifest["deleteBehavior"].get<std::string>())) {
      result.issues.push_back(issue("invalid_delete_behavior", "Manifest deleteBehavior must be archive, delete, draft, or ignore."));
    } else {
      result.delete_behavior = manifest["deleteBehavior"].get<std::string>();
    }
  }

  if (manifest.contains("publish")) {
    if (!manifest["publish"].is_boolean()) {
      result.issues.push_back(issue("invalid_manifest", "Manifest publish must be a boolean."));
    } else {
      result.publish = manifest["publish"].get<bool>();
    }
  }

  if (!manifest.contains("files") || !manifest["files"].is_array() || manifest["files"].empty()) {
    result.issues.push_back(issue("empty_manifest", "Manifest must include at least one file."));
  } else if (manifest["files"].size() > max_files) {
    result.issues.push_back(issue("too_many_files", "Manifest exceeds maximum file count of " + std::to_string(max_files) + "."));
  }

  std::set<std::string> normalized_paths;
  std::size_t total_bytes = 0;

  if (manifest.contains("files") && manifest["files"].is_array()) {
    for (const auto& file : manifest["files"]) {
      if (!file.is_object() || !file.contains("path") || !file["path"].is_string() || !file.contains("content") || !file["content"].is_string()) {
        std::optional<std::string> bad_path;
        if (file.is_object() && file.contains("path") && file["path"].is_string()) {
          bad_path = file["path"].get<std::string>();
        }
        result.issues.push_back(issue("invalid_manifest", "Manifest file entries require string path and content.", bad_path));
        continue;
      }

      const auto path = file["path"].get<std::string>();
      const auto content = file["content"].get<std::string>();
      const auto normalized = normalize_docs_path(path);

      if (!normalized.ok) {
        result.issues.push_back(issue(normalized.code, normalized.message, path));
        continue;
      }

      total_bytes += content.size();

      if (content.size() > max_file_bytes) {
        result.issues.push_back(issue("file_too_large", "File exceeds maximum size of " + std::to_string(max_file_bytes) + " bytes.", normalized.path));
      }

      const auto computed_hash = sha256_hex(content);

      if (file.contains("sha256")) {
        const auto valid_hash = file["sha256"].is_string() && file["sha256"].get<std::string>().size() == 64;
        auto hash_value = valid_hash ? file["sha256"].get<std::string>() : std::string{};
        std::ranges::transform(hash_value, hash_value.begin(), [](const auto ch) {
          return static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
        });

        if (!valid_hash || !std::ranges::all_of(hash_value, [](const auto ch) {
          return std::isxdigit(static_cast<unsigned char>(ch));
        }) || hash_value != computed_hash) {
          result.issues.push_back(issue("invalid_hash", "Manifest file sha256 does not match content.", normalized.path));
        }
      }

      const auto parsed = parse_frontmatter(content, normalized.path);
      result.issues.insert(result.issues.end(), parsed.issues.begin(), parsed.issues.end());
      result.warnings.insert(result.warnings.end(), parsed.warnings.begin(), parsed.warnings.end());

      if (normalized_paths.contains(normalized.path)) {
        result.issues.push_back(issue("duplicate_path", "Manifest contains duplicate normalized paths.", normalized.path));
      }
      normalized_paths.insert(normalized.path);

      result.files.push_back({
        .content = parsed.content,
        .frontmatter = parsed.frontmatter,
        .path = normalized.path,
        .route = derive_route_from_source_path(normalized.path, route_base, parsed.frontmatter.slug),
        .sha256 = computed_hash,
        .title = resolve_title(parsed, normalized.path),
      });
    }
  }

  if (total_bytes > max_total_bytes) {
    result.issues.push_back(issue("manifest_too_large", "Manifest content exceeds maximum total size of " + std::to_string(max_total_bytes) + " bytes."));
  }

  if (manifest.contains("aiExport")) {
    const auto ai_validation = validate_ai_export_manifest(manifest["aiExport"], manifest["aiExport"].value("sourcePath", "index.ai.yml"), normalized_paths);
    result.issues.insert(result.issues.end(), ai_validation.issues.begin(), ai_validation.issues.end());
    result.warnings.insert(result.warnings.end(), ai_validation.warnings.begin(), ai_validation.warnings.end());
    if (ai_validation.ok && ai_validation.manifest) {
      result.ai_export = ai_export_to_json(*ai_validation.manifest);
    }
  }

  result.ok = result.issues.empty() && !result.source_id.empty();
  return result;
}

json validated_file_to_json(const ValidatedFile& file) {
  return {
    {"content", file.content},
    {"frontmatter", frontmatter_to_json(file.frontmatter)},
    {"path", file.path},
    {"route", file.route},
    {"sha256", file.sha256},
    {"title", file.title},
  };
}

json validation_to_json(const ValidationResult& validation) {
  json output = json::object();
  output["ok"] = validation.ok;

  if (validation.ok) {
    json data = json::object();
    data["version"] = 1;
    data["source"] = json::object({{"id", validation.source_id}});
    if (validation.source_branch) {
      data["source"]["branch"] = *validation.source_branch;
    }
    if (validation.source_commit) {
      data["source"]["commit"] = *validation.source_commit;
    }
    if (validation.source_repository) {
      data["source"]["repository"] = *validation.source_repository;
    }
    data["mode"] = validation.mode_dry_run ? "dry-run" : "sync";
    data["deleteBehavior"] = validation.delete_behavior;
    data["publish"] = validation.publish;
    data["files"] = json::array();
    for (const auto& file : validation.files) {
      data["files"].push_back(validated_file_to_json(file));
    }
    if (validation.ai_export) {
      data["aiExport"] = *validation.ai_export;
    }
    output["data"] = data;
  }

  output["issues"] = issues_to_json(validation.issues);
  output["warnings"] = issues_to_json(validation.warnings);

  return output;
}

std::string format_validation_summary(const std::filesystem::path& root, const std::string& source_id, std::size_t file_count, const ValidationResult& validation) {
  std::ostringstream out;
  out << "pmdocs validate\n\n";
  out << "Source: " << source_id << "\n";
  out << "Root: " << root.string() << "\n";
  out << "Files: " << file_count << "\n";
  out << "Status: " << (validation.ok ? "valid" : "invalid") << "\n";

  if (!validation.warnings.empty()) {
    out << "\nWarnings:\n" << format_issues(validation.warnings) << "\n";
  }

  if (!validation.ok && !validation.issues.empty()) {
    out << "\nErrors:\n" << format_issues(validation.issues) << "\n";
  }

  return out.str();
}

std::vector<ExistingRecord> load_existing_records(const std::filesystem::path& path) {
  json parsed;
  try {
    parsed = json::parse(read_file(path));
  } catch (const std::exception& error) {
    throw std::runtime_error{"Could not read --existing file: " + std::string{error.what()}};
  }

  if (!parsed.is_array()) {
    throw std::runtime_error{"--existing must point to a JSON array of existing docs records."};
  }

  std::vector<ExistingRecord> records;

  for (const auto& item : parsed) {
    if (!item.is_object() || !item.contains("route") || !item["route"].is_string() || !item.contains("sourcePath") || !item["sourcePath"].is_string()) {
      throw std::runtime_error{"--existing must point to a JSON array of existing docs records."};
    }

    ExistingRecord record = {
      .route = item["route"].get<std::string>(),
      .source_path = item["sourcePath"].get<std::string>(),
    };

    if (item.contains("archived") && item["archived"].is_boolean()) {
      record.archived = item["archived"].get<bool>();
    }
    if (item.contains("sourceHash") && item["sourceHash"].is_string()) {
      record.source_hash = item["sourceHash"].get<std::string>();
    }
    if (item.contains("status") && item["status"].is_string()) {
      record.status = item["status"].get<std::string>();
    }
    if (item.contains("title") && item["title"].is_string()) {
      record.title = item["title"].get<std::string>();
    }

    records.push_back(record);
  }

  return records;
}

Plan plan_docs_sync(const ValidationResult& desired, const std::vector<ExistingRecord>& existing, const std::optional<std::string>& delete_behavior_override) {
  Plan plan;
  const auto effective_delete_behavior = delete_behavior_override.value_or(desired.delete_behavior);
  std::map<std::string, ExistingRecord> existing_by_source_path;
  std::vector<std::string> existing_source_path_order;

  for (const auto& record : existing) {
    if (existing_by_source_path.contains(record.source_path)) {
      plan.warnings.push_back(issue("duplicate_existing_path", "Existing docs contain duplicate sourcePath \"" + record.source_path + "\".", record.source_path));
      continue;
    }

    existing_by_source_path[record.source_path] = record;
    existing_source_path_order.push_back(record.source_path);
  }

  std::set<std::string> desired_paths;

  for (const auto& desired_file : desired.files) {
    desired_paths.insert(desired_file.path);
    const auto current = existing_by_source_path.find(desired_file.path);

    if (current == existing_by_source_path.end()) {
      plan.create.push_back({
        .desired = desired_file,
        .reason = "No existing doc has this sourcePath.",
        .source_path = desired_file.path,
      });
      continue;
    }

    const auto desired_status = desired.publish ? "published" : "draft";
    const auto has_status_mismatch = current->second.status && *current->second.status != desired_status;

    if (current->second.source_hash && *current->second.source_hash == desired_file.sha256 && !has_status_mismatch) {
      plan.unchanged.push_back({
        .current = current->second,
        .desired = desired_file,
        .reason = "Existing source hash matches desired source hash.",
        .source_path = desired_file.path,
      });
      continue;
    }

    plan.update.push_back({
      .current = current->second,
      .desired = desired_file,
      .reason = has_status_mismatch ? "Existing draft status differs from desired publish state." : "Existing source hash differs from desired source hash.",
      .source_path = desired_file.path,
    });
  }

  for (const auto& source_path : existing_source_path_order) {
    if (desired_paths.contains(source_path)) {
      continue;
    }

    const auto current = existing_by_source_path.at(source_path);
    PlannedChange change = {
      .current = current,
      .reason = "Existing doc is missing from desired manifest.",
      .source_path = source_path,
    };

    if (effective_delete_behavior == "archive") {
      plan.archive.push_back(change);
    } else if (effective_delete_behavior == "delete") {
      plan.delete_items.push_back(change);
    } else if (effective_delete_behavior == "draft") {
      plan.draft.push_back(change);
    }
  }

  return plan;
}

json existing_record_to_json(const ExistingRecord& record) {
  json output = {
    {"route", record.route},
    {"sourcePath", record.source_path},
  };

  if (record.archived) {
    output["archived"] = *record.archived;
  }
  if (record.source_hash) {
    output["sourceHash"] = *record.source_hash;
  }
  if (record.status) {
    output["status"] = *record.status;
  }
  if (record.title) {
    output["title"] = *record.title;
  }

  return output;
}

json planned_change_to_json(const PlannedChange& change) {
  json output = {
    {"reason", change.reason},
    {"sourcePath", change.source_path},
  };

  if (change.current) {
    output["current"] = existing_record_to_json(*change.current);
  }
  if (change.desired) {
    output["desired"] = validated_file_to_json(*change.desired);
  }

  return output;
}

json changes_to_json(const std::vector<PlannedChange>& changes) {
  json output = json::array();

  for (const auto& change : changes) {
    output.push_back(planned_change_to_json(change));
  }

  return output;
}

json plan_to_json(const Plan& plan) {
  return {
    {"archive", changes_to_json(plan.archive)},
    {"create", changes_to_json(plan.create)},
    {"delete", changes_to_json(plan.delete_items)},
    {"draft", changes_to_json(plan.draft)},
    {"unchanged", changes_to_json(plan.unchanged)},
    {"update", changes_to_json(plan.update)},
    {"warnings", issues_to_json(plan.warnings)},
  };
}

std::string format_plan_summary(const Plan& plan) {
  std::ostringstream out;
  out << "pmdocs plan\n\n";
  out << "Create: " << plan.create.size() << "\n";
  out << "Update: " << plan.update.size() << "\n";
  out << "Unchanged: " << plan.unchanged.size() << "\n";
  out << "Archive: " << plan.archive.size() << "\n";
  out << "Delete: " << plan.delete_items.size() << "\n";
  out << "Draft: " << plan.draft.size() << "\n";
  out << "Warnings: " << plan.warnings.size() << "\n";

  if (!plan.warnings.empty()) {
    out << "\nWarnings:\n" << format_issues(plan.warnings) << "\n";
  }

  return out.str();
}

CommandResult validate_or_manifest(const DocsCommandOptions& options, bool print_manifest) {
  try {
    const auto source_id = source_id_for(options);
    const auto files = walk_docs_files(options.docs_root);
    auto ai_export = read_ai_export_manifest(options.docs_root);

    if (!ai_export.ok) {
      return {
        .exit_code = 1,
        .stderr_text = "AI export manifest is invalid.\n\nErrors:\n" + format_issues(ai_export.issues) + "\n",
      };
    }

    const auto manifest = build_manifest(files, source_id, options, ai_export.manifest);
    auto validation = validate_manifest(manifest, options, "/" + source_id);
    validation.warnings.insert(validation.warnings.begin(), ai_export.warnings.begin(), ai_export.warnings.end());

    if (print_manifest) {
      if (!validation.ok) {
        return {
          .exit_code = 1,
          .stderr_text = "Manifest is invalid.\n\nErrors:\n" + format_issues(validation.issues) + "\n",
        };
      }

      return {
        .exit_code = 0,
        .stdout_text = json_string(manifest, options.pretty),
      };
    }

    if (options.print_json) {
      json output = {
        {"fileCount", files.size()},
        {"root", options.docs_root.string()},
        {"sourceId", source_id},
        {"validation", validation_to_json(validation)},
      };

      return {
        .exit_code = validation.ok ? 0 : 1,
        .stdout_text = json_string(output, options.pretty),
      };
    }

    return {
      .exit_code = validation.ok ? 0 : 1,
      .stdout_text = format_validation_summary(options.docs_root, source_id, files.size(), validation),
    };
  } catch (const std::exception& error) {
    return {
      .exit_code = 1,
      .stderr_text = std::string{error.what()} + "\n",
    };
  }
}

} // namespace

std::string sha256_hex(std::string_view input) {
  static constexpr std::array<std::uint32_t, 64> k = {
    0x428a2f98U, 0x71374491U, 0xb5c0fbcfU, 0xe9b5dba5U, 0x3956c25bU, 0x59f111f1U, 0x923f82a4U, 0xab1c5ed5U,
    0xd807aa98U, 0x12835b01U, 0x243185beU, 0x550c7dc3U, 0x72be5d74U, 0x80deb1feU, 0x9bdc06a7U, 0xc19bf174U,
    0xe49b69c1U, 0xefbe4786U, 0x0fc19dc6U, 0x240ca1ccU, 0x2de92c6fU, 0x4a7484aaU, 0x5cb0a9dcU, 0x76f988daU,
    0x983e5152U, 0xa831c66dU, 0xb00327c8U, 0xbf597fc7U, 0xc6e00bf3U, 0xd5a79147U, 0x06ca6351U, 0x14292967U,
    0x27b70a85U, 0x2e1b2138U, 0x4d2c6dfcU, 0x53380d13U, 0x650a7354U, 0x766a0abbU, 0x81c2c92eU, 0x92722c85U,
    0xa2bfe8a1U, 0xa81a664bU, 0xc24b8b70U, 0xc76c51a3U, 0xd192e819U, 0xd6990624U, 0xf40e3585U, 0x106aa070U,
    0x19a4c116U, 0x1e376c08U, 0x2748774cU, 0x34b0bcb5U, 0x391c0cb3U, 0x4ed8aa4aU, 0x5b9cca4fU, 0x682e6ff3U,
    0x748f82eeU, 0x78a5636fU, 0x84c87814U, 0x8cc70208U, 0x90befffaU, 0xa4506cebU, 0xbef9a3f7U, 0xc67178f2U,
  };
  std::array<std::uint32_t, 8> hash = {
    0x6a09e667U,
    0xbb67ae85U,
    0x3c6ef372U,
    0xa54ff53aU,
    0x510e527fU,
    0x9b05688cU,
    0x1f83d9abU,
    0x5be0cd19U,
  };
  std::vector<std::uint8_t> bytes(input.begin(), input.end());
  const auto bit_length = static_cast<std::uint64_t>(bytes.size()) * 8U;
  bytes.push_back(0x80U);

  while ((bytes.size() % 64U) != 56U) {
    bytes.push_back(0U);
  }

  for (int shift = 56; shift >= 0; shift -= 8) {
    bytes.push_back(static_cast<std::uint8_t>((bit_length >> shift) & 0xffU));
  }

  for (std::size_t chunk = 0; chunk < bytes.size(); chunk += 64) {
    std::array<std::uint32_t, 64> w = {};

    for (std::size_t index = 0; index < 16; ++index) {
      const auto offset = chunk + index * 4;
      w[index] =
        (static_cast<std::uint32_t>(bytes[offset]) << 24U) |
        (static_cast<std::uint32_t>(bytes[offset + 1]) << 16U) |
        (static_cast<std::uint32_t>(bytes[offset + 2]) << 8U) |
        static_cast<std::uint32_t>(bytes[offset + 3]);
    }

    for (std::size_t index = 16; index < 64; ++index) {
      const auto s0 = std::rotr(w[index - 15], 7) ^ std::rotr(w[index - 15], 18) ^ (w[index - 15] >> 3U);
      const auto s1 = std::rotr(w[index - 2], 17) ^ std::rotr(w[index - 2], 19) ^ (w[index - 2] >> 10U);
      w[index] = w[index - 16] + s0 + w[index - 7] + s1;
    }

    auto a = hash[0];
    auto b = hash[1];
    auto c = hash[2];
    auto d = hash[3];
    auto e = hash[4];
    auto f = hash[5];
    auto g = hash[6];
    auto h = hash[7];

    for (std::size_t index = 0; index < 64; ++index) {
      const auto s1 = std::rotr(e, 6) ^ std::rotr(e, 11) ^ std::rotr(e, 25);
      const auto choice = (e & f) ^ ((~e) & g);
      const auto temp1 = h + s1 + choice + k[index] + w[index];
      const auto s0 = std::rotr(a, 2) ^ std::rotr(a, 13) ^ std::rotr(a, 22);
      const auto majority = (a & b) ^ (a & c) ^ (b & c);
      const auto temp2 = s0 + majority;

      h = g;
      g = f;
      f = e;
      e = d + temp1;
      d = c;
      c = b;
      b = a;
      a = temp1 + temp2;
    }

    hash[0] += a;
    hash[1] += b;
    hash[2] += c;
    hash[3] += d;
    hash[4] += e;
    hash[5] += f;
    hash[6] += g;
    hash[7] += h;
  }

  std::ostringstream out;
  out << std::hex << std::setfill('0');

  for (const auto word : hash) {
    out << std::setw(8) << word;
  }

  return out.str();
}

CommandResult run_validate_command(const DocsCommandOptions& options) {
  return validate_or_manifest(options, false);
}

CommandResult run_manifest_command(const DocsCommandOptions& options) {
  return validate_or_manifest(options, true);
}

CommandResult run_plan_command(const PlanCommandOptions& options) {
  try {
    if (options.delete_behavior && !is_valid_delete_behavior(*options.delete_behavior)) {
      return {
        .exit_code = 1,
        .stderr_text = "--delete-behavior must be archive, delete, draft, or ignore.\n",
      };
    }

    const auto source_id = source_id_for(options);
    const auto files = walk_docs_files(options.docs_root);
    auto ai_export = read_ai_export_manifest(options.docs_root);

    if (!ai_export.ok) {
      return {
        .exit_code = 1,
        .stderr_text = "AI export manifest is invalid.\n\nErrors:\n" + format_issues(ai_export.issues) + "\n",
      };
    }

    const auto manifest = build_manifest(files, source_id, options, ai_export.manifest, options.delete_behavior);
    auto validation = validate_manifest(manifest, options, "/" + source_id);
    validation.warnings.insert(validation.warnings.begin(), ai_export.warnings.begin(), ai_export.warnings.end());

    if (!validation.ok) {
      return {
        .exit_code = 1,
        .stderr_text = "Manifest is invalid.\n\nErrors:\n" + format_issues(validation.issues) + "\n",
      };
    }

    std::vector<ExistingRecord> existing;
    if (options.existing_path) {
      existing = load_existing_records(*options.existing_path);
    }

    auto plan = plan_docs_sync(validation, existing, options.delete_behavior);

    if (options.print_json) {
      return {
        .exit_code = 0,
        .stdout_text = json_string(plan_to_json(plan), options.pretty),
      };
    }

    return {
      .exit_code = 0,
      .stdout_text = format_plan_summary(plan),
    };
  } catch (const std::exception& error) {
    return {
      .exit_code = 1,
      .stderr_text = std::string{error.what()} + "\n",
    };
  }
}

} // namespace pmdocs
