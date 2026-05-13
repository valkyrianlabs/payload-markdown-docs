#include "cli.hpp"

#include "pmdocs_config.hpp"

#include <cstdlib>
#include <filesystem>
#include <sstream>
#include <string>
#include <string_view>
#include <system_error>
#include <vector>

namespace pmdocs {
namespace {

constexpr std::string_view kSkillName = "payload-markdown-docs";

bool is_help_flag(std::string_view arg) {
  return arg == "--help" || arg == "-h";
}

bool has_help_flag(const std::vector<std::string_view>& args) {
  for (const auto arg : args) {
    if (is_help_flag(arg)) {
      return true;
    }
  }

  return false;
}

std::filesystem::path data_dir() {
  if (const char* override_dir = std::getenv("PMDOCS_DATA_DIR")) {
    if (*override_dir != '\0') {
      return std::filesystem::path{override_dir};
    }
  }

  return std::filesystem::path{PMDOCS_DATA_DIR};
}

std::filesystem::path skill_dir() {
  return data_dir() / "skills" / std::string{kSkillName};
}

std::string root_help() {
  return R"(pmdocs

Usage:
  pmdocs --help
  pmdocs --version
  pmdocs doctor
  pmdocs skill install --help

Commands:
  doctor          Show basic native CLI diagnostics.
  skill install   Install the Codex skill into the current project. (planned)
  skill update    Update an installed Codex skill. (planned)
  validate        Validate a local Markdown docs directory. (planned)
  manifest        Print a JSON docs manifest. (planned)
  plan            Build a dry sync plan. (planned)
  push            Sign and upload a docs manifest. (planned)
  keygen          Generate Ed25519 keys for signed sync. (planned)

This native CLI is in its foundational phase. The npm binary remains the
reference implementation for docs sync behavior until commands are ported.
)";
}

std::string skill_help() {
  return R"(pmdocs skill

Usage:
  pmdocs skill install --help
  pmdocs skill update --help

Commands:
  install   Install bundled Codex skill guidance into the current project. (planned)
  update    Update existing Codex skill guidance in the current project. (planned)
)";
}

std::string skill_install_help() {
  std::ostringstream out;
  out << R"(pmdocs skill install

Usage:
  pmdocs skill install [options]

Options:
  --out <path>             Output directory. Defaults to .codex/skills/payload-markdown-docs.
  --docs-root <path>       Docs root to mention in installed guidance. Defaults to ./docs.
  --package-manager <name> Package manager to mention in guidance.
  --force                  Overwrite existing skill files.
  --dry-run                Print planned files without writing.
  --help                   Show this help.

Status:
  The native install command is not implemented yet. Future work should copy
  bundled skill data from the installed system share directory into the current
  project's .codex/skills/payload-markdown-docs directory.

Installed skill source:
  )";
  out << skill_dir().string() << "\n";

  return out.str();
}

std::string doctor_help() {
  return R"(pmdocs doctor

Usage:
  pmdocs doctor

Checks the native CLI binary, current working directory, and configured system
skill data location. Missing skill data is reported as a warning during this
foundational phase.
)";
}

CommandResult version_result() {
  return {
    .exit_code = 0,
    .stdout_text = std::string{"pmdocs "} + PMDOCS_VERSION + "\n",
  };
}

CommandResult doctor_result() {
  std::error_code cwd_error;
  const auto cwd = std::filesystem::current_path(cwd_error);
  const auto configured_data_dir = data_dir();
  const auto configured_skill_dir = skill_dir();
  const auto skill_manifest = configured_skill_dir / "SKILL.md";
  std::error_code skill_error;
  const auto skill_found = std::filesystem::is_regular_file(skill_manifest, skill_error);

  std::ostringstream out;
  out << "pmdocs doctor\n";
  out << "version: " << PMDOCS_VERSION << "\n";

  if (cwd_error) {
    out << "cwd: unavailable (" << cwd_error.message() << ")\n";
  } else {
    out << "cwd: " << cwd.string() << "\n";
  }

  out << "data_dir: " << configured_data_dir.string() << "\n";
  out << "skill_dir: " << configured_skill_dir.string() << "\n";
  out << "skill_status: " << (skill_found ? "found" : "not found") << "\n";

  if (!skill_found) {
    out << "warnings:\n";
    out << "- Bundled skill data was not found. It is installed by Meson/package installs.\n";
  }

  out << "status: ok\n";

  return {
    .exit_code = 0,
    .stdout_text = out.str(),
  };
}

CommandResult planned_command_result(std::string_view command) {
  return {
    .exit_code = 2,
    .stderr_text = "pmdocs " + std::string{command}
      + " is not implemented in the native CLI yet. Use the npm CLI for this command until it is ported.\n",
  };
}

CommandResult unknown_command_result(std::string_view command) {
  return {
    .exit_code = 1,
    .stderr_text = "Unknown command \"" + std::string{command} + "\". Run pmdocs --help.\n",
  };
}

} // namespace

CommandResult run(std::vector<std::string_view> args) {
  if (args.empty() || is_help_flag(args.front())) {
    return {
      .exit_code = 0,
      .stdout_text = root_help(),
    };
  }

  const auto command = args.front();

  if (command == "--version" || command == "-V") {
    return version_result();
  }

  if (command == "help") {
    if (args.size() >= 3 && args[1] == "skill" && args[2] == "install") {
      return {
        .exit_code = 0,
        .stdout_text = skill_install_help(),
      };
    }

    if (args.size() >= 2 && args[1] == "skill") {
      return {
        .exit_code = 0,
        .stdout_text = skill_help(),
      };
    }

    if (args.size() >= 2 && args[1] == "doctor") {
      return {
        .exit_code = 0,
        .stdout_text = doctor_help(),
      };
    }

    return {
      .exit_code = 0,
      .stdout_text = root_help(),
    };
  }

  if (command == "doctor") {
    if (has_help_flag(args)) {
      return {
        .exit_code = 0,
        .stdout_text = doctor_help(),
      };
    }

    if (args.size() > 1) {
      return {
        .exit_code = 1,
        .stderr_text = "pmdocs doctor does not accept arguments. Run pmdocs doctor --help.\n",
      };
    }

    return doctor_result();
  }

  if (command == "skill") {
    if (args.size() == 1 || (args.size() == 2 && is_help_flag(args[1]))) {
      return {
        .exit_code = 0,
        .stdout_text = skill_help(),
      };
    }

    if (args.size() >= 2 && args[1] == "install") {
      if (has_help_flag(args)) {
        return {
          .exit_code = 0,
          .stdout_text = skill_install_help(),
        };
      }

      return planned_command_result("skill install");
    }

    if (args.size() >= 2 && args[1] == "update") {
      return planned_command_result("skill update");
    }

    return unknown_command_result("skill " + std::string{args[1]});
  }

  if (
    command == "validate" ||
    command == "manifest" ||
    command == "plan" ||
    command == "push" ||
    command == "keygen"
  ) {
    return planned_command_result(command);
  }

  return unknown_command_result(command);
}

} // namespace pmdocs
