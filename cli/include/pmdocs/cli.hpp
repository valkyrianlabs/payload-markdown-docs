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
  std::filesystem::path out_dir;
  std::string agent = "codex";
  std::string docs_root = "./docs";
  std::string package_manager = "npm";
  bool codex = false;
  bool claude = false;
  bool force = false;
  bool dry_run = false;
  // Replace installs that predate skill.json manifests (cannot tell edits apart);
  // `pmdocs skill update` sets it, `pmdocs install skill` requires --force instead.
  bool replace_unversioned = false;
};

struct SkillCheckOptions {
  std::string agent;  // empty: every agent with an installed payload-markdown-docs skill
  std::filesystem::path out_dir;  // payload-markdown-docs skill dir; empty: the agent's default
  std::string docs_root;  // update only; empty: keep the installed value
  std::string package_manager;  // update only; empty: keep the installed value
  bool force = false;  // update only: also replace locally modified skills
  bool dry_run = false;  // update only
  bool json = false;  // check only
};

std::filesystem::path compiled_data_dir();
std::filesystem::path data_dir();
std::filesystem::path bundled_skill_dir();
std::filesystem::path default_project_skill_dir();

CommandResult run(std::vector<std::string_view> args);
CommandResult run_skill_install(const InstallSkillOptions& options);
CommandResult run_skill_check(const SkillCheckOptions& options);
CommandResult run_skill_update(const SkillCheckOptions& options);

// A one-paragraph notice when an agent skill installed in the current project is
// outdated (empty when current, absent, or PMDOCS_SKILL_CHECK=0).
std::string stale_skill_notice();

} // namespace pmdocs
