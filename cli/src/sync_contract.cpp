// Docs sync protocol semantics shared with the Payload server.
//
// Each function mirrors a TypeScript twin in src/sync/* (named in the
// comments). contracts/vectors/*.json pins both implementations; when they
// disagree, the server's behaviour is the contract.

#include "pmdocs/contract.hpp"
#include "pmdocs/docs.hpp"

#include <openssl/evp.h>
#include <openssl/pem.h>

#include <algorithm>
#include <array>
#include <cctype>
#include <charconv>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <map>
#include <memory>
#include <set>
#include <sstream>
#include <stdexcept>
#include <utility>

namespace pmdocs::contract {
namespace {

// ------------------------------------------------------------------ UTF-8

struct DecodedCodePoint {
  std::uint32_t code_point = 0;
  std::size_t length = 1;
};

// Decodes one code point. Invalid bytes decode as themselves with length 1,
// which callers treat as "not whitespace / not ASCII".
DecodedCodePoint decode_at(std::string_view value, std::size_t index) {
  const auto lead = static_cast<unsigned char>(value[index]);

  if (lead < 0x80) {
    return {lead, 1};
  }

  std::size_t length = 0;
  std::uint32_t code_point = 0;

  if ((lead & 0xE0U) == 0xC0U) {
    length = 2;
    code_point = lead & 0x1FU;
  } else if ((lead & 0xF0U) == 0xE0U) {
    length = 3;
    code_point = lead & 0x0FU;
  } else if ((lead & 0xF8U) == 0xF0U) {
    length = 4;
    code_point = lead & 0x07U;
  } else {
    return {lead, 1};
  }

  if (index + length > value.size()) {
    return {lead, 1};
  }

  for (std::size_t offset = 1; offset < length; ++offset) {
    const auto next = static_cast<unsigned char>(value[index + offset]);

    if ((next & 0xC0U) != 0x80U) {
      return {lead, 1};
    }

    code_point = (code_point << 6U) | (next & 0x3FU);
  }

  return {code_point, length};
}

// ECMAScript WhiteSpace + LineTerminator (String.prototype.trim, RegExp \s).
bool is_js_whitespace(std::uint32_t code_point) {
  return code_point == 0x09 || code_point == 0x0A || code_point == 0x0B || code_point == 0x0C
    || code_point == 0x0D || code_point == 0x20 || code_point == 0xA0 || code_point == 0x1680
    || (code_point >= 0x2000 && code_point <= 0x200A) || code_point == 0x2028 || code_point == 0x2029
    || code_point == 0x202F || code_point == 0x205F || code_point == 0x3000 || code_point == 0xFEFF;
}

bool is_control_code_point(std::uint32_t code_point) {
  return code_point <= 0x1F || (code_point >= 0x7F && code_point <= 0x9F);
}

bool is_non_control_whitespace(std::uint32_t code_point) {
  return is_js_whitespace(code_point) && !is_control_code_point(code_point);
}

bool contains_code_point_matching(std::string_view value, bool (*predicate)(std::uint32_t)) {
  for (std::size_t index = 0; index < value.size();) {
    const auto decoded = decode_at(value, index);

    if (predicate(decoded.code_point)) {
      return true;
    }

    index += decoded.length;
  }

  return false;
}

// ------------------------------------------------------------------ strings

bool starts_with(std::string_view value, std::string_view prefix) {
  return value.substr(0, prefix.size()) == prefix;
}

bool ends_with(std::string_view value, std::string_view suffix) {
  return value.size() >= suffix.size() && value.substr(value.size() - suffix.size()) == suffix;
}

std::string ascii_lower(std::string value) {
  for (auto& ch : value) {
    if (ch >= 'A' && ch <= 'Z') {
      ch = static_cast<char>(ch - 'A' + 'a');
    }
  }

  return value;
}

bool is_ascii_letter(int ch) {
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
}

bool is_ascii_digit(int ch) {
  return ch >= '0' && ch <= '9';
}

bool is_ascii_alphanumeric(int ch) {
  return is_ascii_letter(ch) || is_ascii_digit(ch);
}

// -1 means "end of string" (treated as whitespace by flanking rules).
bool is_ascii_whitespace_or_end(int ch) {
  return ch == -1 || ch == ' ' || ch == '\t' || ch == '\n' || ch == '\v' || ch == '\f' || ch == '\r';
}

bool is_ascii_punctuation(int ch) {
  return (ch >= 0x21 && ch <= 0x2F) || (ch >= 0x3A && ch <= 0x40) || (ch >= 0x5B && ch <= 0x60)
    || (ch >= 0x7B && ch <= 0x7E);
}

int char_at(std::string_view value, std::size_t index) {
  return index < value.size() ? static_cast<unsigned char>(value[index]) : -1;
}

std::vector<std::string> split(std::string_view value, char separator) {
  std::vector<std::string> parts;
  std::string current;

  for (const auto ch : value) {
    if (ch == separator) {
      parts.push_back(current);
      current.clear();
      continue;
    }

    current.push_back(ch);
  }

  parts.push_back(current);
  return parts;
}

std::string join(const std::vector<std::string>& values, std::string_view separator) {
  std::string output;

  for (std::size_t index = 0; index < values.size(); ++index) {
    if (index > 0) {
      output += separator;
    }

    output += values[index];
  }

  return output;
}

// `value.replace(/\\/g, '/').replace(/\/+/g, '/')`
std::string normalize_slashes(std::string_view value) {
  std::string normalized;
  normalized.reserve(value.size());
  bool previous_slash = false;

  for (auto ch : value) {
    if (ch == '\\') {
      ch = '/';
    }

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

Issue make_issue(std::string code, std::string message, std::optional<std::string> path = std::nullopt) {
  return {
    .code = std::move(code),
    .message = std::move(message),
    .path = std::move(path),
  };
}

// JSON.stringify for a string (used in messages, matching the server).
std::string json_quote(const std::string& value) {
  return json(value).dump(-1, ' ', false, json::error_handler_t::replace);
}

// ------------------------------------------------------------------ uppercase

struct UppercaseEntry {
  std::uint16_t code_unit;
  const char* upper;
};

constexpr UppercaseEntry kJsUppercaseTable[] = {
#include "js_uppercase_table.inc"
};

// String.prototype.toUpperCase applied to the first UTF-16 code unit only.
std::string uppercase_first_code_unit(const std::string& value) {
  if (value.empty()) {
    return value;
  }

  const auto first = decode_at(value, 0);
  const auto rest = value.substr(first.length);

  if (first.code_point < 0x80) {
    std::string output = value;
    if (output[0] >= 'a' && output[0] <= 'z') {
      output[0] = static_cast<char>(output[0] - 'a' + 'A');
    }
    return output;
  }

  if (first.code_point > 0xFFFF || first.length == 1) {
    return value;
  }

  const auto* end = std::end(kJsUppercaseTable);
  const auto* found = std::lower_bound(
    std::begin(kJsUppercaseTable),
    end,
    first.code_point,
    [](const UppercaseEntry& entry, std::uint32_t code_point) {
      return entry.code_unit < code_point;
    }
  );

  if (found == end || found->code_unit != first.code_point) {
    return value;
  }

  return std::string{found->upper} + rest;
}

// ------------------------------------------------------------------ routes

std::string normalize_route_base(std::string_view route_base) {
  auto normalized = normalize_slashes("/" + js_trim(route_base));

  while (normalized.size() > 1 && normalized.back() == '/') {
    normalized.pop_back();
  }

  return normalized.empty() ? "/" : normalized;
}

struct RouteParts {
  std::string route_base;
  std::vector<std::string> segments;
};

// src/sync/paths.ts deriveRouteParts
RouteParts derive_route_parts(
  const std::string& source_path,
  const std::string& route_base,
  const std::optional<std::string>& slug
) {
  const auto normalized_path = normalize_docs_path(source_path);
  const auto normalized_route_base = normalize_route_base(route_base);

  if (!normalized_path.ok) {
    return {normalized_route_base, {}};
  }

  auto route_segments = normalized_path.route_segments;
  std::vector<std::string> base_segments;

  for (auto& segment : split(normalized_route_base, '/')) {
    if (!segment.empty()) {
      base_segments.push_back(std::move(segment));
    }
  }

  if (!base_segments.empty()) {
    bool has_prefix = true;

    for (std::size_t index = 0; index < base_segments.size(); ++index) {
      if (index >= route_segments.size() || route_segments[index] != base_segments[index]) {
        has_prefix = false;
        break;
      }
    }

    if (has_prefix) {
      route_segments.erase(route_segments.begin(), route_segments.begin() + static_cast<std::ptrdiff_t>(base_segments.size()));
    }
  }

  const auto normalized_slug = slug ? js_trim(*slug) : std::string{};
  const auto path_segments = split(normalized_path.path, '/');
  const auto is_index_source_path = ascii_lower(path_segments.back()) == "index.md";
  const auto should_apply_slug = !normalized_slug.empty()
    && !(is_index_source_path && ascii_lower(normalized_slug) == "index");

  if (should_apply_slug) {
    if (!route_segments.empty()) {
      route_segments.back() = normalized_slug;
    } else {
      route_segments = {normalized_slug};
    }
  }

  return {normalized_route_base, route_segments};
}

bool is_unsafe_client_route(std::string_view route) {
  if (route.find('%') != std::string_view::npos || route.find('?') != std::string_view::npos
      || route.find('#') != std::string_view::npos || contains_code_point_matching(route, is_control_code_point)) {
    return true;
  }

  std::string current;

  for (std::size_t index = 0; index <= route.size(); ++index) {
    if (index == route.size() || route[index] == '/' || route[index] == '\\') {
      if (current == "." || current == "..") {
        return true;
      }

      current.clear();
      continue;
    }

    current.push_back(route[index]);
  }

  return false;
}

// ------------------------------------------------------------------ frontmatter

const std::set<std::string>& known_frontmatter_fields() {
  static const std::set<std::string> fields = {
    "dependencies",
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
  return fields;
}

bool is_array_frontmatter_field(const std::string& key) {
  return key == "dependencies" || key == "redirectFrom" || key == "tags";
}

// src/sync/frontmatter.ts stripQuotes
std::string strip_quotes(std::string_view value) {
  auto trimmed = js_trim(value);

  if (trimmed.size() >= 2) {
    const auto first = trimmed.front();
    const auto last = trimmed.back();

    if ((first == '"' && last == '"') || (first == '\'' && last == '\'')) {
      return trimmed.substr(1, trimmed.size() - 2);
    }
  }

  return trimmed;
}

bool is_frontmatter_key(std::string_view value) {
  if (value.empty() || !(is_ascii_letter(static_cast<unsigned char>(value.front())) || value.front() == '_')) {
    return false;
  }

  return std::ranges::all_of(value.substr(1), [](const char ch) {
    const auto code = static_cast<unsigned char>(ch);
    return is_ascii_alphanumeric(code) || ch == '_' || ch == '-';
  });
}

// `/^[|>][-+0-9]*$/`
bool is_block_scalar_indicator(std::string_view value) {
  if (value.empty() || (value.front() != '|' && value.front() != '>')) {
    return false;
  }

  return std::ranges::all_of(value.substr(1), [](const char ch) {
    return ch == '-' || ch == '+' || is_ascii_digit(static_cast<unsigned char>(ch));
  });
}

// src/sync/frontmatter.ts parseFlowSequence
std::optional<std::vector<std::string>> parse_flow_sequence(std::string_view value) {
  if (!starts_with(value, "[") || !ends_with(value, "]") || value.size() < 2) {
    return std::nullopt;
  }

  const auto inner = value.substr(1, value.size() - 2);

  if (js_trim(inner).empty()) {
    return std::vector<std::string>{};
  }

  std::vector<std::string> items;
  std::string current;
  char quote = 0;

  for (const auto ch : inner) {
    if (quote != 0) {
      current.push_back(ch);

      if (ch == quote) {
        quote = 0;
      }

      continue;
    }

    if ((ch == '"' || ch == '\'') && js_trim(current).empty()) {
      quote = ch;
      current.push_back(ch);
      continue;
    }

    if (ch == '[' || ch == ']' || ch == '{' || ch == '}') {
      return std::nullopt;
    }

    if (ch == ',') {
      items.push_back(current);
      current.clear();
      continue;
    }

    current.push_back(ch);
  }

  if (quote != 0) {
    return std::nullopt;
  }

  items.push_back(current);

  if (items.size() > 1 && js_trim(items.back()).empty()) {
    items.pop_back();
  }

  std::vector<std::string> output;

  for (const auto& item : items) {
    if (js_trim(item).empty()) {
      return std::nullopt;
    }

    output.push_back(strip_quotes(item));
  }

  return output;
}

std::vector<std::string>& array_field(Frontmatter& frontmatter, const std::string& key) {
  if (key == "dependencies") {
    frontmatter.has_dependencies = true;
    return frontmatter.dependencies;
  }

  if (key == "redirectFrom") {
    frontmatter.has_redirect_from = true;
    return frontmatter.redirect_from;
  }

  frontmatter.has_tags = true;
  return frontmatter.tags;
}

struct AssignResult {
  std::optional<Issue> issue;
  std::optional<Issue> warning;
};

// src/sync/frontmatter.ts assignFrontmatterValue
AssignResult assign_frontmatter_value(
  Frontmatter& frontmatter,
  const std::string& key,
  const std::string& raw_value,
  const std::optional<std::string>& path
) {
  const auto value = strip_quotes(raw_value);

  if (key == "description") {
    frontmatter.description = value;
    return {};
  }

  if (key == "navTitle") {
    frontmatter.nav_title = value;
    return {};
  }

  if (key == "draft") {
    if (value == "true" || value == "false") {
      frontmatter.draft = value == "true";
      return {};
    }

    return {.issue = make_issue("invalid_frontmatter", "Frontmatter field \"draft\" must be a boolean.", path)};
  }

  if (key == "order") {
    if (const auto order = parse_js_number(value)) {
      frontmatter.order = *order;

      if (js_trim(value).empty()) {
        return {.warning = make_issue("invalid_frontmatter", "Frontmatter field \"order\" is empty and was treated as 0.", path)};
      }

      return {};
    }

    return {.issue = make_issue("invalid_frontmatter", "Frontmatter field \"order\" must be a number.", path)};
  }

  if (key == "slug") {
    frontmatter.slug = value;

    if (value.empty()) {
      return {.warning = make_issue("invalid_frontmatter", "Frontmatter field \"slug\" is empty and was ignored.", path)};
    }

    return {};
  }

  if (key == "status") {
    if (value == "draft" || value == "published") {
      frontmatter.status = value;
      return {};
    }

    return {.issue = make_issue("invalid_frontmatter", "Frontmatter field \"status\" must be \"draft\" or \"published\".", path)};
  }

  // title
  frontmatter.title = value;

  if (value.empty()) {
    return {.warning = make_issue("invalid_frontmatter", "Frontmatter field \"title\" is empty; the title is inferred instead.", path)};
  }

  return {};
}

std::vector<Issue> validate_parsed_frontmatter(const Frontmatter& frontmatter, const std::optional<std::string>& path) {
  std::vector<Issue> issues;

  if (frontmatter.slug && !frontmatter.slug->empty()) {
    const auto& slug = *frontmatter.slug;
    const auto valid = is_ascii_alphanumeric(static_cast<unsigned char>(slug.front()))
      && std::ranges::all_of(slug, [](const char ch) {
        return is_ascii_alphanumeric(static_cast<unsigned char>(ch)) || ch == '-';
      });

    if (!valid) {
      issues.push_back(make_issue("invalid_frontmatter", "Frontmatter field \"slug\" must contain only letters, numbers, and hyphens.", path));
    }
  }

  return issues;
}

// ------------------------------------------------------------------ titles

std::size_t run_length(std::string_view value, std::size_t start, char ch) {
  auto end = start;

  while (end < value.size() && value[end] == ch) {
    ++end;
  }

  return end - start;
}

std::optional<std::size_t> find_closing(std::string_view value, std::size_t open, char opening, char closing) {
  int depth = 0;

  for (std::size_t index = open; index < value.size(); ++index) {
    const auto ch = value[index];

    if (ch == '\\') {
      ++index;
      continue;
    }

    if (ch == opening) {
      ++depth;
    } else if (ch == closing) {
      --depth;

      if (depth == 0) {
        return index;
      }
    }
  }

  return std::nullopt;
}

struct AutolinkMatch {
  std::size_t end = 0;
  std::string text;
};

// src/sync/title.ts matchAutolink
std::optional<AutolinkMatch> match_autolink(std::string_view value, std::size_t start) {
  const auto close = value.find('>', start + 1);

  if (close == std::string_view::npos) {
    return std::nullopt;
  }

  const auto inner = value.substr(start + 1, close - start - 1);

  for (const auto ch : inner) {
    const auto code = static_cast<unsigned char>(ch);

    if (ch == '<' || code <= 0x20) {
      return std::nullopt;
    }
  }

  const auto colon = inner.find(':');

  if (colon != std::string_view::npos && colon >= 2 && colon <= 32 && is_ascii_letter(static_cast<unsigned char>(inner[0]))) {
    bool scheme = true;

    for (std::size_t index = 1; index < colon; ++index) {
      const auto code = static_cast<unsigned char>(inner[index]);

      if (!is_ascii_alphanumeric(code) && code != '+' && code != '.' && code != '-') {
        scheme = false;
        break;
      }
    }

    if (scheme) {
      return AutolinkMatch{close + 1, std::string{inner}};
    }
  }

  const auto at = inner.find('@');

  if (at == std::string_view::npos || at == 0 || at == inner.size() - 1) {
    return std::nullopt;
  }

  static constexpr std::string_view local_punctuation = ".!#$%&'*+/=?^_`{|}~-";

  for (std::size_t index = 0; index < at; ++index) {
    const auto code = static_cast<unsigned char>(inner[index]);

    if (!is_ascii_alphanumeric(code) && local_punctuation.find(inner[index]) == std::string_view::npos) {
      return std::nullopt;
    }
  }

  for (const auto& label : split(inner.substr(at + 1), '.')) {
    if (label.empty() || label.size() > 63 || label.front() == '-' || label.back() == '-'
        || !std::ranges::all_of(label, [](const char ch) {
          return is_ascii_alphanumeric(static_cast<unsigned char>(ch)) || ch == '-';
        })) {
      return std::nullopt;
    }
  }

  return AutolinkMatch{close + 1, std::string{inner}};
}

struct InlineToken {
  bool delimiter = false;
  std::string value;
  char character = 0;
  std::size_t length = 0;
  bool can_open = false;
  bool can_close = false;
  bool removed = false;
};

// src/sync/title.ts tokenizeInline
std::vector<InlineToken> tokenize_inline(std::string_view value) {
  std::vector<InlineToken> tokens;
  std::string text;
  const auto flush_text = [&]() {
    if (!text.empty()) {
      tokens.push_back({.value = text});
      text.clear();
    }
  };
  const auto push_text = [&](std::string token_text) {
    flush_text();
    tokens.push_back({.value = std::move(token_text)});
  };

  std::size_t index = 0;

  while (index < value.size()) {
    const auto ch = value[index];

    if (ch == '\\' && is_ascii_punctuation(char_at(value, index + 1))) {
      push_text(std::string(1, value[index + 1]));
      index += 2;
      continue;
    }

    if (ch == '`') {
      const auto length = run_length(value, index, '`');
      auto search = index + length;
      std::optional<std::size_t> closing;

      while (search < value.size()) {
        if (value[search] == '`') {
          const auto closing_length = run_length(value, search, '`');

          if (closing_length == length) {
            closing = search;
            break;
          }

          search += closing_length;
        } else {
          ++search;
        }
      }

      if (!closing) {
        text.append(length, '`');
        index += length;
        continue;
      }

      auto code = std::string{value.substr(index + length, *closing - index - length)};

      if (code.size() >= 2 && code.front() == ' ' && code.back() == ' ' && !js_trim(code).empty()) {
        code = code.substr(1, code.size() - 2);
      }

      push_text(std::move(code));
      index = *closing + length;
      continue;
    }

    const auto is_image = ch == '!' && char_at(value, index + 1) == '[';

    if (ch == '[' || is_image) {
      const auto open = is_image ? index + 1 : index;

      if (const auto close = find_closing(value, open, '[', ']')) {
        const auto label = value.substr(open + 1, *close - open - 1);
        const auto next = char_at(value, *close + 1);
        std::optional<std::size_t> end;

        if (next == '(') {
          end = find_closing(value, *close + 1, '(', ')');
        } else if (next == '[') {
          end = find_closing(value, *close + 1, '[', ']');
        }

        if (end) {
          push_text(strip_inline_markdown(label));
          index = *end + 1;
          continue;
        }
      }

      text.push_back(ch);
      ++index;
      continue;
    }

    if (ch == '<') {
      if (const auto autolink = match_autolink(value, index)) {
        push_text(autolink->text);
        index = autolink->end;
        continue;
      }
    }

    if (ch == '*' || ch == '_' || ch == '~') {
      const auto length = run_length(value, index, ch);
      const auto before = index > 0 ? static_cast<int>(static_cast<unsigned char>(value[index - 1])) : -1;
      const auto after = char_at(value, index + length);
      const auto left_flanking = !is_ascii_whitespace_or_end(after)
        && (!is_ascii_punctuation(after) || is_ascii_whitespace_or_end(before) || is_ascii_punctuation(before));
      const auto right_flanking = !is_ascii_whitespace_or_end(before)
        && (!is_ascii_punctuation(before) || is_ascii_whitespace_or_end(after) || is_ascii_punctuation(after));
      const auto can_open = ch == '_'
        ? left_flanking && (!right_flanking || is_ascii_punctuation(before))
        : left_flanking;
      const auto can_close = ch == '_'
        ? right_flanking && (!left_flanking || is_ascii_punctuation(after))
        : right_flanking;

      flush_text();
      tokens.push_back({
        .delimiter = true,
        .character = ch,
        .length = length,
        .can_open = can_open,
        .can_close = can_close,
      });
      index += length;
      continue;
    }

    text.push_back(ch);
    ++index;
  }

  flush_text();
  return tokens;
}

std::size_t indent_width(std::string_view line) {
  std::size_t width = 0;

  for (const auto ch : line) {
    if (ch == ' ') {
      ++width;
    } else if (ch == '\t') {
      width += 4 - (width % 4);
    } else {
      break;
    }
  }

  return width;
}

bool is_blank_line(std::string_view line) {
  return std::ranges::all_of(line, [](const char ch) {
    return ch == ' ' || ch == '\t';
  });
}

// Leading spaces when there are at most three, otherwise -1.
int small_indent(std::string_view line) {
  std::size_t index = 0;

  while (index < line.size() && line[index] == ' ') {
    ++index;
  }

  return index <= 3 ? static_cast<int>(index) : -1;
}

struct Fence {
  char character = 0;
  std::size_t length = 0;
};

std::optional<Fence> match_fence_open(std::string_view line) {
  const auto start = small_indent(line);

  if (start < 0) {
    return std::nullopt;
  }

  const auto position = static_cast<std::size_t>(start);
  const auto ch = char_at(line, position);

  if (ch != '`' && ch != '~') {
    return std::nullopt;
  }

  const auto length = run_length(line, position, static_cast<char>(ch));

  if (length < 3 || (ch == '`' && line.substr(position + length).find('`') != std::string_view::npos)) {
    return std::nullopt;
  }

  return Fence{static_cast<char>(ch), length};
}

bool is_fence_close(std::string_view line, const Fence& fence) {
  const auto start = small_indent(line);

  if (start < 0 || char_at(line, static_cast<std::size_t>(start)) != fence.character) {
    return false;
  }

  const auto position = static_cast<std::size_t>(start);
  const auto length = run_length(line, position, fence.character);

  return length >= fence.length && is_blank_line(line.substr(position + length));
}

std::string trim_spaces_and_tabs(std::string_view value) {
  std::size_t start = 0;
  auto end = value.size();

  while (start < end && (value[start] == ' ' || value[start] == '\t')) {
    ++start;
  }

  while (end > start && (value[end - 1] == ' ' || value[end - 1] == '\t')) {
    --end;
  }

  return std::string{value.substr(start, end - start)};
}

struct AtxHeading {
  std::size_t level = 0;
  std::string text;
};

std::optional<AtxHeading> match_atx_heading(std::string_view line) {
  const auto start = small_indent(line);

  if (start < 0 || char_at(line, static_cast<std::size_t>(start)) != '#') {
    return std::nullopt;
  }

  const auto position = static_cast<std::size_t>(start);
  const auto level = run_length(line, position, '#');
  const auto after = char_at(line, position + level);

  if (level > 6 || (after != -1 && after != ' ' && after != '\t')) {
    return std::nullopt;
  }

  auto text = trim_spaces_and_tabs(line.substr(position + level));
  auto closing = text.size();

  while (closing > 0 && text[closing - 1] == '#') {
    --closing;
  }

  if (closing == 0) {
    text.clear();
  } else if (closing < text.size() && (text[closing - 1] == ' ' || text[closing - 1] == '\t')) {
    text = trim_spaces_and_tabs(std::string_view{text}.substr(0, closing));
  }

  return AtxHeading{level, text};
}

bool is_marker_line(std::string_view line, std::string_view markers, std::size_t minimum, bool allow_inner_spaces) {
  const auto start = small_indent(line);

  if (start < 0) {
    return false;
  }

  auto index = static_cast<std::size_t>(start);
  const auto marker = char_at(line, index);

  if (marker == -1 || markers.find(static_cast<char>(marker)) == std::string_view::npos) {
    return false;
  }

  std::size_t count = 0;

  while (index < line.size() && line[index] == marker) {
    ++count;
    ++index;

    if (allow_inner_spaces) {
      while (index < line.size() && (line[index] == ' ' || line[index] == '\t')) {
        ++index;
      }
    }
  }

  return count >= minimum && is_blank_line(line.substr(index));
}

bool is_setext_h1_underline(std::string_view line) {
  return is_marker_line(line, "=", 1, false);
}

bool is_thematic_break_or_setext_h2_underline(std::string_view line) {
  return is_marker_line(line, "-", 1, false) || is_marker_line(line, "-*_", 3, true);
}

bool is_blockquote_line(std::string_view line) {
  const auto start = small_indent(line);
  return start >= 0 && char_at(line, static_cast<std::size_t>(start)) == '>';
}

bool is_list_item_line(std::string_view line) {
  const auto start = small_indent(line);

  if (start < 0) {
    return false;
  }

  const auto first_index = static_cast<std::size_t>(start);
  auto index = first_index;
  const auto first = char_at(line, index);

  if (first == '-' || first == '+' || first == '*') {
    ++index;
  } else {
    while (index < line.size() && index - first_index < 9 && is_ascii_digit(static_cast<unsigned char>(line[index]))) {
      ++index;
    }

    const auto marker = char_at(line, index);

    if (index == first_index || (marker != '.' && marker != ')')) {
      return false;
    }

    ++index;
  }

  const auto after = char_at(line, index);
  return after == -1 || after == ' ' || after == '\t';
}

std::optional<std::string> finish_title(std::string_view raw) {
  auto title = js_trim(strip_inline_markdown(raw));

  if (title.empty()) {
    return std::nullopt;
  }

  return title;
}

// ------------------------------------------------------------------ numbers

std::optional<double> parse_radix_integer(std::string_view digits, int radix) {
  if (digits.empty()) {
    return std::nullopt;
  }

  double value = 0;
  std::uint64_t exact = 0;
  bool exact_ok = true;

  for (const auto ch : digits) {
    int digit = -1;

    if (ch >= '0' && ch <= '9') {
      digit = ch - '0';
    } else if (ch >= 'a' && ch <= 'f') {
      digit = ch - 'a' + 10;
    } else if (ch >= 'A' && ch <= 'F') {
      digit = ch - 'A' + 10;
    }

    if (digit < 0 || digit >= radix) {
      return std::nullopt;
    }

    if (exact_ok && exact <= (UINT64_MAX - static_cast<std::uint64_t>(digit)) / static_cast<std::uint64_t>(radix)) {
      exact = exact * static_cast<std::uint64_t>(radix) + static_cast<std::uint64_t>(digit);
    } else {
      exact_ok = false;
    }

    value = value * radix + digit;
  }

  return exact_ok ? static_cast<double>(exact) : value;
}

} // namespace

// ================================================================== public

std::string js_trim(std::string_view value) {
  std::size_t start = 0;
  auto end = value.size();

  while (start < end) {
    const auto decoded = decode_at(value, start);

    if (!is_js_whitespace(decoded.code_point) || (decoded.length == 1 && decoded.code_point >= 0x80)) {
      break;
    }

    start += decoded.length;
  }

  while (end > start) {
    // Step back to the start of the previous code point.
    auto previous = end - 1;

    while (previous > start && (static_cast<unsigned char>(value[previous]) & 0xC0U) == 0x80U) {
      --previous;
    }

    const auto decoded = decode_at(value, previous);

    if (previous + decoded.length != end || !is_js_whitespace(decoded.code_point)
        || (decoded.length == 1 && decoded.code_point >= 0x80)) {
      break;
    }

    end = previous;
  }

  return std::string{value.substr(start, end - start)};
}

std::string js_trim_start(std::string_view value) {
  std::size_t start = 0;

  while (start < value.size()) {
    const auto decoded = decode_at(value, start);

    if (!is_js_whitespace(decoded.code_point) || (decoded.length == 1 && decoded.code_point >= 0x80)) {
      break;
    }

    start += decoded.length;
  }

  return std::string{value.substr(start)};
}

std::string strip_byte_order_mark(std::string_view value) {
  if (starts_with(value, "\xEF\xBB\xBF")) {
    return std::string{value.substr(3)};
  }

  return std::string{value};
}

std::vector<std::string> split_markdown_lines(std::string_view value) {
  std::vector<std::string> lines;
  std::string current;

  for (std::size_t index = 0; index < value.size(); ++index) {
    const auto ch = value[index];

    if (ch == '\r' || ch == '\n') {
      lines.push_back(current);
      current.clear();

      if (ch == '\r' && index + 1 < value.size() && value[index + 1] == '\n') {
        ++index;
      }

      continue;
    }

    current.push_back(ch);
  }

  lines.push_back(current);
  return lines;
}

bool is_valid_utf8(std::string_view value) {
  std::size_t index = 0;

  while (index < value.size()) {
    const auto lead = static_cast<unsigned char>(value[index]);

    if (lead < 0x80) {
      ++index;
      continue;
    }

    std::size_t length = 0;
    unsigned char lower = 0x80;
    unsigned char upper = 0xBF;

    if (lead >= 0xC2 && lead <= 0xDF) {
      length = 2;
    } else if (lead >= 0xE0 && lead <= 0xEF) {
      length = 3;
      if (lead == 0xE0) {
        lower = 0xA0;
      } else if (lead == 0xED) {
        upper = 0x9F;
      }
    } else if (lead >= 0xF0 && lead <= 0xF4) {
      length = 4;
      if (lead == 0xF0) {
        lower = 0x90;
      } else if (lead == 0xF4) {
        upper = 0x8F;
      }
    } else {
      return false;
    }

    if (index + length > value.size()) {
      return false;
    }

    const auto second = static_cast<unsigned char>(value[index + 1]);

    if (second < lower || second > upper) {
      return false;
    }

    for (std::size_t offset = 2; offset < length; ++offset) {
      const auto next = static_cast<unsigned char>(value[index + offset]);

      if (next < 0x80 || next > 0xBF) {
        return false;
      }
    }

    index += length;
  }

  return true;
}

std::string sanitize_utf8(std::string_view value) {
  if (is_valid_utf8(value)) {
    return std::string{value};
  }

  std::string output;
  std::size_t index = 0;

  while (index < value.size()) {
    std::size_t length = 1;

    for (std::size_t candidate = 4; candidate >= 1; --candidate) {
      if (index + candidate <= value.size() && is_valid_utf8(value.substr(index, candidate))) {
        length = candidate;
        break;
      }

      if (candidate == 1) {
        length = 0;
      }
    }

    if (length == 0) {
      output += "\xEF\xBF\xBD";
      ++index;
      continue;
    }

    output += value.substr(index, length);
    index += length;
  }

  return output;
}

// src/sync/paths.ts normalizeDocsPath
NormalizedPath normalize_docs_path(std::string_view input) {
  const auto trimmed = js_trim(input);

  if (trimmed.empty()) {
    return {.code = "invalid_path", .message = "Docs path must be a non-empty string."};
  }

  if (trimmed.size() >= 3 && is_ascii_letter(static_cast<unsigned char>(trimmed[0])) && trimmed[1] == ':'
      && (trimmed[2] == '/' || trimmed[2] == '\\')) {
    return {.code = "invalid_path", .message = "Docs path must not be an absolute Windows path."};
  }

  if (starts_with(trimmed, "/")) {
    return {.code = "invalid_path", .message = "Docs path must not be an absolute path."};
  }

  auto normalized = normalize_slashes(trimmed);

  while (starts_with(normalized, "./")) {
    normalized.erase(0, 2);
  }

  if (normalized.empty() || ends_with(normalized, "/")) {
    return {.code = "invalid_path", .message = "Docs path must point to a Markdown file."};
  }

  const auto segments = split(normalized, '/');

  for (const auto& segment : segments) {
    if (segment == "..") {
      return {.code = "path_traversal", .message = "Docs path must not contain path traversal segments."};
    }
  }

  for (const auto& segment : segments) {
    if (segment.empty() || segment == ".") {
      return {.code = "invalid_path", .message = "Docs path contains an invalid path segment."};
    }
  }

  if (!ends_with(normalized, ".md")) {
    return {.code = "non_markdown_file", .message = "Docs path must end in .md."};
  }

  if (segments.back() == ".md") {
    return {.code = "invalid_path", .message = "Docs path must include a Markdown filename."};
  }

  auto route_segments = segments;
  route_segments.back() = route_segments.back().substr(0, route_segments.back().size() - 3);

  if (ascii_lower(route_segments.back()) == "index") {
    route_segments.pop_back();
  }

  return {
    .ok = true,
    .path = normalized,
    .route_segments = route_segments,
  };
}

// src/sync/paths.ts normalizeAssetPath
NormalizedAssetPath normalize_asset_path(std::string_view input) {
  const auto trimmed = js_trim(input);

  if (trimmed.empty()) {
    return {.code = "invalid_path", .message = "Asset path must be a non-empty string."};
  }

  if (trimmed.size() >= 3 && is_ascii_letter(static_cast<unsigned char>(trimmed[0])) && trimmed[1] == ':'
      && (trimmed[2] == '/' || trimmed[2] == '\\')) {
    return {.code = "invalid_path", .message = "Asset path must not be an absolute Windows path."};
  }

  if (starts_with(trimmed, "/")) {
    return {.code = "invalid_path", .message = "Asset path must not be an absolute path."};
  }

  auto normalized = normalize_slashes(trimmed);

  while (starts_with(normalized, "./")) {
    normalized.erase(0, 2);
  }

  if (normalized.empty() || ends_with(normalized, "/")) {
    return {.code = "invalid_path", .message = "Asset path must point to a file."};
  }

  const auto segments = split(normalized, '/');

  for (const auto& segment : segments) {
    if (segment == "..") {
      return {.code = "path_traversal", .message = "Asset path must not contain path traversal segments."};
    }
  }

  for (const auto& segment : segments) {
    if (segment.empty() || segment == ".") {
      return {.code = "invalid_path", .message = "Asset path contains an invalid path segment."};
    }
  }

  return {
    .ok = true,
    .path = normalized,
    .segments = segments,
  };
}

std::string normalize_route_path(std::string_view route) {
  return normalize_route_base(route);
}

std::string join_route_paths(const std::vector<std::string>& segments) {
  std::vector<std::string> kept;

  for (const auto& segment : segments) {
    auto trimmed = js_trim(segment);

    if (!trimmed.empty()) {
      kept.push_back(std::move(trimmed));
    }
  }

  return normalize_route_path(join(kept, "/"));
}

bool is_route_descendant_or_equal(std::string_view parent, std::string_view child) {
  const auto normalized_parent = normalize_route_path(parent);
  const auto normalized_child = normalize_route_path(child);

  return normalized_parent == "/" || normalized_child == normalized_parent
    || starts_with(normalized_child, normalized_parent + "/");
}

// src/sync/paths.ts deriveRouteFromSourcePath
std::string derive_route_from_source_path(
  const std::string& source_path,
  const std::string& route_base,
  const std::optional<std::string>& slug
) {
  const auto parts = derive_route_parts(source_path, route_base, slug);
  const auto suffix = join(parts.segments, "/");

  if (suffix.empty()) {
    return parts.route_base;
  }

  return normalize_slashes(parts.route_base + "/" + suffix);
}

// src/sync/paths.ts checkDocsRouteSegments
RouteSegmentCheck check_route_segments(
  const std::string& source_path,
  const std::string& route_base,
  const std::optional<std::string>& slug
) {
  RouteSegmentCheck check;

  for (const auto& segment : derive_route_parts(source_path, route_base, slug).segments) {
    if (segment.find('?') != std::string::npos || segment.find('#') != std::string::npos
        || contains_code_point_matching(segment, is_control_code_point)) {
      check.unservable.push_back(segment);
    } else if (contains_code_point_matching(segment, is_non_control_whitespace)) {
      check.whitespace.push_back(segment);
    }
  }

  return check;
}

// src/sync/paths.ts deriveAssetRouteFromSourcePath (without a client route)
std::optional<std::string> derive_asset_route(
  const std::string& kind,
  const std::string& asset_route_base,
  const std::string& source_id,
  const std::string& source_path
) {
  if (kind == "llms") {
    return "/llms.txt";
  }

  if (kind == "llms-full") {
    return "/llms-full.txt";
  }

  if (kind != "skill" || source_id.empty()) {
    return std::nullopt;
  }

  const auto expected_prefix = "skills/" + source_id + "/";

  if (!starts_with(source_path, expected_prefix)) {
    return std::nullopt;
  }

  const auto skill_path = source_path.substr(expected_prefix.size());

  if (skill_path.empty()) {
    return std::nullopt;
  }

  return join_route_paths({asset_route_base, "skills", skill_path});
}

// src/sync/paths.ts resolveAssetRoute
AssetRouteResult resolve_asset_route(
  const std::string& kind,
  const std::optional<std::string>& route,
  const std::string& asset_route_base,
  const std::string& source_id,
  const std::string& source_path
) {
  const auto derived = derive_asset_route(kind, asset_route_base, source_id, source_path);
  const auto requested = route && !js_trim(*route).empty() ? route : std::nullopt;

  if (!requested) {
    return {.ok = true, .route = derived};
  }

  if (kind == "skill") {
    const auto ignored = is_unsafe_client_route(*requested) || normalize_route_path(*requested) != derived;
    AssetRouteResult result{.ok = true, .route = derived};

    if (ignored) {
      result.warning = make_issue(
        "asset_route_ignored",
        "Skill asset routes are derived from the docs set; the manifest route was ignored."
      );
    }

    return result;
  }

  if (is_unsafe_client_route(*requested)) {
    return {
      .code = "invalid_asset_route",
      .message = "Asset route must not contain \".\" or \"..\" segments, percent-encoding, \"?\", \"#\", or control characters.",
    };
  }

  const auto normalized_route = normalize_route_path(*requested);
  const auto normalized_base = normalize_route_base(asset_route_base);

  if (kind == "llms" || kind == "llms-full") {
    const std::string file_name = kind == "llms" ? "llms.txt" : "llms-full.txt";
    const auto root_route = "/" + file_name;
    const auto base_route = join_route_paths({normalized_base, file_name});

    if (normalized_route == root_route || normalized_route == base_route) {
      return {.ok = true, .route = normalized_route};
    }

    return {
      .code = "invalid_asset_route",
      .message = "Asset route for " + kind + " must be \"" + root_route + "\" or \"" + base_route + "\".",
    };
  }

  const auto inside_base = normalized_base == "/" || normalized_route == normalized_base
    || starts_with(normalized_route, normalized_base + "/");

  if (inside_base) {
    return {.ok = true, .route = normalized_route};
  }

  return {
    .code = "invalid_asset_route",
    .message = "Asset route \"" + normalized_route + "\" must stay under the docs set asset route \"" + normalized_base + "\".",
  };
}

// ECMAScript Number(value) for frontmatter values, finite results only.
std::optional<double> parse_js_number(std::string_view raw) {
  const auto value = js_trim(raw);

  if (value.empty()) {
    return 0.0;
  }

  if (value.size() > 2 && value[0] == '0') {
    const auto prefix = static_cast<char>(value[1] | 0x20);
    const auto digits = std::string_view{value}.substr(2);

    if (prefix == 'x') {
      return parse_radix_integer(digits, 16);
    }

    if (prefix == 'o') {
      return parse_radix_integer(digits, 8);
    }

    if (prefix == 'b') {
      return parse_radix_integer(digits, 2);
    }
  }

  // StrDecimalLiteral: [+-]? (digits [. digits?] | . digits) ([eE] [+-]? digits)?
  std::size_t index = 0;

  if (value[index] == '+' || value[index] == '-') {
    ++index;
  }

  std::size_t integer_digits = 0;
  std::size_t fraction_digits = 0;

  while (index < value.size() && is_ascii_digit(static_cast<unsigned char>(value[index]))) {
    ++index;
    ++integer_digits;
  }

  if (index < value.size() && value[index] == '.') {
    ++index;

    while (index < value.size() && is_ascii_digit(static_cast<unsigned char>(value[index]))) {
      ++index;
      ++fraction_digits;
    }
  }

  if (integer_digits == 0 && fraction_digits == 0) {
    return std::nullopt;
  }

  if (index < value.size() && (value[index] == 'e' || value[index] == 'E')) {
    ++index;

    if (index < value.size() && (value[index] == '+' || value[index] == '-')) {
      ++index;
    }

    std::size_t exponent_digits = 0;

    while (index < value.size() && is_ascii_digit(static_cast<unsigned char>(value[index]))) {
      ++index;
      ++exponent_digits;
    }

    if (exponent_digits == 0) {
      return std::nullopt;
    }
  }

  if (index != value.size()) {
    return std::nullopt;
  }

  const auto* begin = value.data() + (value[0] == '+' ? 1 : 0);
  double parsed = 0;
  const auto [end, error] = std::from_chars(begin, value.data() + value.size(), parsed);

  if (error == std::errc::result_out_of_range) {
    // Overflow is Infinity (rejected); underflow rounds towards zero like JS.
    const auto fallback = std::strtod(std::string{value}.c_str(), nullptr);
    return std::isfinite(fallback) ? std::optional<double>{fallback} : std::nullopt;
  }

  if (error != std::errc{} || end != value.data() + value.size() || !std::isfinite(parsed)) {
    return std::nullopt;
  }

  return parsed;
}

// src/sync/frontmatter.ts parseDocsFrontmatter
ParsedFrontmatter parse_frontmatter(const std::string& markdown, const std::optional<std::string>& path) {
  ParsedFrontmatter result;
  const auto source = strip_byte_order_mark(markdown);
  const auto lines = split_markdown_lines(source);
  result.content = source;

  if (lines.size() < 2 || lines[0] != "---") {
    return result;
  }

  std::optional<std::size_t> closing_index;

  for (std::size_t index = 1; index < lines.size(); ++index) {
    if (js_trim(lines[index]) == "---") {
      closing_index = index;
      break;
    }
  }

  if (!closing_index) {
    result.issues.push_back(make_issue("invalid_frontmatter", "Frontmatter block is missing a closing delimiter.", path));
    return result;
  }

  enum class ContextKind { None, Array, Ignored, Scalar };
  ContextKind context = ContextKind::None;
  std::string context_key;

  for (std::size_t index = 1; index < *closing_index; ++index) {
    const auto& line = lines[index];

    if (js_trim(line).empty()) {
      continue;
    }

    const auto trimmed_start = js_trim_start(line);
    const auto indented = trimmed_start.size() != line.size();

    if (starts_with(trimmed_start, "#")) {
      continue;
    }

    if (starts_with(trimmed_start, "- ")) {
      if (context == ContextKind::Array) {
        array_field(result.frontmatter, context_key).push_back(strip_quotes(std::string_view{trimmed_start}.substr(2)));
        continue;
      }

      if (context == ContextKind::Ignored) {
        continue;
      }

      result.issues.push_back(make_issue("invalid_frontmatter", "Frontmatter array item does not belong to a supported array field.", path));
      continue;
    }

    if (indented) {
      if (context == ContextKind::Ignored) {
        continue;
      }

      if (context == ContextKind::Array || context == ContextKind::Scalar) {
        result.issues.push_back(make_issue(
          "invalid_frontmatter",
          context == ContextKind::Array
            ? "Frontmatter field \"" + context_key + "\" only supports \"- item\" list entries."
            : "Frontmatter field \"" + context_key + "\" does not support nested or multi-line values.",
          path
        ));
        context = ContextKind::Ignored;
        continue;
      }

      result.issues.push_back(make_issue("invalid_frontmatter", "Unsupported indented frontmatter line: " + line, path));
      continue;
    }

    const auto separator = line.find(':');
    const auto key = separator != std::string::npos && separator > 0 ? js_trim(std::string_view{line}.substr(0, separator)) : std::string{};
    const auto raw_value = separator != std::string::npos && separator > 0 ? js_trim(std::string_view{line}.substr(separator + 1)) : std::string{};

    if (!is_frontmatter_key(key)) {
      result.issues.push_back(make_issue("invalid_frontmatter", "Unsupported frontmatter line: " + line, path));
      context = ContextKind::None;
      continue;
    }

    if (!known_frontmatter_fields().contains(key)) {
      result.warnings.push_back(make_issue("invalid_frontmatter", "Unknown frontmatter field \"" + key + "\" was ignored.", path));
      context = ContextKind::Ignored;
      context_key = key;
      continue;
    }

    if (is_array_frontmatter_field(key)) {
      context_key = key;

      if (raw_value.empty()) {
        context = ContextKind::Array;
        array_field(result.frontmatter, key).clear();
        continue;
      }

      context = ContextKind::Ignored;

      if (starts_with(raw_value, "[")) {
        if (auto items = parse_flow_sequence(raw_value)) {
          array_field(result.frontmatter, key) = std::move(*items);
          continue;
        }

        result.issues.push_back(make_issue(
          "invalid_frontmatter",
          "Frontmatter field \"" + key + "\" has an invalid flow list; use [a, b] or \"- item\" lines.",
          path
        ));
        continue;
      }

      result.issues.push_back(make_issue("invalid_frontmatter", "Frontmatter field \"" + key + "\" must use list item syntax.", path));
      continue;
    }

    if (is_block_scalar_indicator(raw_value)) {
      result.issues.push_back(make_issue(
        "invalid_frontmatter",
        "Frontmatter field \"" + key + "\" uses a YAML block scalar (" + raw_value + "), which is not supported; use a single-line value.",
        path
      ));
      context = ContextKind::Ignored;
      context_key = key;
      continue;
    }

    context = ContextKind::Scalar;
    context_key = key;
    auto assigned = assign_frontmatter_value(result.frontmatter, key, raw_value, path);

    if (assigned.issue) {
      result.issues.push_back(std::move(*assigned.issue));
    }

    if (assigned.warning) {
      result.warnings.push_back(std::move(*assigned.warning));
    }
  }

  auto more_issues = validate_parsed_frontmatter(result.frontmatter, path);
  result.issues.insert(result.issues.end(), more_issues.begin(), more_issues.end());

  std::vector<std::string> body(lines.begin() + static_cast<std::ptrdiff_t>(*closing_index + 1), lines.end());
  auto content = join(body, "\n");

  if (starts_with(content, "\n")) {
    content.erase(0, 1);
  }

  result.content = std::move(content);
  return result;
}

// src/sync/title.ts stripInlineMarkdown
std::string strip_inline_markdown(std::string_view value) {
  auto tokens = tokenize_inline(value);

  for (std::size_t index = 0; index < tokens.size(); ++index) {
    auto& opener = tokens[index];

    if (!opener.delimiter || opener.removed || !opener.can_open || (opener.character == '~' && opener.length > 2)
        || opener.length > 3) {
      continue;
    }

    for (auto candidate = index + 1; candidate < tokens.size(); ++candidate) {
      auto& closer = tokens[candidate];

      if (closer.delimiter && !closer.removed && closer.can_close && closer.character == opener.character
          && closer.length == opener.length) {
        opener.removed = true;
        closer.removed = true;
        break;
      }
    }
  }

  std::string output;

  for (const auto& token : tokens) {
    if (!token.delimiter) {
      output += token.value;
    } else if (!token.removed) {
      output.append(token.length, token.character);
    }
  }

  return output;
}

// src/sync/title.ts inferTitleFromMarkdown
std::optional<std::string> infer_title_from_markdown(std::string_view content) {
  std::optional<Fence> fence;
  std::vector<std::string> paragraph;

  for (const auto& line : split_markdown_lines(content)) {
    if (fence) {
      if (is_fence_close(line, *fence)) {
        fence.reset();
      }

      continue;
    }

    if (const auto fence_open = match_fence_open(line)) {
      fence = fence_open;
      paragraph.clear();
      continue;
    }

    if (is_blank_line(line)) {
      paragraph.clear();
      continue;
    }

    if (indent_width(line) >= 4) {
      if (!paragraph.empty()) {
        paragraph.push_back(js_trim(line));
      }

      continue;
    }

    if (const auto atx = match_atx_heading(line)) {
      paragraph.clear();

      if (atx->level == 1) {
        if (auto title = finish_title(atx->text)) {
          return title;
        }
      }

      continue;
    }

    if (!paragraph.empty() && is_setext_h1_underline(line)) {
      if (auto title = finish_title(join(paragraph, " "))) {
        return title;
      }

      paragraph.clear();
      continue;
    }

    if (is_thematic_break_or_setext_h2_underline(line) || is_blockquote_line(line) || is_list_item_line(line)) {
      paragraph.clear();
      continue;
    }

    paragraph.push_back(js_trim(line));
  }

  return std::nullopt;
}

// src/sync/frontmatter.ts titleFromSourcePath
std::string title_from_source_path(const std::string& source_path) {
  const auto normalized = normalize_docs_path(source_path);

  if (!normalized.ok) {
    return "Untitled";
  }

  const auto segments = split(normalized.path, '/');
  const auto& last = segments.back();
  auto base = ascii_lower(last) == "index.md" ? (segments.size() > 1 ? segments[segments.size() - 2] : std::string{"index"}) : last;

  if (ends_with(base, ".md")) {
    base.resize(base.size() - 3);
  }

  std::vector<std::string> parts;
  std::string current;

  for (std::size_t index = 0; index < base.size();) {
    const auto decoded = decode_at(base, index);
    const auto is_separator = decoded.code_point == '-' || decoded.code_point == '_'
      || (is_js_whitespace(decoded.code_point) && !(decoded.length == 1 && decoded.code_point >= 0x80));

    if (is_separator) {
      if (!current.empty()) {
        parts.push_back(current);
        current.clear();
      }
    } else {
      current += base.substr(index, decoded.length);
    }

    index += decoded.length;
  }

  if (!current.empty()) {
    parts.push_back(current);
  }

  for (auto& part : parts) {
    part = uppercase_first_code_unit(part);
  }

  auto title = join(parts, " ");
  return title.empty() ? "Untitled" : title;
}

// src/sync/frontmatter.ts resolveDocsTitle
std::string resolve_title(const ParsedFrontmatter& parsed, const std::string& source_path) {
  if (parsed.frontmatter.title && !parsed.frontmatter.title->empty()) {
    return *parsed.frontmatter.title;
  }

  if (const auto inferred = infer_title_from_markdown(parsed.content)) {
    return *inferred;
  }

  return title_from_source_path(source_path);
}

json frontmatter_to_json(const Frontmatter& frontmatter) {
  json output = json::object();

  if (frontmatter.has_dependencies) {
    output["dependencies"] = frontmatter.dependencies;
  }
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
    const auto order = *frontmatter.order;

    // Integral values serialize like JSON.stringify (2, not 2.0; -0 as 0).
    if (std::trunc(order) == order && std::fabs(order) < 9007199254740992.0) {
      output["order"] = static_cast<std::int64_t>(order);
    } else {
      output["order"] = order;
    }
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

// src/sync/assetContentTypes.ts getDocsAssetContentTypeForPath
std::string asset_content_type(std::string_view asset_path) {
  const auto slash = asset_path.rfind('/');
  const auto file_name = slash == std::string_view::npos ? asset_path : asset_path.substr(slash + 1);
  const auto dot = file_name.rfind('.');
  const auto extension = dot != std::string_view::npos && dot > 0 ? ascii_lower(std::string{file_name.substr(dot)}) : std::string{};

  if (extension == ".json") {
    return "application/json; charset=utf-8";
  }

  if (extension == ".md") {
    return "text/markdown; charset=utf-8";
  }

  if (extension == ".yaml" || extension == ".yml") {
    return "application/yaml; charset=utf-8";
  }

  return "text/plain; charset=utf-8";
}

// src/sync/assetContentTypes.ts isAllowedDocsAssetContentType
bool is_allowed_asset_content_type(std::string_view content_type) {
  auto parts = split(content_type, ';');

  for (auto& part : parts) {
    part = ascii_lower(js_trim(part));
  }

  static const std::set<std::string> allowed = {"application/json", "application/yaml", "text/markdown", "text/plain"};

  if (!allowed.contains(parts.front())) {
    return false;
  }

  return std::all_of(parts.begin() + 1, parts.end(), [](const std::string& parameter) {
    return parameter == "charset=utf-8";
  });
}

bool is_valid_delete_behavior(const std::string& value) {
  return value == "archive" || value == "delete" || value == "draft" || value == "ignore";
}

namespace {

bool is_valid_hash_for(const json& entry, const std::string& computed_hash) {
  if (!entry.contains("sha256")) {
    return true;
  }

  const auto& value = entry["sha256"];

  if (!value.is_string()) {
    return false;
  }

  const auto hash = value.get<std::string>();

  if (hash.size() != 64 || !std::ranges::all_of(hash, [](const char ch) {
        return std::isxdigit(static_cast<unsigned char>(ch)) != 0;
      })) {
    return false;
  }

  return ascii_lower(hash) == computed_hash;
}

std::optional<std::string> string_member(const json& entry, const char* key) {
  if (entry.is_object() && entry.contains(key) && entry[key].is_string()) {
    return entry[key].get<std::string>();
  }

  return std::nullopt;
}

} // namespace

// src/sync/validate.ts validateDocsManifest
ValidationResult validate_manifest(const json& manifest, const ValidationOptions& options) {
  ValidationResult result;
  const auto route_base = options.route_base.empty() ? std::string{"/docs"} : options.route_base;
  const auto asset_route_base = options.asset_route_base.empty() ? route_base : options.asset_route_base;
  const auto max_assets = options.max_assets;

  if (!manifest.is_object()) {
    result.issues.push_back(make_issue("invalid_manifest", "Manifest must be an object."));
    return result;
  }

  if (!manifest.contains("version") || !manifest["version"].is_number() || manifest["version"].get<double>() != 1.0) {
    result.issues.push_back(make_issue("invalid_version", "Manifest version must be 1."));
  }

  const auto source_id = manifest.contains("source") ? string_member(manifest["source"], "id") : std::nullopt;

  if (!source_id || js_trim(*source_id).empty()) {
    result.issues.push_back(make_issue("invalid_source", "Manifest source.id is required."));
  } else if (options.allowed_source_ids
             && std::ranges::find(*options.allowed_source_ids, *source_id) == options.allowed_source_ids->end()) {
    result.issues.push_back(make_issue("invalid_source", "Manifest source.id \"" + *source_id + "\" is not allowed."));
  } else {
    result.source_id = *source_id;
    result.source_branch = string_member(manifest["source"], "branch");
    result.source_commit = string_member(manifest["source"], "commit");
    result.source_repository = string_member(manifest["source"], "repository");
  }

  if (manifest.contains("mode")) {
    if (!manifest["mode"].is_string() || (manifest["mode"] != "dry-run" && manifest["mode"] != "sync")) {
      result.issues.push_back(make_issue("invalid_mode", "Manifest mode must be \"dry-run\" or \"sync\"."));
    } else {
      result.mode_dry_run = manifest["mode"] == "dry-run";
    }
  }

  if (manifest.contains("deleteBehavior")) {
    if (!manifest["deleteBehavior"].is_string() || !is_valid_delete_behavior(manifest["deleteBehavior"].get<std::string>())) {
      result.issues.push_back(make_issue("invalid_delete_behavior", "Manifest deleteBehavior must be archive, delete, draft, or ignore."));
    } else {
      result.delete_behavior = manifest["deleteBehavior"].get<std::string>();
    }
  }

  if (manifest.contains("publish")) {
    if (!manifest["publish"].is_boolean()) {
      result.issues.push_back(make_issue("invalid_manifest", "Manifest publish must be a boolean."));
    } else {
      result.publish = manifest["publish"].get<bool>();
    }
  }

  const auto has_files_array = manifest.contains("files") && manifest["files"].is_array();
  const auto has_assets_array = !manifest.contains("assets") || manifest["assets"].is_array();
  const auto file_count = has_files_array ? manifest["files"].size() : 0;
  const auto asset_count = has_assets_array && manifest.contains("assets") ? manifest["assets"].size() : 0;

  if (!has_files_array) {
    result.issues.push_back(make_issue("invalid_manifest", "Manifest files must be an array."));
  }

  if (!has_assets_array) {
    result.issues.push_back(make_issue("invalid_manifest", "Manifest assets must be an array when provided."));
  }

  if (file_count == 0 && asset_count == 0) {
    result.issues.push_back(make_issue("empty_manifest", "Manifest must include at least one docs file or asset."));
  }

  if (file_count > options.max_files) {
    result.issues.push_back(make_issue("too_many_files", "Manifest exceeds maximum file count of " + std::to_string(options.max_files) + "."));
  }

  if (asset_count > max_assets) {
    result.issues.push_back(make_issue("too_many_assets", "Manifest exceeds maximum asset count of " + std::to_string(max_assets) + "."));
  }

  std::set<std::string> normalized_paths;
  std::set<std::string> normalized_asset_paths;
  std::size_t total_bytes = 0;

  if (has_files_array) {
    for (const auto& file : manifest["files"]) {
      if (!file.is_object()) {
        result.issues.push_back(make_issue("invalid_manifest", "Manifest file entries must be objects."));
        continue;
      }

      const auto path = string_member(file, "path");
      const auto content = string_member(file, "content");

      if (!path || path->empty() || !content) {
        result.issues.push_back(make_issue("invalid_manifest", "Manifest file entries require string path and content.", path));
        continue;
      }

      const auto normalized = normalize_docs_path(*path);

      if (!normalized.ok) {
        result.issues.push_back(make_issue(normalized.code, normalized.message, path));
        continue;
      }

      total_bytes += content->size();

      if (content->size() > options.max_file_bytes) {
        result.issues.push_back(make_issue("file_too_large", "File exceeds maximum size of " + std::to_string(options.max_file_bytes) + " bytes.", normalized.path));
      }

      const auto computed_hash = sha256_hex(*content);

      if (!is_valid_hash_for(file, computed_hash)) {
        result.issues.push_back(make_issue("invalid_hash", "Manifest file sha256 does not match content.", normalized.path));
      }

      auto parsed = parse_frontmatter(*content, normalized.path);
      result.issues.insert(result.issues.end(), parsed.issues.begin(), parsed.issues.end());
      result.warnings.insert(result.warnings.end(), parsed.warnings.begin(), parsed.warnings.end());

      const auto route = derive_route_from_source_path(normalized.path, route_base, parsed.frontmatter.slug);
      const auto segment_check = check_route_segments(normalized.path, route_base, parsed.frontmatter.slug);

      for (const auto& segment : segment_check.unservable) {
        result.issues.push_back(make_issue(
          "invalid_route",
          "Route segment " + json_quote(segment) + " contains \"?\", \"#\", or a control character and cannot be served.",
          normalized.path
        ));
      }

      for (const auto& segment : segment_check.whitespace) {
        result.warnings.push_back(make_issue(
          "route_whitespace",
          "Route segment " + json_quote(segment) + " contains whitespace and is only reachable percent-encoded.",
          normalized.path
        ));
      }

      if (normalized_paths.contains(normalized.path)) {
        result.issues.push_back(make_issue("duplicate_path", "Manifest contains duplicate normalized paths.", normalized.path));
      }
      normalized_paths.insert(normalized.path);

      result.files.push_back({
        .content = parsed.content,
        .frontmatter = parsed.frontmatter,
        .path = normalized.path,
        .route = route,
        .sha256 = computed_hash,
        .title = resolve_title(parsed, normalized.path),
      });
    }
  }

  if (has_assets_array && manifest.contains("assets")) {
    static const std::set<std::string> asset_kinds = {"llms", "llms-full", "skill", "static"};

    for (const auto& asset : manifest["assets"]) {
      if (!asset.is_object()) {
        result.issues.push_back(make_issue("invalid_asset", "Manifest asset entries must be objects."));
        continue;
      }

      const auto path = string_member(asset, "path");
      const auto content = string_member(asset, "content");
      const auto raw_content_type = string_member(asset, "contentType");
      const auto content_type = raw_content_type ? js_trim(*raw_content_type) : std::string{};
      const auto has_kind = asset.contains("kind") && !asset["kind"].is_null()
        && !(asset["kind"].is_string() && asset["kind"].get<std::string>().empty())
        && !(asset["kind"].is_boolean() && !asset["kind"].get<bool>())
        && !(asset["kind"].is_number() && asset["kind"].get<double>() == 0.0);
      const auto route = string_member(asset, "route");
      const auto client_route = route && !js_trim(*route).empty() ? route : std::nullopt;

      if (!path || path->empty() || !content || content_type.empty() || !has_kind) {
        result.issues.push_back(make_issue("invalid_asset", "Manifest asset entries require string path, content, contentType, and kind.", path));
        continue;
      }

      const auto kind = asset["kind"].is_string() ? asset["kind"].get<std::string>() : std::string{};

      if (!asset_kinds.contains(kind)) {
        result.issues.push_back(make_issue("invalid_asset", "Manifest asset kind must be llms, llms-full, skill, or static.", path));
        continue;
      }

      const auto normalized = normalize_asset_path(*path);

      if (!normalized.ok) {
        result.issues.push_back(make_issue(normalized.code, normalized.message, path));
        continue;
      }

      total_bytes += content->size();

      if (content->size() > options.max_file_bytes) {
        result.issues.push_back(make_issue("asset_too_large", "Asset exceeds maximum size of " + std::to_string(options.max_file_bytes) + " bytes.", normalized.path));
      }

      const auto computed_hash = sha256_hex(*content);

      if (!is_valid_hash_for(asset, computed_hash)) {
        result.issues.push_back(make_issue("invalid_hash", "Manifest asset sha256 does not match content.", normalized.path));
      }

      auto resolved = resolve_asset_route(kind, client_route, asset_route_base, result.source_id, normalized.path);

      if (!resolved.ok) {
        result.issues.push_back(make_issue(resolved.code, resolved.message, normalized.path));
      } else if (resolved.warning) {
        auto warning = *resolved.warning;
        warning.path = normalized.path;
        result.warnings.push_back(std::move(warning));
      }

      if (normalized_asset_paths.contains(normalized.path)) {
        result.issues.push_back(make_issue("duplicate_asset_path", "Manifest contains duplicate normalized asset paths.", normalized.path));
      }
      normalized_asset_paths.insert(normalized.path);

      result.assets.push_back({
        .content = *content,
        .content_type = content_type,
        .kind = kind,
        .path = normalized.path,
        .route = resolved.ok ? resolved.route : std::nullopt,
        .sha256 = computed_hash,
      });
    }
  }

  if (total_bytes > options.max_total_bytes) {
    result.issues.push_back(make_issue("manifest_too_large", "Manifest content exceeds maximum total size of " + std::to_string(options.max_total_bytes) + " bytes."));
  }

  result.ok = result.issues.empty() && !result.source_id.empty();
  return result;
}

// src/sync/routeCollisions.ts findManifestRouteCollisions
std::vector<RouteCollision> find_route_collisions(const ValidationResult& validation) {
  struct Entry {
    std::string path;
    std::string route;
  };

  std::vector<Entry> entries;

  for (const auto& file : validation.files) {
    entries.push_back({file.path, normalize_route_path(file.route)});
  }

  for (const auto& asset : validation.assets) {
    if (asset.route && !asset.route->empty()) {
      entries.push_back({asset.path, normalize_route_path(*asset.route)});
    }
  }

  const auto group_by = [&entries](auto key_of) {
    std::vector<std::string> order;
    std::map<std::string, std::vector<Entry>> groups;

    for (const auto& entry : entries) {
      const auto key = key_of(entry.route);

      if (!groups.contains(key)) {
        order.push_back(key);
      }

      groups[key].push_back(entry);
    }

    std::vector<std::vector<Entry>> ordered;

    for (const auto& key : order) {
      ordered.push_back(groups[key]);
    }

    return ordered;
  };

  std::vector<RouteCollision> collisions;

  for (const auto& group : group_by([](const std::string& route) { return route; })) {
    if (group.size() > 1) {
      RouteCollision collision{.reason = "exact_route_collision", .route = group.front().route, .routes = {group.front().route}};

      for (const auto& entry : group) {
        collision.paths.push_back(entry.path);
      }

      collisions.push_back(std::move(collision));
    }
  }

  for (const auto& group : group_by([](const std::string& route) { return ascii_lower(route); })) {
    std::vector<std::string> routes;

    for (const auto& entry : group) {
      if (std::ranges::find(routes, entry.route) == routes.end()) {
        routes.push_back(entry.route);
      }
    }

    if (routes.size() > 1) {
      RouteCollision collision{.reason = "case_insensitive_route_collision", .route = group.front().route, .routes = routes};

      for (const auto& entry : group) {
        collision.paths.push_back(entry.path);
      }

      collisions.push_back(std::move(collision));
    }
  }

  return collisions;
}

std::string serialize_body(const json& manifest) {
  return manifest.dump();
}

bool verify_ed25519_signature(const std::string& public_key_pem, std::string_view message, const std::string& signature_base64) {
  std::unique_ptr<BIO, decltype(&BIO_free)> bio{BIO_new_mem_buf(public_key_pem.data(), static_cast<int>(public_key_pem.size())), &BIO_free};

  if (!bio) {
    return false;
  }

  std::unique_ptr<EVP_PKEY, decltype(&EVP_PKEY_free)> key{PEM_read_bio_PUBKEY(bio.get(), nullptr, nullptr, nullptr), &EVP_PKEY_free};

  if (!key) {
    return false;
  }

  std::string signature(((signature_base64.size() + 3) / 4) * 3, '\0');
  const auto decoded = EVP_DecodeBlock(
    reinterpret_cast<unsigned char*>(signature.data()),
    reinterpret_cast<const unsigned char*>(signature_base64.data()),
    static_cast<int>(signature_base64.size())
  );

  if (decoded < 0) {
    return false;
  }

  auto padding = 0;
  for (auto it = signature_base64.rbegin(); it != signature_base64.rend() && *it == '='; ++it) {
    ++padding;
  }
  signature.resize(static_cast<std::size_t>(decoded - padding));

  std::unique_ptr<EVP_MD_CTX, decltype(&EVP_MD_CTX_free)> context{EVP_MD_CTX_new(), &EVP_MD_CTX_free};

  if (!context || EVP_DigestVerifyInit(context.get(), nullptr, nullptr, nullptr, key.get()) <= 0) {
    return false;
  }

  return EVP_DigestVerify(
    context.get(),
    reinterpret_cast<const unsigned char*>(signature.data()),
    signature.size(),
    reinterpret_cast<const unsigned char*>(message.data()),
    message.size()
  ) == 1;
}

} // namespace pmdocs::contract
