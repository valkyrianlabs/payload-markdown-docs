#pragma once

#include "pmdocs/cli.hpp"

#include <filesystem>
#include <optional>
#include <string>

namespace pmdocs {

struct DocsCommandOptions {
  std::optional<std::string> branch;
  std::optional<std::string> commit;
  std::filesystem::path docs_root;
  std::optional<std::string> existing_path;
  std::optional<std::size_t> max_file_bytes;
  std::optional<std::size_t> max_files;
  std::optional<std::size_t> max_total_bytes;
  bool pretty = false;
  bool print_json = false;
  std::optional<std::string> repository;
  std::optional<std::string> source_id;
};

struct PlanCommandOptions : DocsCommandOptions {
  std::optional<std::string> delete_behavior;
};

std::string sha256_hex(std::string_view input);

CommandResult run_validate_command(const DocsCommandOptions& options);
CommandResult run_manifest_command(const DocsCommandOptions& options);
CommandResult run_plan_command(const PlanCommandOptions& options);

} // namespace pmdocs
