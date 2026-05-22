#pragma once

#include "pmdocs/cli.hpp"

#include <filesystem>
#include <map>
#include <optional>
#include <string>

namespace pmdocs {

struct DocsCommandOptions {
  std::optional<std::string> branch;
  std::optional<std::string> commit;
  std::optional<std::filesystem::path> docs_flag;
  std::filesystem::path docs_root = "./docs";
  bool docs_root_explicit = false;
  std::optional<std::string> existing_path;
  bool include_docs = true;
  bool include_llms = true;
  bool include_llms_full = true;
  bool include_skills = true;
  std::filesystem::path llms_full_path = "./llms-full.txt";
  bool llms_full_path_explicit = false;
  std::filesystem::path llms_path = "./llms.txt";
  bool llms_path_explicit = false;
  std::optional<std::size_t> max_file_bytes;
  std::optional<std::size_t> max_files;
  std::optional<std::size_t> max_total_bytes;
  bool pretty = false;
  bool print_json = false;
  std::optional<std::string> repository;
  std::filesystem::path skills_root = "./skills";
  bool skills_root_explicit = false;
  std::optional<std::string> source_id;
  bool no_docs = false;
  bool no_llms = false;
  bool no_llms_full = false;
  bool no_skills = false;
};

struct PlanCommandOptions : DocsCommandOptions {
  std::optional<std::string> delete_behavior;
};

struct KeygenOptions {
  bool force = false;
  std::string format = "pem";
  std::optional<std::filesystem::path> out_dir;
};

struct GeneratedKeyPair {
  std::string private_key;
  std::string public_key;
};

struct SignedDocsRequest {
  std::string body;
  std::map<std::string, std::string> headers;
};

struct PushCommandOptions : DocsCommandOptions {
  std::optional<std::string> delete_behavior;
  bool dry_run = false;
  std::string endpoint;
  bool github_oidc = false;
  std::optional<std::string> key_id;
  std::optional<std::string> oidc_token_env;
  std::optional<std::string> private_key_env;
  std::optional<std::filesystem::path> private_key_file;
  bool publish = false;
  bool strict_routes = false;
};

std::string sha256_hex(std::string_view input);
std::string build_canonical_signing_string(
  const std::string& body_sha256,
  const std::string& method,
  const std::string& path,
  const std::string& timestamp,
  const std::string& nonce
);
GeneratedKeyPair generate_ed25519_key_pair(const std::string& format);
SignedDocsRequest sign_docs_sync_request(
  const std::string& body,
  const std::string& endpoint,
  const std::string& key_id,
  const std::string& private_key,
  const std::string& nonce,
  const std::string& timestamp
);

CommandResult run_keygen_command(const KeygenOptions& options);
CommandResult run_validate_command(const DocsCommandOptions& options);
CommandResult run_manifest_command(const DocsCommandOptions& options);
CommandResult run_plan_command(const PlanCommandOptions& options);
CommandResult run_push_command(const PushCommandOptions& options);

} // namespace pmdocs
