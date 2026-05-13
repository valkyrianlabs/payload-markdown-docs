#include "pmdocs/cli.hpp"

#include "pmdocs_config.hpp"

#include <CLI/CLI.hpp>
#include <nlohmann/json.hpp>

#include <algorithm>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <system_error>
#include <utility>
#include <vector>

namespace pmdocs {
namespace {

constexpr std::string_view kSkillName = "payload-markdown-docs";
constexpr std::string_view kVersion = PMDOCS_VERSION;

struct PlannedFile {
  std::filesystem::path source_path;
  std::filesystem::path destination_path;
  std::filesystem::path relative_path;
  std::string content;
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

void write_file(const std::filesystem::path& path, std::string_view content) {
  std::ofstream output{path, std::ios::binary | std::ios::trunc};

  if (!output) {
    throw std::runtime_error{"Could not write file: " + path.string()};
  }

  output.write(content.data(), static_cast<std::streamsize>(content.size()));

  if (!output) {
    throw std::runtime_error{"Could not finish writing file: " + path.string()};
  }
}

std::string replace_all(std::string input, std::string_view needle, std::string_view replacement) {
  std::size_t offset = 0;

  while ((offset = input.find(needle, offset)) != std::string::npos) {
    input.replace(offset, needle.size(), replacement);
    offset += replacement.size();
  }

  return input;
}

std::string render_template(std::string content, const InstallSkillOptions& options) {
  content = replace_all(std::move(content), "{{docsRoot}}", options.docs_root);
  content = replace_all(std::move(content), "{{packageManager}}", options.package_manager);

  return content;
}

bool is_safe_relative_path(const std::filesystem::path& path) {
  if (path.empty() || path.is_absolute()) {
    return false;
  }

  const auto generic = path.generic_string();

  if (generic.find('\\') != std::string::npos) {
    return false;
  }

  for (const auto& part : path) {
    if (part == ".." || part == ".") {
      return false;
    }
  }

  return true;
}

std::filesystem::path absolute_normalized(const std::filesystem::path& path) {
  return std::filesystem::absolute(path).lexically_normal();
}

bool is_below_or_equal(const std::filesystem::path& child, const std::filesystem::path& parent) {
  const auto normalized_child = absolute_normalized(child);
  const auto normalized_parent = absolute_normalized(parent);
  auto child_it = normalized_child.begin();

  for (auto parent_it = normalized_parent.begin(); parent_it != normalized_parent.end(); ++parent_it) {
    if (child_it == normalized_child.end() || *child_it != *parent_it) {
      return false;
    }

    ++child_it;
  }

  return true;
}

std::optional<std::string> ensure_directory_path(const std::filesystem::path& directory) {
  std::error_code error;
  auto normalized = absolute_normalized(directory);
  std::filesystem::path current;

  for (const auto& part : normalized) {
    current /= part;

    if (current.empty()) {
      continue;
    }

    const auto status = std::filesystem::status(current, error);

    if (error) {
      if (error != std::errc::no_such_file_or_directory) {
        return "Could not inspect path: " + current.string() + ": " + error.message();
      }

      error.clear();
    }

    if (!error && std::filesystem::exists(status)) {
      if (!std::filesystem::is_directory(status)) {
        return "Expected directory but found another file type: " + current.string();
      }

      continue;
    }

    if (!std::filesystem::create_directory(current, error) && error) {
      return "Could not create directory: " + current.string() + ": " + error.message();
    }
  }

  return std::nullopt;
}

std::vector<PlannedFile> collect_planned_files(const InstallSkillOptions& options) {
  const auto source_root = bundled_skill_dir();
  const auto target_root = absolute_normalized(options.out_dir);
  std::error_code error;

  if (!std::filesystem::is_directory(source_root, error)) {
    throw std::runtime_error{
      "Bundled skill data was not found at " + source_root.string()
      + ". Install pmdocs or set PMDOCS_DATA_DIR for local testing."
    };
  }

  std::vector<PlannedFile> files;
  std::filesystem::recursive_directory_iterator iterator{source_root, error};
  const std::filesystem::recursive_directory_iterator end;

  if (error) {
    throw std::runtime_error{"Could not read bundled skill data: " + error.message()};
  }

  for (; iterator != end; iterator.increment(error)) {
    if (error) {
      throw std::runtime_error{"Could not traverse bundled skill data: " + error.message()};
    }

    const auto& entry = *iterator;
    const auto status = entry.symlink_status(error);

    if (error) {
      throw std::runtime_error{"Could not inspect bundled skill file: " + error.message()};
    }

    if (std::filesystem::is_symlink(status)) {
      if (entry.is_directory(error)) {
        iterator.disable_recursion_pending();
      }

      continue;
    }

    if (std::filesystem::is_directory(status)) {
      continue;
    }

    if (!std::filesystem::is_regular_file(status)) {
      continue;
    }

    auto relative_path = std::filesystem::relative(entry.path(), source_root, error);

    if (error) {
      throw std::runtime_error{"Could not compute bundled skill relative path: " + error.message()};
    }

    relative_path = relative_path.lexically_normal();

    if (!is_safe_relative_path(relative_path)) {
      throw std::runtime_error{"Unsafe bundled skill path: " + relative_path.generic_string()};
    }

    const auto destination_path = absolute_normalized(target_root / relative_path);

    if (!is_below_or_equal(destination_path, target_root)) {
      throw std::runtime_error{"Refusing to write outside target directory: " + relative_path.generic_string()};
    }

    files.push_back({
      .source_path = entry.path(),
      .destination_path = destination_path,
      .relative_path = relative_path,
      .content = render_template(read_file(entry.path()), options),
    });
  }

  std::ranges::sort(files, {}, [](const PlannedFile& file) {
    return file.relative_path.generic_string();
  });

  return files;
}

std::vector<std::string> find_conflicts(const std::vector<PlannedFile>& files) {
  std::vector<std::string> conflicts;
  std::error_code error;

  for (const auto& file : files) {
    const auto status = std::filesystem::symlink_status(file.destination_path, error);

    if (error) {
      if (error == std::errc::no_such_file_or_directory) {
        error.clear();
        continue;
      }

      conflicts.push_back(file.relative_path.generic_string() + " (could not inspect destination)");
      error.clear();
      continue;
    }

    if (!std::filesystem::exists(status)) {
      continue;
    }

    if (!std::filesystem::is_regular_file(status)) {
      conflicts.push_back(file.relative_path.generic_string() + " (destination is not a regular file)");
      continue;
    }

    if (read_file(file.destination_path) != file.content) {
      conflicts.push_back(file.relative_path.generic_string());
    }
  }

  return conflicts;
}

std::string format_install_plan(const InstallSkillOptions& options, const std::vector<PlannedFile>& files) {
  std::ostringstream out;
  out << (options.dry_run ? "pmdocs skill install dry-run" : "pmdocs skill install") << "\n\n";
  out << "Source: " << bundled_skill_dir().string() << "\n";
  out << "Target: " << absolute_normalized(options.out_dir).string() << "\n";
  out << "Files:\n";

  for (const auto& file : files) {
    out << "- " << file.relative_path.generic_string() << "\n";
  }

  return out.str();
}

std::string format_conflicts(const std::vector<std::string>& conflicts) {
  std::ostringstream out;
  out << "Skill files already exist with different content. Use --force to overwrite:\n";

  for (const auto& conflict : conflicts) {
    out << "- " << conflict << "\n";
  }

  return out.str();
}

std::string root_help_text() {
  return R"(pmdocs

Usage:
  pmdocs --help
  pmdocs --version
  pmdocs doctor
  pmdocs skill install [options]

Commands:
  doctor          Show native CLI diagnostics.
  skill install   Install bundled Codex skill guidance into the current project.
  skill update    Update an installed Codex skill. (planned)
  validate        Validate a local Markdown docs directory. (planned)
  manifest        Print a JSON docs manifest. (planned)
  plan            Build a dry sync plan. (planned)
  push            Sign and upload a docs manifest. (planned)
  keygen          Generate Ed25519 keys for signed sync. (planned)

The npm binary remains the reference implementation for docs sync behavior
until each command is ported.
)";
}

std::string doctor_help_text() {
  return R"(pmdocs doctor

Usage:
  pmdocs doctor

Reports local native CLI diagnostics only. It does not check networking,
Payload server configuration, auth, OIDC, or signing.
)";
}

std::string skill_install_help_text() {
  std::ostringstream out;
  out << R"(pmdocs skill install

Usage:
  pmdocs skill install [options]

Options:
  --out <path>              Output directory. Defaults to .codex/skills/payload-markdown-docs.
  --docs-root <path>        Docs root to render into installed guidance. Defaults to docs.
  --package-manager <name>  Package manager to render into installed guidance. Defaults to npm.
  --force                   Overwrite existing skill files.
  --dry-run                 Print planned writes without changing files.
  --help                    Show this help.

Copies bundled skill guidance from the installed pmdocs data directory into the
current project. The installer renders {{docsRoot}} and {{packageManager}}
placeholders while copying files.

Bundled skill source:
  )";
  out << bundled_skill_dir().string() << "\n";

  return out.str();
}

CommandResult make_stdout(std::string output) {
  return {
    .exit_code = 0,
    .stdout_text = std::move(output),
  };
}

CommandResult planned_command_result(std::string_view command) {
  return {
    .exit_code = 2,
    .stderr_text = "pmdocs " + std::string{command}
      + " is not implemented in the native CLI yet. Use the npm CLI for this command until it is ported.\n",
  };
}

CommandResult doctor_result() {
  std::error_code cwd_error;
  const auto cwd = std::filesystem::current_path(cwd_error);
  const auto actual_data_dir = data_dir();
  const auto skill_source = bundled_skill_dir();
  std::error_code skill_error;
  const auto skill_found = std::filesystem::is_regular_file(skill_source / "SKILL.md", skill_error);
  const auto project_skill_path = absolute_normalized(default_project_skill_dir());
  const auto override = std::getenv("PMDOCS_DATA_DIR");

  nlohmann::json diagnostics = {
    {"version", std::string{kVersion}},
    {"compiled_data_dir", compiled_data_dir().string()},
    {"data_dir", actual_data_dir.string()},
    {"skill_source", skill_source.string()},
    {"skill_found", skill_found},
    {"project_skill_path", project_skill_path.string()},
  };

  if (!cwd_error) {
    diagnostics["cwd"] = cwd.string();
  }

  if (override != nullptr && *override != '\0') {
    diagnostics["data_dir_override"] = override;
  }

  std::ostringstream out;
  out << "pmdocs doctor\n";
  out << "version: " << diagnostics["version"].get<std::string>() << "\n";

  if (cwd_error) {
    out << "cwd: unavailable (" << cwd_error.message() << ")\n";
  } else {
    out << "cwd: " << diagnostics["cwd"].get<std::string>() << "\n";
  }

  out << "compiled_data_dir: " << diagnostics["compiled_data_dir"].get<std::string>() << "\n";

  if (diagnostics.contains("data_dir_override")) {
    out << "data_dir_override: " << diagnostics["data_dir_override"].get<std::string>() << "\n";
  }

  out << "data_dir: " << diagnostics["data_dir"].get<std::string>() << "\n";
  out << "skill_source: " << diagnostics["skill_source"].get<std::string>() << "\n";
  out << "skill_status: " << (skill_found ? "found" : "not found") << "\n";
  out << "project_skill_path: " << diagnostics["project_skill_path"].get<std::string>() << "\n";

  if (!skill_found) {
    out << "diagnostics:\n";
    out << "- Bundled skill data was not found. Run meson install or set PMDOCS_DATA_DIR for local tests.\n";
  }

  out << "status: ok\n";

  return make_stdout(out.str());
}

struct ArgvBuffer {
  std::vector<std::string> storage;
  std::vector<char*> argv;
};

ArgvBuffer to_argv_buffer(const std::vector<std::string_view>& args) {
  ArgvBuffer buffer;
  buffer.storage.reserve(args.size() + 1);
  buffer.argv.reserve(args.size() + 1);
  buffer.storage.emplace_back("pmdocs");

  for (const auto argument : args) {
    buffer.storage.emplace_back(argument);
  }

  for (auto& argument : buffer.storage) {
    buffer.argv.push_back(argument.data());
  }

  return buffer;
}

} // namespace

std::filesystem::path compiled_data_dir() {
  return std::filesystem::path{PMDOCS_DATA_DIR};
}

std::filesystem::path data_dir() {
  if (const char* override_dir = std::getenv("PMDOCS_DATA_DIR")) {
    if (*override_dir != '\0') {
      return std::filesystem::path{override_dir};
    }
  }

  return compiled_data_dir();
}

std::filesystem::path bundled_skill_dir() {
  return data_dir() / "skills" / std::string{kSkillName};
}

std::filesystem::path default_project_skill_dir() {
  return std::filesystem::path{".codex"} / "skills" / std::string{kSkillName};
}

CommandResult run_skill_install(const InstallSkillOptions& options) {
  try {
    const auto planned_files = collect_planned_files(options);

    if (!options.force) {
      const auto conflicts = find_conflicts(planned_files);

      if (!conflicts.empty()) {
        return {
          .exit_code = 1,
          .stderr_text = format_conflicts(conflicts),
        };
      }
    }

    if (options.dry_run) {
      return make_stdout(format_install_plan(options, planned_files));
    }

    for (const auto& file : planned_files) {
      if (const auto error = ensure_directory_path(file.destination_path.parent_path())) {
        return {
          .exit_code = 1,
          .stderr_text = *error + "\n",
        };
      }

      std::error_code status_error;
      const auto status = std::filesystem::symlink_status(file.destination_path, status_error);
      const auto destination_exists = !status_error && std::filesystem::exists(status);

      if (status_error && status_error != std::errc::no_such_file_or_directory) {
        return {
          .exit_code = 1,
          .stderr_text = "Could not inspect destination: " + file.destination_path.string() + ": " + status_error.message() + "\n",
        };
      }

      if (destination_exists && !std::filesystem::is_regular_file(status)) {
        return {
          .exit_code = 1,
          .stderr_text = "Refusing to overwrite non-regular file: " + file.destination_path.string() + "\n",
        };
      }

      if (!options.force && destination_exists && read_file(file.destination_path) == file.content) {
        continue;
      }

      write_file(file.destination_path, file.content);
    }

    return make_stdout(format_install_plan(options, planned_files));
  } catch (const std::exception& error) {
    return {
      .exit_code = 1,
      .stderr_text = std::string{error.what()} + "\n",
    };
  }
}

CommandResult run(std::vector<std::string_view> args) {
  if (args.empty()) {
    return make_stdout(root_help_text());
  }

  InstallSkillOptions install_options;
  bool doctor_requested = false;
  bool skill_update_requested = false;
  std::string planned_command;

  CLI::App app{"Native CLI for Payload Markdown Docs.", "pmdocs"};
  app.set_help_flag("-h,--help", "Show this help.");
  app.set_version_flag("-V,--version", std::string{"pmdocs "} + std::string{kVersion});
  app.footer("The npm binary remains the reference implementation for docs sync behavior until each command is ported.");

  auto* doctor = app.add_subcommand("doctor", "Show native CLI diagnostics.");
  doctor->callback([&doctor_requested]() {
    doctor_requested = true;
  });

  auto* skill = app.add_subcommand("skill", "Manage local AI-agent skill guidance.");
  auto* skill_install = skill->add_subcommand("install", "Install bundled Codex skill guidance into the current project.");
  skill_install->add_option("--out", install_options.out_dir, "Output directory.")
    ->default_val(install_options.out_dir.string());
  skill_install->add_option("--docs-root", install_options.docs_root, "Docs root to render into installed guidance.")
    ->default_val(install_options.docs_root);
  skill_install->add_option("--package-manager", install_options.package_manager, "Package manager to render into installed guidance.")
    ->default_val(install_options.package_manager);
  skill_install->add_flag("--force", install_options.force, "Overwrite existing skill files.");
  skill_install->add_flag("--dry-run", install_options.dry_run, "Print planned writes without changing files.");

  auto* skill_update = skill->add_subcommand("update", "Update installed Codex skill guidance. (planned)");
  skill_update->allow_extras();
  skill_update->callback([&skill_update_requested]() {
    skill_update_requested = true;
  });

  for (const auto command : {"validate", "manifest", "plan", "push", "keygen"}) {
    auto* stub = app.add_subcommand(command, std::string{"Planned native command: "} + command);
    stub->allow_extras();
    stub->callback([&planned_command, command]() {
      planned_command = command;
    });
  }

  auto parse_args = to_argv_buffer(args);

  try {
    app.parse(static_cast<int>(parse_args.argv.size()), parse_args.argv.data());
  } catch (const CLI::CallForHelp&) {
    if (args.size() >= 3 && args[0] == "skill" && args[1] == "install") {
      return make_stdout(skill_install_help_text());
    }

    if (args.size() >= 2 && args[0] == "doctor") {
      return make_stdout(doctor_help_text());
    }

    if (args.size() >= 2 && args[0] == "skill") {
      std::ostringstream out;
      out << "pmdocs skill\n\n";
      out << "Usage:\n";
      out << "  pmdocs skill install [options]\n";
      out << "  pmdocs skill update [options]\n\n";
      out << "Commands:\n";
      out << "  install   Install bundled Codex skill guidance into the current project.\n";
      out << "  update    Update installed Codex skill guidance. (planned)\n";

      return make_stdout(out.str());
    }

    return make_stdout(root_help_text());
  } catch (const CLI::CallForVersion& error) {
    std::ostringstream out;
    std::ostringstream err;
    const auto exit_code = app.exit(error, out, err);

    return {
      .exit_code = exit_code,
      .stdout_text = out.str(),
      .stderr_text = err.str(),
    };
  } catch (const CLI::ParseError& error) {
    std::ostringstream out;
    std::ostringstream err;
    const auto exit_code = app.exit(error, out, err);

    return {
      .exit_code = exit_code,
      .stdout_text = out.str(),
      .stderr_text = err.str(),
    };
  }

  if (doctor_requested) {
    return doctor_result();
  }

  if (skill_install->parsed()) {
    return run_skill_install(install_options);
  }

  if (skill_update_requested) {
    return planned_command_result("skill update");
  }

  if (!planned_command.empty()) {
    return planned_command_result(planned_command);
  }

  return make_stdout(root_help_text());
}

} // namespace pmdocs
