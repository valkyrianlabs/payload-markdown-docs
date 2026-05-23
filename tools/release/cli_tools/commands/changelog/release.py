import argparse
import os
from pathlib import Path

from tools.release.cli_tools.commands.changelog.basic import cmd_changelog_release
from tools.release.cli_tools.commands.changelog.draft import cmd_changelog_ai_draft
from tools.release.cli_tools.print import print_status


def cmd_changelog_ai_release(args: argparse.Namespace) -> int:
    repo_root = Path(args.repo_root).resolve()
    draft_output_path = Path(args.draft_output)
    if not draft_output_path.is_absolute():
        draft_output_path = (repo_root / draft_output_path).resolve()
    draft_output = str(draft_output_path)

    print_status("Changelog ai-release stage: generate AI draft artifact")
    draft_args = argparse.Namespace(
        repo_root=args.repo_root,
        changelog_command="ai-release",
        since_tag=args.since_tag,
        output=draft_output,
        save_json=args.save_json,
        model=args.model,
        provider=args.provider,
        base_url=args.base_url,
        ai_profile=args.ai_profile,
        use_triage=args.use_triage,
        save_triage_json=args.save_triage_json,
        polish=args.polish,
        save_polish_json=args.save_polish_json,
        release_notes_output=args.release_notes_output,
    )
    draft_rc = cmd_changelog_ai_draft(draft_args)
    if draft_rc != 0:
        return int(draft_rc)

    print_status("Changelog ai-release stage: finalize release using freshly cached draft source")
    release_args = argparse.Namespace(
        repo_root=args.repo_root,
        since_tag=args.since_tag,
        output=args.output,
        raw_output=args.raw_output,
        payload_output=args.payload_output,
        semantic_payload_output=args.semantic_payload_output,
        context_output=args.context_output,
        release_notes_output=args.release_notes_output,
        selection_output=getattr(args, "selection_output", None),
        manual_changelog_path=args.manual_changelog_path,
        cached_draft_path=draft_output,
        debian_distribution=args.debian_distribution,
        debian_urgency=args.debian_urgency,
    )

    previous_mode = os.environ.get("RELEASE_AI_MODE")
    os.environ["RELEASE_AI_MODE"] = "disabled"
    try:
        return cmd_changelog_release(release_args)
    finally:
        if previous_mode is None:
            os.environ.pop("RELEASE_AI_MODE", None)
        else:
            os.environ["RELEASE_AI_MODE"] = previous_mode
