#pragma once

#include <filesystem>
#include <string>
#include <string_view>
#include <vector>

namespace pmdocs {

struct CommandResult {
  int exit_code = 0;
  std::string stdout_text;
  std::string stderr_text;
};

struct InstallSkillOptions {
  std::filesystem::path out_dir = ".codex/skills/payload-markdown-docs";
  std::string docs_root = "docs";
  std::string package_manager = "npm";
  bool force = false;
  bool dry_run = false;
};

std::filesystem::path compiled_data_dir();
std::filesystem::path data_dir();
std::filesystem::path bundled_skill_dir();
std::filesystem::path default_project_skill_dir();

CommandResult run(std::vector<std::string_view> args);
CommandResult run_skill_install(const InstallSkillOptions& options);

} // namespace pmdocs
