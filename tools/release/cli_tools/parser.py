import argparse

from tools.release.changelog.ai import DEFAULT_AI_DRAFT_MODEL, DEFAULT_AI_PROVIDER_KIND
from tools.release.cli_tools.commands.changelog.basic import (
    cmd_changelog_draft,
    cmd_changelog_payload,
)
from tools.release.cli_tools.commands.changelog.check import cmd_changelog_ai_check
from tools.release.cli_tools.commands.changelog.compare import cmd_changelog_ai_compare
from tools.release.cli_tools.commands.changelog.release import (
    cmd_changelog_release,
    cmd_changelog_ai_draft,
    cmd_changelog_ai_release,
)
from tools.release.cli_tools.commands.debian import (
    cmd_build_deb,
    cmd_validate_release_artifacts,
    cmd_publish_deb,
)
from tools.release.cli_tools.commands.version import (
    cmd_check,
    cmd_sync,
    cmd_set_version,
    cmd_bump,
)
from tools.release.cli_tools.path import (
    DEFAULT_CHANGELOG_DRAFT_OUTPUT,
    DEFAULT_CHANGELOG_RELEASE_OUTPUT,
    DEFAULT_CHANGELOG_RAW_OUTPUT,
    DEFAULT_CHANGELOG_PAYLOAD_OUTPUT,
    DEFAULT_CHANGELOG_SEMANTIC_PAYLOAD_OUTPUT,
    DEFAULT_CHANGELOG_CONTEXT_OUTPUT,
    DEFAULT_RELEASE_NOTES_OUTPUT,
)


COMMON_ARGS = {
    "dry_run": {
        "flags": ["--dry-run"],
        "kwargs": {
            "action": "store_true",
            "help": "Show what would change without writing files.",
        },
    },
    "since_tag": {
        "flags": ["--since-tag"],
        "kwargs": {
            "default": None,
            "help": "Optional tag to use as lower bound (overrides latest-tag auto-detection).",
        },
    },
    "output_optional": {
        "flags": ["--output"],
        "kwargs": {
            "default": None,
            "help": "Write rendered output to a file path instead of stdout.",
        },
    },
    "output_dir_release": {
        "flags": ["--output-dir"],
        "kwargs": {
            "default": "release",
            "help": "Release artifact directory (default: release/ at repo root).",
        },
    },
    "ai_profile": {
        "flags": ["--ai-profile"],
        "kwargs": {
            "default": None,
            "help": "Named AI profile slug from ai.yml at repo root.",
        },
    },
    "model_check": {
        "flags": ["--model"],
        "kwargs": {
            "default": None,
            "help": (
                "Override model for this check (defaults resolved from built-ins/profile; "
                f"legacy default: {DEFAULT_AI_DRAFT_MODEL})."
            ),
        },
    },
    "model_global": {
        "flags": ["--model"],
        "kwargs": {
            "default": None,
            "help": (
                "Global model override for all AI stages "
                "(emergency_triage/triage/draft/polish/release_notes). "
                f"Legacy default: {DEFAULT_AI_DRAFT_MODEL}."
            ),
        },
    },
    "provider": {
        "flags": ["--provider"],
        "kwargs": {
            "choices": ("openai", "openai-compatible"),
            "default": None,
            "help": f"AI provider transport override (default resolved from config; legacy: {DEFAULT_AI_PROVIDER_KIND}).",
        },
    },
    "base_url": {
        "flags": ["--base-url"],
        "kwargs": {
            "default": None,
            "help": "OpenAI-compatible endpoint base URL (for --provider openai-compatible).",
        },
    },
    "use_triage": {
        "flags": ["--use-triage"],
        "kwargs": {
            "action": "store_true",
            "help": "Run optional AI triage stage before draft generation.",
        },
    },
    "save_triage_json": {
        "flags": ["--save-triage-json"],
        "kwargs": {
            "default": None,
            "help": "Optional path to save validated structured triage JSON when --use-triage is enabled.",
        },
    },
    "polish": {
        "flags": ["--polish"],
        "kwargs": {
            "action": "store_true",
            "help": "Run optional editorial polish stage after draft generation.",
        },
    },
    "save_polish_json": {
        "flags": ["--save-polish-json"],
        "kwargs": {
            "default": None,
            "help": "Optional path to save validated structured polish JSON when --polish is enabled.",
        },
    },
    "save_json": {
        "flags": ["--save-json"],
        "kwargs": {
            "default": None,
            "help": "Optional path to save validated structured AI draft JSON.",
        },
    },
    "release_notes_output": {
        "flags": ["--release-notes-output"],
        "kwargs": {
            "default": DEFAULT_RELEASE_NOTES_OUTPUT,
            "help": "Output path for optional release_notes markdown when stage is enabled by profile.",
        },
    },
    "selection_output": {
        "flags": ["--selection-output"],
        "kwargs": {
            "default": None,
            "help": "Optional path to write release changelog path-selection metadata JSON.",
        },
    },
    "manual_changelog_path": {
        "flags": ["--manual-changelog-path"],
        "kwargs": {
            "default": "debian/changelog",
            "help": "Debian changelog file used for manual fallback and release entry updates.",
        },
    },
    "debian_distribution": {
        "flags": ["--debian-distribution"],
        "kwargs": {
            "default": None,
            "help": "Override Debian changelog distribution token (e.g. unstable/stable).",
        },
    },
    "debian_urgency": {
        "flags": ["--debian-urgency"],
        "kwargs": {
            "default": None,
            "help": "Override Debian changelog urgency token (e.g. low/medium/high).",
        },
    },
}


AI_TRANSPORT_ARGS = ["ai_profile", "model_global", "provider", "base_url"]
AI_STAGE_ARGS = ["use_triage", "save_triage_json", "polish", "save_polish_json"]
CHANGELOG_EVIDENCE_ARGS = [
    {
        "flags": ["--raw-output"],
        "kwargs": {
            "default": DEFAULT_CHANGELOG_RAW_OUTPUT,
            "help": "Output path for deterministic raw changelog evidence.",
        },
    },
    {
        "flags": ["--payload-output"],
        "kwargs": {
            "default": DEFAULT_CHANGELOG_PAYLOAD_OUTPUT,
            "help": "Output path for deterministic AI payload evidence JSON.",
        },
    },
    {
        "flags": ["--semantic-payload-output"],
        "kwargs": {
            "default": DEFAULT_CHANGELOG_SEMANTIC_PAYLOAD_OUTPUT,
            "help": "Output path for deterministic semantic payload evidence JSON.",
        },
    },
    {
        "flags": ["--context-output"],
        "kwargs": {
            "default": DEFAULT_CHANGELOG_CONTEXT_OUTPUT,
            "help": "Output path for deterministic changelog context metadata JSON.",
        },
    },
]


COMMANDS = {
    "check": {
        "help": "Validate release file versions and repo release state.",
        "func": cmd_check,
    },

    "sync": {
        "help": "Synchronize managed release files to the canonical VERSION file.",
        "func": cmd_sync,
        "args": [
            {
                "flags": ["--debian-revision"],
                "kwargs": {
                    "type": int,
                    "default": None,
                    "help": "Optional Debian revision override. Defaults to existing revision or 1.",
                },
            },
            "dry_run",
        ],
    },

    "set-version": {
        "help": "Set the application version across release-managed files.",
        "func": cmd_set_version,
        "args": [
            {
                "flags": ["version"],
                "kwargs": {
                    "help": "Semantic version to set (e.g. 0.3.0).",
                },
            },
            {
                "flags": ["--debian-revision"],
                "kwargs": {
                    "type": int,
                    "default": 1,
                    "help": "Debian package revision to write (default: 1).",
                },
            },
            "dry_run",
        ],
    },

    "set-release": {
        "help": "Alias for set-version.",
        "func": cmd_set_version,
        "args": [
            {
                "flags": ["version"],
                "kwargs": {
                    "help": "Semantic version to set (e.g. 0.3.0).",
                },
            },
            {
                "flags": ["--debian-revision"],
                "kwargs": {
                    "type": int,
                    "default": 1,
                    "help": "Debian package revision to write (default: 1).",
                },
            },
            "dry_run",
        ],
    },

    "bump": {
        "help": "Bump the current semantic version.",
        "func": cmd_bump,
        "args": [
            {
                "flags": ["part"],
                "kwargs": {
                    "choices": ("major", "minor", "patch"),
                    "help": "Version component to bump.",
                },
            },
            {
                "flags": ["--debian-revision"],
                "kwargs": {
                    "type": int,
                    "default": 1,
                    "help": "Debian package revision to write after bump (default: 1).",
                },
            },
            "dry_run",
        ],
    },

    "build-deb": {
        "help": "Build Debian package artifacts into a local release directory.",
        "func": cmd_build_deb,
        "args": [
            {
                "flags": ["--output-dir"],
                "kwargs": {
                    "default": "release",
                    "help": "Output directory for copied Debian artifacts (default: release/ at repo root).",
                },
            },
            {
                "flags": ["--dry-run"],
                "kwargs": {
                    "action": "store_true",
                    "help": "Validate and print planned build actions without running dpkg-buildpackage.",
                },
            },
        ],
    },

    "validate-release-artifacts": {
        "help": "Validate staged release artifacts before upload/publication.",
        "func": cmd_validate_release_artifacts,
        "args": [
            {
                "flags": ["--output-dir"],
                "kwargs": {
                    "default": "release",
                    "help": "Release artifact directory to validate (default: release/ at repo root).",
                },
            },
            {
                "flags": ["--skip-changelog"],
                "kwargs": {
                    "action": "store_true",
                    "help": "Skip changelog artifact checks.",
                },
            },
        ],
    },

    "publish-deb": {
        "help": "Publish staged Debian package artifacts to Nexus.",
        "func": cmd_publish_deb,
        "args": [
            {
                "flags": ["--output-dir"],
                "kwargs": {
                    "default": "release",
                    "help": "Release artifact directory that contains Debian packages to publish (default: release/ at repo root).",
                },
            },
            {
                "flags": ["--mode"],
                "kwargs": {
                    "default": None,
                    "help": "Publication mode override (disabled|nexus). Defaults to RELEASE_PUBLISH_MODE env.",
                },
            },
            {
                "flags": ["--nexus-repo-url"],
                "kwargs": {
                    "default": None,
                    "help": "Nexus repository URL override. Defaults to NEXUS_REPO_URL env.",
                },
            },
            {
                "flags": ["--nexus-user"],
                "kwargs": {
                    "default": None,
                    "help": "Nexus username override. Defaults to NEXUS_USER env.",
                },
            },
            {
                "flags": ["--nexus-pass"],
                "kwargs": {
                    "default": None,
                    "help": "Nexus password override. Defaults to NEXUS_PASS env.",
                },
            },
            {
                "flags": ["--dry-run"],
                "kwargs": {
                    "action": "store_true",
                    "help": "Validate publication settings and artifact selection without uploading.",
                },
            },
            {
                "flags": ["--require-enabled"],
                "kwargs": {
                    "action": "store_true",
                    "help": "Fail if publication mode resolves to disabled for this run.",
                },
            },
        ],
    },

    "changelog": {
        "help": "Generate changelog artifacts from git history.",
        "subcommands": {
            "draft": {
                "help": "Render a changelog draft from the current release context.",
                "func": cmd_changelog_draft,
                "args": [
                    {
                        "flags": ["--format"],
                        "kwargs": {
                            "choices": ("raw", "json"),
                            "default": "raw",
                            "help": "Output format (default: raw).",
                        },
                    },
                    "since_tag",
                    "output_optional",
                ],
            },

            "payload": {
                "help": "Render deterministic model-ready payload JSON from release context.",
                "func": cmd_changelog_payload,
                "args": [
                    "since_tag",
                    "output_optional",
                ],
            },

            "release": {
                "help": "Generate release changelog artifacts with deterministic AI/manual fallback behavior.",
                "func": cmd_changelog_release,
                "args": [
                    "since_tag",
                    {
                        "flags": ["--output"],
                        "kwargs": {
                            "default": DEFAULT_CHANGELOG_RELEASE_OUTPUT,
                            "help": "Output markdown path for the selected release changelog path.",
                        },
                    },
                    *CHANGELOG_EVIDENCE_ARGS,
                    "release_notes_output",
                    "selection_output",
                    "manual_changelog_path",
                    {
                        "flags": ["--cached-draft-path"],
                        "kwargs": {
                            "default": DEFAULT_CHANGELOG_DRAFT_OUTPUT,
                            "help": "Cached draft markdown source path used when live AI providers are unavailable.",
                        },
                    },
                    {
                        "flags": ["--debian-distribution"],
                        "kwargs": {
                            "default": None,
                            "help": (
                                "Override Debian changelog distribution token (e.g. unstable/stable). "
                                "Defaults to RELEASE_DEBIAN_DISTRIBUTION env or current top-entry distribution."
                            ),
                        },
                    },
                    {
                        "flags": ["--debian-urgency"],
                        "kwargs": {
                            "default": None,
                            "help": (
                                "Override Debian changelog urgency token (e.g. low/medium/high). "
                                "Defaults to RELEASE_DEBIAN_URGENCY env or current top-entry urgency."
                            ),
                        },
                    },
                ],
            },

            "ai-check": {
                "help": "Validate AI provider connectivity and model availability.",
                "func": cmd_changelog_ai_check,
                "args": [
                    "ai_profile",
                    "model_check",
                    "provider",
                    "base_url",
                ],
            },

            "ai-draft": {
                "help": "Generate an AI-assisted changelog draft from deterministic payload input.",
                "func": cmd_changelog_ai_draft,
                "args": [
                    "since_tag",
                    {
                        "flags": ["--output"],
                        "kwargs": {
                            "default": None,
                            "help": (
                                "Write rendered markdown draft to a file path. "
                                "When omitted, draft still persists to .changelog_scratch/changelog.draft.md."
                            ),
                        },
                    },
                    "save_json",
                    *AI_TRANSPORT_ARGS,
                    *AI_STAGE_ARGS,
                    "release_notes_output",
                ],
            },

            "ai-release": {
                "help": "Generate AI changelog draft and deterministically finalize Debian changelog in one flow.",
                "func": cmd_changelog_ai_release,
                "args": [
                    "since_tag",
                    {
                        "flags": ["--draft-output"],
                        "kwargs": {
                            "default": DEFAULT_CHANGELOG_DRAFT_OUTPUT,
                            "help": "Path where AI draft markdown is persisted before release finalization.",
                        },
                    },
                    {
                        "flags": ["--output"],
                        "kwargs": {
                            "default": DEFAULT_CHANGELOG_RELEASE_OUTPUT,
                            "help": "Output markdown path for the selected release changelog path.",
                        },
                    },
                    *CHANGELOG_EVIDENCE_ARGS,
                    "manual_changelog_path",
                    "debian_distribution",
                    "debian_urgency",
                    "save_json",
                    *AI_TRANSPORT_ARGS,
                    *AI_STAGE_ARGS,
                    "release_notes_output",
                    "selection_output",
                ],
            },

            "ai-compare": {
                "help": "Generate one comparison artifact by running AI changelog generation across profiles.",
                "func": cmd_changelog_ai_compare,
                "args": [
                    "since_tag",
                    {
                        "flags": ["--ai-profiles"],
                        "kwargs": {
                            "default": None,
                            "help": "Comma-separated AI profile slugs to compare (e.g. openai-cheap,openai-balanced).",
                        },
                    },
                    {
                        "flags": ["--output-name"],
                        "kwargs": {
                            "default": None,
                            "help": "Output file name under .changelog_scratch/comparisons/.",
                        },
                    },
                ],
            },
        },
    },
}


def resolve_arg(arg):
    if isinstance(arg, str):
        return COMMON_ARGS[arg]
    return arg


def add_args(parser, args):
    for arg in args:
        spec = resolve_arg(arg)
        parser.add_argument(*spec["flags"], **spec.get("kwargs", {}))


def add_command(subparsers, name, spec):
    parser = subparsers.add_parser(name, help=spec["help"])

    add_args(parser, spec.get("args", []))

    if "subcommands" in spec:
        nested = parser.add_subparsers(
            dest=f"{name.replace('-', '_')}_command",
            required=True,
        )

        for child_name, child_spec in spec["subcommands"].items():
            add_command(nested, child_name, child_spec)
    else:
        parser.set_defaults(func=spec["func"])

    return parser


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.release",
        description="Payload Markdown Docs release and packaging tooling.",
    )

    parser.add_argument(
        "--repo-root",
        default=".",
        help="Path to the repository root (default: current directory).",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    for name, spec in COMMANDS.items():
        add_command(subparsers, name, spec)

    return parser
