#pragma once

#include "pmdocs/cli.hpp"

#include <filesystem>
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

std::string sha256_hex(std::string_view input);

CommandResult run_validate_command(const DocsCommandOptions& options);
CommandResult run_manifest_command(const DocsCommandOptions& options);
CommandResult run_plan_command(const PlanCommandOptions& options);

} // namespace pmdocs
