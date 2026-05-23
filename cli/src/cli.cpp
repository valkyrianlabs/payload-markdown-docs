#include "pmdocs/cli.hpp"
#include "pmdocs/docs.hpp"

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

enum class InstallCommandShape {
  LegacySkillInstall,
  InstallSkillSubcommand,
};

struct PlannedFile {
  std::filesystem::path source_path;
  std::filesystem::path destination_path;
  std::filesystem::path relative_path;
  std::string content;
};

struct InstallRoutesOptions {
  std::filesystem::path payload_app_dir;
  bool force = false;
  bool dry_run = false;
};

struct AssetRouteTemplate {
  std::filesystem::path relative_path;
  std::string_view content;
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

bool is_supported_agent(std::string_view agent) {
  return agent == "codex" || agent == "claude";
}

std::vector<AssetRouteTemplate> asset_route_templates() {
  return {
    {
      .relative_path = "payloadMarkdownDocsAssetRoute.ts",
      .content = "import config from '@payload-config'\n"
                 "import { createPayloadMarkdownDocsAssetRouteHandler } from '@valkyrianlabs/payload-markdown-docs/next'\n"
                 "\n"
                 "export const GET = createPayloadMarkdownDocsAssetRouteHandler({\n"
                 "  config,\n"
                 "})\n",
    },
    {
      .relative_path = "llms.txt/route.ts",
      .content = "export { GET } from '../payloadMarkdownDocsAssetRoute'\n"
                 "\n"
                 "export const dynamic = 'force-dynamic'\n",
    },
    {
      .relative_path = "llms-full.txt/route.ts",
      .content = "export { GET } from '../payloadMarkdownDocsAssetRoute'\n"
                 "\n"
                 "export const dynamic = 'force-dynamic'\n",
    },
    {
      .relative_path = "plugins/[docsSetSlug]/llms.txt/route.ts",
      .content = "export { GET } from '../../../payloadMarkdownDocsAssetRoute'\n"
                 "\n"
                 "export const dynamic = 'force-dynamic'\n",
    },
    {
      .relative_path = "plugins/[docsSetSlug]/llms-full.txt/route.ts",
      .content = "export { GET } from '../../../payloadMarkdownDocsAssetRoute'\n"
                 "\n"
                 "export const dynamic = 'force-dynamic'\n",
    },
    {
      .relative_path = "plugins/[docsSetSlug]/skills/[agent]/[[...assetPath]]/route.ts",
      .content = "export { GET } from '../../../../../payloadMarkdownDocsAssetRoute'\n"
                 "\n"
                 "export const dynamic = 'force-dynamic'\n",
    },
    {
      .relative_path = "[docsSetSlug]/llms.txt/route.ts",
      .content = "export { GET } from '../../payloadMarkdownDocsAssetRoute'\n"
                 "\n"
                 "export const dynamic = 'force-dynamic'\n",
    },
    {
      .relative_path = "[docsSetSlug]/llms-full.txt/route.ts",
      .content = "export { GET } from '../../payloadMarkdownDocsAssetRoute'\n"
                 "\n"
                 "export const dynamic = 'force-dynamic'\n",
    },
    {
      .relative_path = "[docsSetSlug]/skills/[agent]/[[...assetPath]]/route.ts",
      .content = "export { GET } from '../../../../payloadMarkdownDocsAssetRoute'\n"
                 "\n"
                 "export const dynamic = 'force-dynamic'\n",
    },
  };
}

std::filesystem::path default_project_skill_dir_for_agent(std::string_view agent) {
  if (agent == "claude") {
    return std::filesystem::path{".claude"} / "skills" / std::string{kSkillName};
  }

  return std::filesystem::path{".agents"} / "skills" / std::string{kSkillName};
}

std::filesystem::path bundled_skill_dir_for_agent(std::string_view agent) {
  return data_dir() / "skills" / std::string{kSkillName} / std::string{agent};
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
  const auto source_root = bundled_skill_dir_for_agent(options.agent);
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

std::optional<std::filesystem::path> detect_payload_app_dir() {
  static const std::vector<std::filesystem::path> candidates = {
    "src/app/(payload)",
    "app/(payload)",
    "dev/app/(payload)",
  };

  std::error_code error;
  for (const auto& candidate : candidates) {
    if (std::filesystem::is_directory(candidate, error)) {
      return candidate;
    }

    error.clear();
  }

  return std::nullopt;
}

std::vector<PlannedFile> collect_asset_route_files(const InstallRoutesOptions& options) {
  const auto target_root = absolute_normalized(options.payload_app_dir);
  std::vector<PlannedFile> files;

  for (const auto& route : asset_route_templates()) {
    auto relative_path = route.relative_path.lexically_normal();

    if (!is_safe_relative_path(relative_path)) {
      throw std::runtime_error{"Unsafe asset route path: " + relative_path.generic_string()};
    }

    const auto destination_path = absolute_normalized(target_root / relative_path);

    if (!is_below_or_equal(destination_path, target_root)) {
      throw std::runtime_error{"Refusing to write outside payload app directory: " + relative_path.generic_string()};
    }

    files.push_back({
      .destination_path = destination_path,
      .relative_path = relative_path,
      .content = std::string{route.content},
    });
  }

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
  out << (options.dry_run ? "pmdocs install skill dry-run" : "pmdocs install skill") << "\n\n";
  out << "Agent: " << options.agent << "\n";
  out << "Source: " << bundled_skill_dir_for_agent(options.agent).string() << "\n";
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

std::string format_route_conflicts(const std::vector<std::string>& conflicts) {
  std::ostringstream out;
  out << "Asset route files already exist with different content. Use --force to overwrite:\n";

  for (const auto& conflict : conflicts) {
    out << "- " << conflict << "\n";
  }

  return out.str();
}

std::optional<std::string> write_planned_files(const std::vector<PlannedFile>& files, bool force) {
  for (const auto& file : files) {
    if (const auto error = ensure_directory_path(file.destination_path.parent_path())) {
      return *error;
    }

    std::error_code status_error;
    const auto status = std::filesystem::symlink_status(file.destination_path, status_error);
    const auto destination_exists = !status_error && std::filesystem::exists(status);

    if (status_error && status_error != std::errc::no_such_file_or_directory) {
      return "Could not inspect destination: " + file.destination_path.string() + ": " + status_error.message();
    }

    if (destination_exists && !std::filesystem::is_regular_file(status)) {
      return "Refusing to overwrite non-regular file: " + file.destination_path.string();
    }

    if (!force && destination_exists && read_file(file.destination_path) == file.content) {
      continue;
    }

    write_file(file.destination_path, file.content);
  }

  return std::nullopt;
}

std::string root_help_text() {
  return R"(pmdocs

Usage:
  pmdocs --help
  pmdocs --version
  pmdocs doctor
  pmdocs install skill --agent codex [options]
  pmdocs install routes [options]
  pmdocs skill install [options]
  pmdocs validate [docs-root] [options]
  pmdocs manifest [docs-root] [options]
  pmdocs plan [docs-root] [options]
  pmdocs push [docs-root] [options]
  pmdocs keygen [options]

Commands:
  doctor          Show native CLI diagnostics.
  install skill   Install bundled AI-agent skill guidance into the current project.
  install routes  Install public Next asset route files.
  skill install   Alias for install skill. Defaults to Codex for compatibility.
  skill update    Update an installed Codex skill. (planned)
  validate        Validate a local docs package.
  manifest        Print a JSON docs package manifest.
  plan            Build a sync plan against optional existing docs records.
  push            Sign and upload a docs package manifest to a Payload sync endpoint.
  keygen          Generate Ed25519 keys for signed sync.
)";
}

std::string docs_command_help_text(std::string_view command) {
  std::ostringstream out;
  out << "pmdocs " << command << " [docs-root]\n\n";
  out << "Options:\n";
  out << "  --docs <path>             Docs source root. Defaults to ./docs.\n";
  out << "  --skills <path>           Skills source root. Defaults to ./skills.\n";
  out << "  --llms <path>             llms.txt path. Defaults to ./llms.txt.\n";
  out << "  --llms-full <path>        llms-full.txt path. Defaults to ./llms-full.txt.\n";
  out << "  --no-docs                 Exclude Markdown docs records.\n";
  out << "  --no-skills               Exclude skill artifacts.\n";
  out << "  --no-llms                 Exclude llms.txt.\n";
  out << "  --no-llms-full            Exclude llms-full.txt.\n";

  if (command == "plan") {
    out << "  --existing <path>          JSON array of existing docs records.\n";
    out << "  --delete-behavior <value>  archive, delete, draft, or ignore.\n";
  }

  out << "  --json                     Print JSON output.\n";
  out << "  --pretty                   Pretty-print JSON output.\n";
  out << "  --source <id>              Docs set slug. Defaults to the GitHub repository name in GitHub Actions, otherwise local-docs.\n";
  out << "  --repository <repo>        Source repository metadata.\n";
  out << "  --branch <branch>          Source branch metadata.\n";
  out << "  --commit <sha>             Source commit metadata.\n";
  out << "  --max-files <number>       Maximum file count.\n";
  out << "  --max-file-bytes <number>  Maximum single file size.\n";
  out << "  --max-total-bytes <number> Maximum total Markdown bytes.\n";
  out << "  --help                     Show this help.\n";

  return out.str();
}

std::string keygen_help_text() {
  return R"(pmdocs keygen

Options:
  --format <pem|base64>  Output key format. Defaults to pem.
  --out <dir>            Write docs-sync-public.pem and docs-sync-private.pem.
  --force                Overwrite existing key files when used with --out.
  --help                 Show this help.
)";
}

std::string push_command_help_text() {
  return R"(pmdocs push [docs-root]

Options:
  --docs <path>             Docs source root. Defaults to ./docs.
  --skills <path>           Skills source root. Defaults to ./skills.
  --llms <path>             llms.txt path. Defaults to ./llms.txt.
  --llms-full <path>        llms-full.txt path. Defaults to ./llms-full.txt.
  --no-docs                 Exclude Markdown docs records.
  --no-skills               Exclude skill artifacts.
  --no-llms                 Exclude llms.txt.
  --no-llms-full            Exclude llms-full.txt.
  --endpoint <url>          Full Payload sync endpoint URL.
  --key-id <id>             Server-configured Ed25519 key id.
  --private-key-file <path> Private key file from keygen, or an unencrypted OpenSSH Ed25519 key.
  --private-key-env <name>  Environment variable containing the private key.
  --github-oidc             Use GitHub Actions OIDC bearer auth instead of Ed25519.
  --oidc-token-env <name>   Environment variable containing an already-fetched OIDC token.
  --dry-run                 Validate and submit a dry-run request without applying writes.
  --strict-routes           Fail when assets are included but public Next asset route files are missing.
  --publish                 Request published output. Server must allow publishing.
  --delete-behavior <value> archive, delete, draft, or ignore. Defaults to archive.
  --json                    Print structured JSON output.
  --pretty                  Pretty-print JSON output with --json.
  --source <id>             Docs set slug. Defaults to the GitHub repository name in GitHub Actions, otherwise local-docs.
  --repository <repo>       Source repository metadata.
  --branch <branch>         Source branch metadata.
  --commit <sha>            Source commit metadata.
  --max-files <number>      Maximum file count.
  --max-file-bytes <number> Maximum single file size.
  --max-total-bytes <number> Maximum total Markdown bytes.
  --help                    Show this help.

GitHub OIDC requires workflow permissions: id-token: write and contents: read.
Hard delete requires explicit server sync.allowHardDelete. Existing collection and block targets are not supported yet.
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
  out << R"(pmdocs install skill

Usage:
  pmdocs install skill --agent codex [options]
  pmdocs install skill --agent claude [options]
  pmdocs install skill --codex [options]
  pmdocs install skill --claude [options]
  pmdocs skill install [options]

Options:
  --agent <codex|claude>    Agent target.
  --codex                   Install the Codex skill pack.
  --claude                  Install the Claude skill pack.
  --out <path>              Output directory. Defaults to .agents/skills/payload-markdown-docs for Codex and .claude/skills/payload-markdown-docs for Claude.
  --docs-root <path>        Docs root to render into installed guidance. Defaults to ./docs.
  --package-manager <name>  Package manager to render into installed guidance. Defaults to npm.
  --force                   Overwrite existing skill files.
  --dry-run                 Print planned writes without changing files.
  --help                    Show this help.

Copies bundled skill guidance from the installed pmdocs data directory into the
current project. The installer renders {{docsRoot}} and {{packageManager}}
placeholders while copying files.

Bundled Codex skill source:
  )";
  out << bundled_skill_dir_for_agent("codex").string() << "\n";
  out << "Bundled Claude skill source:\n  " << bundled_skill_dir_for_agent("claude").string() << "\n";

  return out.str();
}

std::string install_routes_help_text() {
  return R"(pmdocs install routes

Usage:
  pmdocs install routes [options]

Options:
  --payload-app <path>  Payload app route group. Defaults to src/app/(payload), app/(payload), or dev/app/(payload) when found.
  --app <path>          Alias for --payload-app.
  --force               Overwrite existing route files.
  --dry-run             Print planned writes without changing files.
  --help                Show this help.

Installs public Next App Router files for /llms.txt, /llms-full.txt, and
docs-set skill asset URLs so those routes can reach plugin-owned Payload asset
handlers instead of a frontend catch-all.
)";
}

std::string format_routes_plan(const InstallRoutesOptions& options, const std::vector<PlannedFile>& files) {
  std::ostringstream out;
  out << (options.dry_run ? "pmdocs install routes dry-run" : "pmdocs install routes") << "\n\n";
  out << "Payload app route group: " << absolute_normalized(options.payload_app_dir).string() << "\n";
  out << "Files:\n";

  for (const auto& file : files) {
    out << "- " << file.relative_path.generic_string() << "\n";
  }

  out << "\n";
  out << "Routes:\n";
  out << "- /llms.txt\n";
  out << "- /llms-full.txt\n";
  out << "- /plugins/<docs-set-slug>/llms.txt\n";
  out << "- /plugins/<docs-set-slug>/llms-full.txt\n";
  out << "- /plugins/<docs-set-slug>/skills/<agent>\n";
  out << "- /plugins/<docs-set-slug>/skills/<agent>/SKILL.md\n";
  out << "\n";
  out << "IMPORTANT:\n";
  out << "These files must be committed to your Next app repository.\n";
  out << "Payload config endpoints alone cannot create public Next filesystem routes.\n";
  out << "If you deploy without these files, /llms.txt and /skills routes will 404.\n";

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
    .stderr_text = "pmdocs " + std::string{command} + " is not supported.\n",
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

struct DocsOptionsRefs {
  CLI::Option* docs_root = nullptr;
  CLI::Option* llms = nullptr;
  CLI::Option* llms_full = nullptr;
  CLI::Option* skills = nullptr;
};

struct InstallOptionsRefs {
  CLI::Option* agent = nullptr;
  CLI::Option* claude = nullptr;
  CLI::Option* codex = nullptr;
  CLI::Option* out = nullptr;
};

struct InstallRoutesOptionsRefs {
  CLI::Option* payload_app = nullptr;
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
  return bundled_skill_dir_for_agent("codex");
}

std::filesystem::path default_project_skill_dir() {
  return default_project_skill_dir_for_agent("codex");
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

CommandResult run_routes_install(const InstallRoutesOptions& options) {
  try {
    const auto planned_files = collect_asset_route_files(options);

    if (!options.force) {
      const auto conflicts = find_conflicts(planned_files);

      if (!conflicts.empty()) {
        return {
          .exit_code = 1,
          .stderr_text = format_route_conflicts(conflicts),
        };
      }
    }

    if (options.dry_run) {
      return make_stdout(format_routes_plan(options, planned_files));
    }

    if (const auto error = write_planned_files(planned_files, options.force)) {
      return {
        .exit_code = 1,
        .stderr_text = *error + "\n",
      };
    }

    return make_stdout(format_routes_plan(options, planned_files));
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
  KeygenOptions keygen_options;
  DocsCommandOptions validate_options;
  DocsCommandOptions manifest_options;
  PlanCommandOptions plan_options;
  PushCommandOptions push_options;
  DocsOptionsRefs validate_options_refs;
  DocsOptionsRefs manifest_options_refs;
  DocsOptionsRefs plan_options_refs;
  DocsOptionsRefs push_options_refs;
  InstallOptionsRefs install_skill_options_refs;
  InstallOptionsRefs legacy_skill_install_options_refs;
  InstallRoutesOptions install_routes_options;
  InstallRoutesOptionsRefs install_routes_options_refs;
  bool doctor_requested = false;
  bool install_routes_requested = false;
  bool keygen_requested = false;
  bool manifest_requested = false;
  bool plan_requested = false;
  bool push_requested = false;
  bool skill_update_requested = false;
  bool validate_requested = false;

  CLI::App app{"Native CLI for Payload Markdown Docs.", "pmdocs"};
  app.set_help_flag("-h,--help", "Show this help.");
  app.set_version_flag("-V,--version", std::string{"pmdocs "} + std::string{kVersion});
  app.footer("The native pmdocs binary is the supported Payload Markdown Docs operator CLI.");

  auto* doctor = app.add_subcommand("doctor", "Show native CLI diagnostics.");
  doctor->callback([&doctor_requested]() {
    doctor_requested = true;
  });

  const auto add_install_skill_options = [](CLI::App* command, InstallSkillOptions& options) {
    InstallOptionsRefs refs;
    refs.agent = command->add_option("--agent", options.agent, "Agent target: codex or claude.");
    refs.codex = command->add_flag("--codex", options.codex, "Install the Codex skill pack.");
    refs.claude = command->add_flag("--claude", options.claude, "Install the Claude skill pack.");
    refs.out = command->add_option("--out", options.out_dir, "Output directory.");
    command->add_option("--docs-root", options.docs_root, "Docs root to render into installed guidance.")
      ->default_val(options.docs_root);
    command->add_option("--package-manager", options.package_manager, "Package manager to render into installed guidance.")
      ->default_val(options.package_manager);
    command->add_flag("--force", options.force, "Overwrite existing skill files.");
    command->add_flag("--dry-run", options.dry_run, "Print planned writes without changing files.");

    return refs;
  };

  auto* install = app.add_subcommand("install", "Install local AI-agent guidance or Next route files for docs assets.");
  auto* install_skill = install->add_subcommand("skill", "Install bundled AI-agent skill guidance into the current project.");
  install_skill_options_refs = add_install_skill_options(install_skill, install_options);
  auto* install_routes = install->add_subcommand("routes", "Install public Next asset route files.");
  install_routes_options_refs.payload_app = install_routes->add_option("--payload-app,--app", install_routes_options.payload_app_dir, "Payload app route group.");
  install_routes->add_flag("--force", install_routes_options.force, "Overwrite existing route files.");
  install_routes->add_flag("--dry-run", install_routes_options.dry_run, "Print planned writes without changing files.");
  install_routes->callback([&install_routes_requested]() {
    install_routes_requested = true;
  });

  auto* skill = app.add_subcommand("skill", "Manage local AI-agent skill guidance.");
  auto* skill_install = skill->add_subcommand("install", "Install bundled Codex skill guidance into the current project.");
  legacy_skill_install_options_refs = add_install_skill_options(skill_install, install_options);

  auto* skill_update = skill->add_subcommand("update", "Update installed Codex skill guidance. (planned)");
  skill_update->allow_extras();
  skill_update->callback([&skill_update_requested]() {
    skill_update_requested = true;
  });

  const auto add_docs_options = [](CLI::App* command, DocsCommandOptions& options) {
    DocsOptionsRefs refs;
    refs.docs_root = command->add_option("docs-root", options.docs_root, "Docs root path.");
    command->add_option("--docs", options.docs_flag, "Docs source root.");
    refs.skills = command->add_option("--skills", options.skills_root, "Skills source root.")
      ->default_val(options.skills_root.string());
    refs.llms = command->add_option("--llms", options.llms_path, "llms.txt path.")
      ->default_val(options.llms_path.string());
    refs.llms_full = command->add_option("--llms-full", options.llms_full_path, "llms-full.txt path.")
      ->default_val(options.llms_full_path.string());
    command->add_flag("--no-docs", options.no_docs, "Exclude Markdown docs records.");
    command->add_flag("--no-skills", options.no_skills, "Exclude skill artifacts.");
    command->add_flag("--no-llms", options.no_llms, "Exclude llms.txt.");
    command->add_flag("--no-llms-full", options.no_llms_full, "Exclude llms-full.txt.");
    command->add_option("--source", options.source_id, "Docs set/source id.");
    command->add_option("--repository", options.repository, "Source repository metadata.");
    command->add_option("--branch", options.branch, "Source branch metadata.");
    command->add_option("--commit", options.commit, "Source commit metadata.");
    command->add_option("--max-files", options.max_files, "Maximum file count.");
    command->add_option("--max-file-bytes", options.max_file_bytes, "Maximum single file size.");
    command->add_option("--max-total-bytes", options.max_total_bytes, "Maximum total Markdown bytes.");
    command->add_flag("--json", options.print_json, "Print JSON output.");
    command->add_flag("--pretty", options.pretty, "Pretty-print JSON output.");
    return refs;
  };

  auto* validate = app.add_subcommand("validate", "Validate a local Markdown docs directory.");
  validate_options_refs = add_docs_options(validate, validate_options);
  validate->callback([&validate_requested]() {
    validate_requested = true;
  });

  auto* manifest = app.add_subcommand("manifest", "Print a JSON docs manifest.");
  manifest_options_refs = add_docs_options(manifest, manifest_options);
  manifest->callback([&manifest_requested]() {
    manifest_requested = true;
  });

  auto* plan = app.add_subcommand("plan", "Build a dry sync plan against optional existing docs records.");
  plan_options_refs = add_docs_options(plan, plan_options);
  plan->add_option("--existing", plan_options.existing_path, "JSON array of existing docs records.");
  plan->add_option("--delete-behavior", plan_options.delete_behavior, "archive, delete, draft, or ignore.");
  plan->callback([&plan_requested]() {
    plan_requested = true;
  });

  auto* push = app.add_subcommand("push", "Sign and upload a docs package manifest to a Payload sync endpoint.");
  push_options_refs = add_docs_options(push, push_options);
  push->add_option("--endpoint", push_options.endpoint, "Full Payload sync endpoint URL.");
  push->add_option("--key-id", push_options.key_id, "Server-configured Ed25519 key id.");
  push->add_option("--private-key-file", push_options.private_key_file, "Private key file.");
  push->add_option("--private-key-env", push_options.private_key_env, "Private key environment variable.");
  push->add_flag("--github-oidc", push_options.github_oidc, "Use GitHub Actions OIDC bearer auth instead of Ed25519.");
  push->add_option("--oidc-token-env", push_options.oidc_token_env, "Environment variable containing an already-fetched OIDC token.");
  push->add_flag("--dry-run", push_options.dry_run, "Submit a dry-run request.");
  push->add_flag("--strict-routes", push_options.strict_routes, "Fail when public asset route files are missing.");
  push->add_flag("--publish", push_options.publish, "Request published output.");
  push->add_option("--delete-behavior", push_options.delete_behavior, "archive, delete, draft, or ignore.");
  push->callback([&push_requested]() {
    push_requested = true;
  });

  auto* keygen = app.add_subcommand("keygen", "Generate Ed25519 keys for signed sync.");
  keygen->add_option("--format", keygen_options.format, "pem or base64.")
    ->default_val(keygen_options.format);
  keygen->add_option("--out", keygen_options.out_dir, "Output directory.");
  keygen->add_flag("--force", keygen_options.force, "Overwrite existing key files.");
  keygen->callback([&keygen_requested]() {
    keygen_requested = true;
  });

  auto parse_args = to_argv_buffer(args);

  try {
    app.parse(static_cast<int>(parse_args.argv.size()), parse_args.argv.data());
  } catch (const CLI::CallForHelp&) {
    if (args.size() >= 3 && args[0] == "install" && args[1] == "skill") {
      return make_stdout(skill_install_help_text());
    }

    if (args.size() >= 3 && args[0] == "install" && args[1] == "routes") {
      return make_stdout(install_routes_help_text());
    }

    if (args.size() >= 3 && args[0] == "skill" && args[1] == "install") {
      return make_stdout(skill_install_help_text());
    }

    if (args.size() >= 2 && args[0] == "install") {
      std::ostringstream out;
      out << "pmdocs install\n\n";
      out << "Usage:\n";
      out << "  pmdocs install skill --agent codex [options]\n";
      out << "  pmdocs install skill --agent claude [options]\n";
      out << "  pmdocs install routes [options]\n\n";
      out << "Commands:\n";
      out << "  skill    Install bundled AI-agent skill guidance into the current project.\n";
      out << "  routes   Install public Next asset route files. (planned)\n";

      return make_stdout(out.str());
    }

    if (args.size() >= 2 && args[0] == "doctor") {
      return make_stdout(doctor_help_text());
    }

    if (args.size() >= 2 && args[0] == "keygen") {
      return make_stdout(keygen_help_text());
    }

    if (args.size() >= 2 && args[0] == "push") {
      return make_stdout(push_command_help_text());
    }

    if (args.size() >= 2 && (args[0] == "validate" || args[0] == "manifest" || args[0] == "plan")) {
      return make_stdout(docs_command_help_text(args[0]));
    }

    if (args.size() >= 2 && args[0] == "skill") {
      std::ostringstream out;
      out << "pmdocs skill\n\n";
      out << "Usage:\n";
      out << "  pmdocs skill install [options]\n";
      out << "  pmdocs skill update [options]\n\n";
      out << "Commands:\n";
      out << "  install   Alias for pmdocs install skill. Defaults to Codex for compatibility.\n";
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

  const auto normalize_install_options = [](
    InstallSkillOptions& options,
    const InstallOptionsRefs& refs,
    InstallCommandShape shape
  ) -> std::optional<CommandResult> {
    std::vector<std::string> requested_agents;

    if (refs.agent != nullptr && refs.agent->count() > 0) {
      if (!is_supported_agent(options.agent)) {
        return CommandResult{
          .exit_code = 1,
          .stderr_text = "--agent must be codex or claude.\n",
        };
      }

      requested_agents.push_back(options.agent);
    }

    if (options.codex) {
      requested_agents.push_back("codex");
    }
    if (options.claude) {
      requested_agents.push_back("claude");
    }

    std::ranges::sort(requested_agents);
    requested_agents.erase(std::unique(requested_agents.begin(), requested_agents.end()), requested_agents.end());

    if (requested_agents.empty()) {
      if (shape == InstallCommandShape::InstallSkillSubcommand) {
        return CommandResult{
          .exit_code = 1,
          .stderr_text = "Install skill requires --codex, --claude, or --agent codex|claude.\n",
        };
      }

      options.agent = "codex";
    } else if (requested_agents.size() > 1) {
      return CommandResult{
        .exit_code = 1,
        .stderr_text = "Install skill accepts one agent target at a time.\n",
      };
    } else {
      options.agent = requested_agents.front();
    }

    if (!is_supported_agent(options.agent)) {
      return CommandResult{
        .exit_code = 1,
        .stderr_text = "--agent must be codex or claude.\n",
      };
    }

    if (options.package_manager != "bun"
        && options.package_manager != "npm"
        && options.package_manager != "pnpm"
        && options.package_manager != "yarn") {
      return CommandResult{
        .exit_code = 1,
        .stderr_text = "--package-manager must be pnpm, npm, yarn, or bun.\n",
      };
    }

    if (refs.out == nullptr || refs.out->count() == 0) {
      options.out_dir = default_project_skill_dir_for_agent(options.agent);
    }

    return std::nullopt;
  };

  const auto normalize_install_routes_options = [](
    InstallRoutesOptions& options,
    const InstallRoutesOptionsRefs& refs
  ) -> std::optional<CommandResult> {
    std::error_code error;

    if (refs.payload_app == nullptr || refs.payload_app->count() == 0) {
      if (const auto detected = detect_payload_app_dir()) {
        options.payload_app_dir = *detected;
      } else {
        return CommandResult{
          .exit_code = 1,
          .stderr_text = "Could not find a Payload app route group. Pass --payload-app \"src/app/(payload)\" or --payload-app \"app/(payload)\".\n",
        };
      }
    }

    if (!std::filesystem::is_directory(options.payload_app_dir, error)) {
      return CommandResult{
        .exit_code = 1,
        .stderr_text = "Payload app route group does not exist: " + options.payload_app_dir.string() + "\n",
      };
    }

    return std::nullopt;
  };

  const auto finalize_docs_options = [](DocsCommandOptions& options, const DocsOptionsRefs& refs) {
    options.docs_root_explicit = refs.docs_root != nullptr && refs.docs_root->count() > 0;
    options.include_docs = !options.no_docs;
    options.include_llms = !options.no_llms;
    options.include_llms_full = !options.no_llms_full;
    options.include_skills = !options.no_skills;
    options.llms_path_explicit = refs.llms != nullptr && refs.llms->count() > 0;
    options.llms_full_path_explicit = refs.llms_full != nullptr && refs.llms_full->count() > 0;
    options.skills_root_explicit = refs.skills != nullptr && refs.skills->count() > 0;
  };

  if (validate_requested) {
    finalize_docs_options(validate_options, validate_options_refs);
  }
  if (manifest_requested) {
    finalize_docs_options(manifest_options, manifest_options_refs);
  }
  if (plan_requested) {
    finalize_docs_options(plan_options, plan_options_refs);
  }
  if (push_requested) {
    finalize_docs_options(push_options, push_options_refs);
  }

  if (doctor_requested) {
    return doctor_result();
  }

  if (install_routes_requested) {
    if (auto error = normalize_install_routes_options(install_routes_options, install_routes_options_refs)) {
      return *error;
    }

    return run_routes_install(install_routes_options);
  }

  if (install_skill->parsed()) {
    if (auto error = normalize_install_options(install_options, install_skill_options_refs, InstallCommandShape::InstallSkillSubcommand)) {
      return *error;
    }

    return run_skill_install(install_options);
  }

  if (skill_install->parsed()) {
    if (auto error = normalize_install_options(install_options, legacy_skill_install_options_refs, InstallCommandShape::LegacySkillInstall)) {
      return *error;
    }

    return run_skill_install(install_options);
  }

  if (keygen_requested) {
    return run_keygen_command(keygen_options);
  }

  if (skill_update_requested) {
    return planned_command_result("skill update");
  }

  if (validate_requested) {
    return run_validate_command(validate_options);
  }

  if (manifest_requested) {
    return run_manifest_command(manifest_options);
  }

  if (plan_requested) {
    return run_plan_command(plan_options);
  }

  if (push_requested) {
    return run_push_command(push_options);
  }

  return make_stdout(root_help_text());
}

} // namespace pmdocs
