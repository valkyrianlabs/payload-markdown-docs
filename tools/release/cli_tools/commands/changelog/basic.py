import argparse
import os
from pathlib import Path

from tools.release.changelog import render_debug_json, render_release_changelog, build_ai_payload, \
    render_ai_payload_json
from tools.release.changelog.release_workflow import parse_release_ai_settings
from tools.release.cli_tools.changelog.run import run_changelog_release_with_settings
from tools.release.cli_tools.commands.changelog.build import build_changelog_context
from tools.release.cli_tools.changelog.output import write_output
from tools.release.cli_tools.changelog.print import log_release_ai_preflight


def cmd_changelog_draft(args: argparse.Namespace) -> int:
    repo_root = Path(args.repo_root).resolve()
    context = build_changelog_context(repo_root, args.since_tag)

    if args.format == "json":
        rendered = f"{render_debug_json(context)}\n"
    else:
        rendered = render_release_changelog(context)

    write_output(rendered, args.output)
    if args.output:
        print(f"Wrote changelog draft to {Path(args.output).resolve()}")
    return 0


def cmd_changelog_payload(args: argparse.Namespace) -> int:
    repo_root = Path(args.repo_root).resolve()
    context = build_changelog_context(repo_root, args.since_tag)
    payload = build_ai_payload(context)
    rendered = render_ai_payload_json(payload)

    write_output(rendered, args.output)
    if args.output:
        print(f"Wrote changelog payload to {Path(args.output).resolve()}")
    return 0


def cmd_changelog_release(args: argparse.Namespace) -> int:
    repo_root = Path(args.repo_root).resolve()
    env_settings = parse_release_ai_settings(os.environ)
    log_release_ai_preflight(env_settings)
    return run_changelog_release_with_settings(
        args,
        repo_root=repo_root,
        env_settings=env_settings,
    )
