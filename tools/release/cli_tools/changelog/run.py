import argparse
import json
import os
from pathlib import Path

from tools.release.changelog import build_ai_payload, build_semantic_ai_payload, render_release_changelog, \
    render_ai_payload_json, render_semantic_ai_payload_json
from tools.release.changelog.ai import AIStageName
from tools.release.changelog.ai.providers import StructuredJSONProvider, run_provider_preflight
from tools.release.changelog.release_workflow import (
    CHANGELOG_SELECTION_SCHEMA_VERSION,
    build_release_context_metadata,
    refresh_debian_changelog_entry,
    release_notes_context_matches,
    release_notes_context_path,
    render_release_context_metadata_json,
    resolve_release_changelog,
    write_release_notes_context_metadata,
)
from tools.release.cli_tools.commands.changelog.build import build_changelog_context, \
    build_ai_provider_config_from_args, build_ai_provider_from_args
from tools.release.cli_tools.changelog.output import write_output
from tools.release.cli_tools.path import (
    DEFAULT_CHANGELOG_CONTEXT_OUTPUT,
    DEFAULT_CHANGELOG_DRAFT_OUTPUT,
    DEFAULT_CHANGELOG_SEMANTIC_PAYLOAD_OUTPUT,
    DEFAULT_RELEASE_NOTES_OUTPUT,
)
from tools.release.cli_tools.print import print_status


def run_changelog_release_with_settings(
    args: argparse.Namespace,
    *,
    repo_root: Path,
    env_settings,
) -> int:
    try:
        print_status("Changelog release stage: build deterministic context + payload")
        context = build_changelog_context(repo_root, args.since_tag)
        payload = build_ai_payload(context)
        semantic_payload = build_semantic_ai_payload(context)
        raw_markdown = render_release_changelog(context)
        payload_json = render_ai_payload_json(payload)
        semantic_payload_json = render_semantic_ai_payload_json(semantic_payload)
        context_metadata = build_release_context_metadata(context, semantic_payload=semantic_payload)
        context_metadata_json = render_release_context_metadata_json(context_metadata)
        print_status(
            "Changelog context: "
            f"previous_tag={getattr(context, 'previous_tag', None) or 'none'}, "
            f"latest_tag={getattr(context, 'latest_tag', None) or 'none'}, "
            f"commits={getattr(context, 'commit_count', None)}, "
            f"semantic_categories={context_metadata['semantic_category_count']}, "
            f"semantic_hunks={context_metadata['semantic_hunk_count']}"
        )
        for note in getattr(context, "cross_cutting_notes", []) or []:
            print_status(f"Changelog context note: {note}")
    except Exception as exc:
        raise ValueError(f"Changelog release failed during context/payload generation: {exc}") from exc

    try:
        print_status("Changelog release stage: write evidence artifacts")
        write_output(raw_markdown, args.raw_output)
        print_status(f"Wrote changelog raw evidence to {Path(args.raw_output).resolve()}")
        write_output(payload_json, args.payload_output)
        print_status(f"Wrote changelog payload evidence to {Path(args.payload_output).resolve()}")
        semantic_target = getattr(args, "semantic_payload_output", DEFAULT_CHANGELOG_SEMANTIC_PAYLOAD_OUTPUT)
        write_output(semantic_payload_json, semantic_target)
        print_status(f"Wrote changelog semantic payload evidence to {Path(semantic_target).resolve()}")
        context_target = getattr(args, "context_output", DEFAULT_CHANGELOG_CONTEXT_OUTPUT)
        write_output(context_metadata_json, context_target)
        print_status(f"Wrote changelog context metadata to {Path(context_target).resolve()}")
    except Exception as exc:
        raise ValueError(f"Changelog release failed while writing evidence artifacts: {exc}") from exc

    try:
        print_status("Changelog release stage: resolve changelog source")
        selection = resolve_release_changelog(
            repo_root=repo_root,
            payload=payload,
            semantic_payload=semantic_payload,
            context=context,
            settings=env_settings,
            manual_changelog_path=args.manual_changelog_path,
            cached_draft_path=getattr(args, "cached_draft_path", DEFAULT_CHANGELOG_DRAFT_OUTPUT),
            logger=print_status,
        )
        selected_source = selection.path
        source_path = getattr(selection, "source_path", None)
        source_suffix = f" ({source_path})" if source_path is not None else ""
        print_status(f"Selected changelog source: {selected_source}{source_suffix}")
    except Exception as exc:
        raise ValueError(f"Changelog release failed during source selection/generation: {exc}") from exc

    try:
        print_status("Changelog release stage: write selected release changelog")
        write_output(selection.content, args.output)
        print_status(f"Wrote release changelog to {Path(args.output).resolve()}")
        release_notes_output = getattr(args, "release_notes_output", DEFAULT_RELEASE_NOTES_OUTPUT)
        release_notes_content = getattr(selection, "release_notes_content", None)
        if release_notes_content is not None:
            write_output(release_notes_content, release_notes_output)
            print_status(f"Wrote release notes artifact to {Path(release_notes_output).resolve()}")
        release_notes_path = Path(release_notes_output)
        if release_notes_output != "-" and not release_notes_path.is_absolute():
            release_notes_path = (repo_root / release_notes_path).resolve()
        release_notes_context_output = release_notes_context_path(release_notes_path)
        if release_notes_output != "-" and release_notes_content is not None and release_notes_content.strip():
            release_notes_context_output = write_release_notes_context_metadata(
                release_notes_path=release_notes_path,
                context=context,
            )
            print_status(f"Wrote release notes context metadata to {release_notes_context_output.resolve()}")
        release_notes_generated = False
        if release_notes_output != "-" and selection.path != "manual" and release_notes_context_matches(
            release_notes_path=release_notes_path,
            context=context,
        ):
            release_notes_generated = True
        elif release_notes_output != "-" and release_notes_path.is_file() and release_notes_path.read_text(encoding="utf-8").strip():
            print_status(
                "Release notes artifact is present but missing/mismatched current context metadata; "
                "not marking it generated for GitHub sync."
            )
        selection_output = getattr(args, "selection_output", None)
        if selection_output:
            selection_metadata = {
                "schema_version": CHANGELOG_SELECTION_SCHEMA_VERSION,
                "selected_path": selection.path,
                "source_path": str(selection.source_path) if selection.source_path is not None else None,
                "context": context_metadata,
                "context_output": str(Path(getattr(args, "context_output", DEFAULT_CHANGELOG_CONTEXT_OUTPUT)).resolve()),
                "release_notes_generated": release_notes_generated,
                "release_notes_output": str(release_notes_path),
                "release_notes_context_output": str(release_notes_context_output),
                "ai_mode": env_settings.mode,
                "openai_profile": env_settings.openai_profile,
                "local_profile": env_settings.local_profile,
                "local_enabled": env_settings.local_enabled,
            }
            write_output(json.dumps(selection_metadata, indent=2) + "\n", selection_output)
            print_status(f"Wrote changelog selection metadata to {Path(selection_output).resolve()}")
        if selection.path == "local" and env_settings.local_base_url_override:
            if selection.local_base_url_overrode_profile:
                print_status("Local base_url override status: applied from RELEASE_LOCAL_LLM_BASE_URL.")
            else:
                print_status("Local base_url override status: set but not applied.")
    except Exception as exc:
        raise ValueError(f"Changelog release failed while writing selected output: {exc}") from exc

    if selection.path == "manual":
        print_status(
            "Changelog release stage: Debian changelog entry update skipped "
            "(manual/no-AI fallback source selected)."
        )
        return 0

    try:
        print_status("Changelog release stage: refresh Debian changelog top entry metadata + summary")
        updated = refresh_debian_changelog_entry(
            changelog_path=Path(args.manual_changelog_path)
            if Path(args.manual_changelog_path).is_absolute()
            else (repo_root / args.manual_changelog_path),
            release_markdown=selection.content,
            distribution=args.debian_distribution,
            urgency=args.debian_urgency,
            environ=os.environ,
        )
        print_status(f"Updated Debian changelog entry at {updated.path}")
        print_status(
            "Debian entry metadata: "
            f"{updated.package} ({updated.full_version}) {updated.distribution}; urgency={updated.urgency}"
        )
        print_status(f"Debian entry maintainer: {updated.maintainer}")
        print_status(f"Debian entry timestamp:  {updated.timestamp}")
    except Exception as exc:
        raise ValueError(f"Changelog release failed while updating Debian changelog: {exc}") from exc

    return 0


def run_stage_preflight(
    *,
    args: argparse.Namespace,
    repo_root: Path,
    draft_provider: StructuredJSONProvider,
    include_emergency_triage: bool,
    include_triage: bool,
    include_polish: bool,
    include_release_notes: bool,
) -> None:
    seen: set[tuple[str, str | None]] = set()
    stage_order: list[AIStageName] = []
    if include_emergency_triage:
        stage_order.append("emergency_triage")
    if include_triage:
        stage_order.append("triage")
    stage_order.append("draft")
    if include_polish:
        stage_order.append("polish")
    if include_release_notes:
        stage_order.append("release_notes")

    for stage in stage_order:
        stage_config = build_ai_provider_config_from_args(args, repo_root=repo_root, stage=stage)
        fingerprint = (stage_config.model, stage_config.base_url)
        if fingerprint in seen:
            continue

        provider = (
            draft_provider
            if stage == "draft"
            else build_ai_provider_from_args(args, repo_root=repo_root, stage=stage)
        )
        _ = run_provider_preflight(stage_config, provider=provider, require_model=True)
        seen.add(fingerprint)
