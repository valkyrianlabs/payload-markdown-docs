import argparse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from tools.release.changelog import build_ai_payload, build_semantic_ai_payload
from tools.release.changelog.ai import run_emergency_triage_stage, render_emergency_triage_result_json, \
    build_triage_input_from_emergency_result, run_triage_stage, generate_draft_from_payload, render_draft_markdown, \
    AIPolishResult, run_polish_stage, run_release_notes_stage, render_polish_markdown, render_polish_result_json, \
    render_draft_result_json, build_triage_ir_payload, render_triage_result_json
from tools.release.changelog.ai.providers import StructuredJSONProvider
from tools.release.changelog.release_workflow import (
    DEFAULT_CHANGELOG_SCRATCH_DIR,
    _copy_release_framing,
    _is_major_release_payload,
    render_cached_draft_markdown,
    write_release_notes_context_metadata,
)
from tools.release.cli_tools.changelog.failure import capture_stage_failure_artifact, stage_failure
from tools.release.cli_tools.changelog.output import write_output
from tools.release.cli_tools.changelog.run import run_stage_preflight
from tools.release.cli_tools.commands.changelog.build import build_changelog_context, \
    build_ai_pipeline_config_from_args, build_ai_provider_from_args
from tools.release.cli_tools.path import DEFAULT_CHANGELOG_DRAFT_OUTPUT, DEFAULT_RELEASE_NOTES_OUTPUT
from tools.release.version.adapters import read_version_file


def cmd_changelog_ai_draft(args: argparse.Namespace) -> int:
    repo_root = Path(args.repo_root).resolve()
    context = build_changelog_context(repo_root, args.since_tag)
    payload = build_ai_payload(context)
    pipeline_config = build_ai_pipeline_config_from_args(args, repo_root=repo_root)
    run_triage = bool(args.use_triage) or pipeline_config.is_stage_enabled("triage")
    run_emergency_triage = pipeline_config.is_stage_enabled("emergency_triage")
    run_polish = bool(args.polish) or pipeline_config.is_stage_enabled("polish")
    run_release_notes = pipeline_config.is_stage_enabled("release_notes")
    if run_emergency_triage and not run_triage:
        raise ValueError("`emergency_triage` stage requires triage stage to run.")
    if args.save_triage_json and not run_triage:
        raise ValueError("--save-triage-json requires triage stage to run.")
    if args.save_polish_json and not run_polish:
        raise ValueError("--save-polish-json requires polish stage to run.")
    draft_provider = build_ai_provider_from_args(args, repo_root=repo_root, stage="draft")

    # Local-compatible runs should fail early with explicit endpoint/model diagnostics.
    if pipeline_config.provider == "openai-compatible":
        run_stage_preflight(
            args=args,
            repo_root=repo_root,
            draft_provider=draft_provider,
            include_emergency_triage=run_emergency_triage and run_triage,
            include_triage=run_triage,
            include_polish=run_polish,
            include_release_notes=run_release_notes,
        )

    semantic_payload: dict | None = build_semantic_ai_payload(context) if run_triage else None
    semantic_categories = semantic_payload.get("categories") if isinstance(semantic_payload, dict) else None
    has_empty_semantic_categories = bool(
        isinstance(semantic_categories, list)
        and not any(isinstance(item, dict) for item in semantic_categories)
    )

    draft_input: dict = payload
    source_kind = "payload"
    major_release = _is_major_release_payload(payload)
    triage_input_mode = "raw_semantic"
    triage_input_payload: dict = semantic_payload if semantic_payload is not None else payload
    emergency_triage_stage_cfg = pipeline_config.stages["emergency_triage"]
    triage_stage_cfg = pipeline_config.stages["triage"]
    draft_stage_cfg = pipeline_config.stages["draft"]
    polish_stage_cfg = pipeline_config.stages["polish"]
    release_notes_stage_cfg = pipeline_config.stages["release_notes"]

    if run_triage:
        if has_empty_semantic_categories:
            print(
                "AI triage skipped: semantic payload has no categories; "
                "drafting directly from deterministic payload."
            )
            run_triage = False
            run_emergency_triage = False
        if run_triage and run_emergency_triage:
            emergency_provider = build_ai_provider_from_args(
                args,
                repo_root=repo_root,
                stage="emergency_triage",
            )
            try:
                print("Emergency triage: batch aggregation start")
                emergency_result = run_emergency_triage_stage(
                    semantic_payload if semantic_payload is not None else payload,
                    provider=emergency_provider,
                    provider_kind=pipeline_config.provider,
                    reasoning_effort=emergency_triage_stage_cfg.reasoning_effort,
                    structured_mode=emergency_triage_stage_cfg.structured_mode,
                    temperature=emergency_triage_stage_cfg.temperature,
                    max_output_tokens_policy=emergency_triage_stage_cfg.max_output_tokens,
                    progress_logger=print,
                )
                print("Emergency triage: batch aggregation end")
            except Exception as exc:
                capture_stage_failure_artifact(
                    repo_root=repo_root,
                    args=args,
                    stage="emergency_triage",
                    pipeline_config=pipeline_config,
                    provider=emergency_provider,
                    exc=exc,
                    stage_settings={
                        "structured_mode": emergency_triage_stage_cfg.structured_mode,
                        "reasoning_effort": emergency_triage_stage_cfg.reasoning_effort,
                        "temperature": emergency_triage_stage_cfg.temperature,
                        "max_output_tokens_policy": str(emergency_triage_stage_cfg.max_output_tokens),
                    },
                )
                raise stage_failure("Emergency triage", exc) from exc

            emergency_output = str((repo_root / DEFAULT_CHANGELOG_SCRATCH_DIR / "emergency_triage.json").resolve())
            print("Emergency triage: artifact write start")
            write_output(render_emergency_triage_result_json(emergency_result), emergency_output)
            print("Emergency triage: artifact write end")
            if emergency_output != "-":
                print(f"Wrote emergency triage artifact to {Path(emergency_output).resolve()}")
            if semantic_payload is not None and emergency_result.items:
                triage_input_payload = build_triage_input_from_emergency_result(
                    semantic_payload,
                    emergency_result,
                )
                triage_input_mode = "synthesized_semantic"
            else:
                print(
                    "Emergency triage produced zero synthesized items; "
                    "falling back to raw semantic triage input."
                )
        if run_triage:
            triage_provider = build_ai_provider_from_args(args, repo_root=repo_root, stage="triage")
            try:
                triage_result = run_triage_stage(
                    triage_input_payload,
                    provider=triage_provider,
                    provider_kind=pipeline_config.provider,
                    reasoning_effort=triage_stage_cfg.reasoning_effort,
                    structured_mode=triage_stage_cfg.structured_mode,
                    temperature=triage_stage_cfg.temperature,
                    max_output_tokens_policy=triage_stage_cfg.max_output_tokens,
                    input_mode=triage_input_mode,
                )
            except Exception as exc:
                capture_stage_failure_artifact(
                    repo_root=repo_root,
                    args=args,
                    stage="triage",
                    pipeline_config=pipeline_config,
                    provider=triage_provider,
                    exc=exc,
                    stage_settings={
                        "structured_mode": triage_stage_cfg.structured_mode,
                        "reasoning_effort": triage_stage_cfg.reasoning_effort,
                        "temperature": triage_stage_cfg.temperature,
                        "max_output_tokens_policy": str(triage_stage_cfg.max_output_tokens),
                    },
                )
                raise stage_failure("Triage", exc) from exc
            draft_input = build_triage_ir_payload(triage_result)
            _copy_release_framing(payload, draft_input)
            source_kind = "triage"

            if args.save_triage_json:
                write_output(render_triage_result_json(triage_result), args.save_triage_json)
                print(f"Wrote AI triage JSON to {Path(args.save_triage_json).resolve()}")

    try:
        draft = generate_draft_from_payload(
            draft_input,
            provider=draft_provider,
            source_kind=source_kind,
            provider_kind=pipeline_config.provider,
            reasoning_effort=draft_stage_cfg.reasoning_effort,
            structured_mode=draft_stage_cfg.structured_mode,
            temperature=draft_stage_cfg.temperature,
            max_output_tokens_policy=draft_stage_cfg.max_output_tokens,
        )
    except Exception as exc:
        capture_stage_failure_artifact(
            repo_root=repo_root,
            args=args,
            stage="draft",
            pipeline_config=pipeline_config,
            provider=draft_provider,
            exc=exc,
            stage_settings={
                "structured_mode": draft_stage_cfg.structured_mode,
                "reasoning_effort": draft_stage_cfg.reasoning_effort,
                "temperature": draft_stage_cfg.temperature,
                "max_output_tokens_policy": str(draft_stage_cfg.max_output_tokens),
                "source_kind": source_kind,
            },
        )
        raise stage_failure("Draft", exc) from exc
    draft_markdown: str | None = None
    if run_release_notes or not run_polish:
        draft_markdown = render_draft_markdown(draft)
    polish_result: AIPolishResult | None = None
    release_notes_result = None
    polish_provider: StructuredJSONProvider | None = None
    release_notes_provider: StructuredJSONProvider | None = None

    if run_polish:
        polish_provider = build_ai_provider_from_args(args, repo_root=repo_root, stage="polish")
    if run_release_notes:
        release_notes_provider = build_ai_provider_from_args(args, repo_root=repo_root, stage="release_notes")

    def _run_polish() -> AIPolishResult:
        assert polish_provider is not None
        try:
            return run_polish_stage(
                draft,
                provider=polish_provider,
                provider_kind=pipeline_config.provider,
                reasoning_effort=polish_stage_cfg.reasoning_effort,
                structured_mode=polish_stage_cfg.structured_mode,
                temperature=polish_stage_cfg.temperature,
                max_output_tokens_policy=polish_stage_cfg.max_output_tokens,
            )
        except Exception as exc:
            capture_stage_failure_artifact(
                repo_root=repo_root,
                args=args,
                stage="polish",
                pipeline_config=pipeline_config,
                provider=polish_provider,
                exc=exc,
                stage_settings={
                    "structured_mode": polish_stage_cfg.structured_mode,
                    "reasoning_effort": polish_stage_cfg.reasoning_effort,
                    "temperature": polish_stage_cfg.temperature,
                    "max_output_tokens_policy": str(polish_stage_cfg.max_output_tokens),
                },
            )
            raise stage_failure("Polish", exc) from exc

    def _run_release_notes():
        assert release_notes_provider is not None
        assert draft_markdown is not None
        stage_kwargs = {}
        if major_release:
            stage_kwargs["major_release"] = True
        try:
            return run_release_notes_stage(
                draft_markdown,
                provider=release_notes_provider,
                provider_kind=pipeline_config.provider,
                reasoning_effort=release_notes_stage_cfg.reasoning_effort,
                structured_mode=release_notes_stage_cfg.structured_mode,
                temperature=release_notes_stage_cfg.temperature,
                max_output_tokens_policy=release_notes_stage_cfg.max_output_tokens,
                **stage_kwargs,
            )
        except Exception as exc:
            capture_stage_failure_artifact(
                repo_root=repo_root,
                args=args,
                stage="release_notes",
                pipeline_config=pipeline_config,
                provider=release_notes_provider,
                exc=exc,
                stage_settings={
                    "structured_mode": release_notes_stage_cfg.structured_mode,
                    "reasoning_effort": release_notes_stage_cfg.reasoning_effort,
                    "temperature": release_notes_stage_cfg.temperature,
                    "max_output_tokens_policy": str(release_notes_stage_cfg.max_output_tokens),
                },
            )
            raise stage_failure("Release notes", exc) from exc

    if run_polish and run_release_notes:
        with ThreadPoolExecutor(max_workers=2, thread_name_prefix="vh-ai-final") as executor:
            futures = {
                "polish": executor.submit(_run_polish),
                "release_notes": executor.submit(_run_release_notes),
            }
            stage_errors: dict[str, Exception] = {}
            for stage_name in ("polish", "release_notes"):
                try:
                    result = futures[stage_name].result()
                except Exception as exc:  # pragma: no cover - exercised by stage failure tests.
                    stage_errors[stage_name] = exc if isinstance(exc, Exception) else RuntimeError(str(exc))
                    continue
                if stage_name == "polish":
                    polish_result = result
                else:
                    release_notes_result = result
            if stage_errors:
                first_failed_stage = "polish" if "polish" in stage_errors else "release_notes"
                raise stage_errors[first_failed_stage]
    elif run_polish:
        polish_result = _run_polish()
    elif run_release_notes:
        release_notes_result = _run_release_notes()

    if polish_result is not None and args.save_polish_json:
        write_output(render_polish_result_json(polish_result), args.save_polish_json)
        print(f"Wrote AI polish JSON to {Path(args.save_polish_json).resolve()}")

    if release_notes_result is not None:
        release_notes_output = getattr(args, "release_notes_output", DEFAULT_RELEASE_NOTES_OUTPUT)
        write_output(release_notes_result.markdown, release_notes_output)
        if release_notes_output != "-":
            release_notes_path = Path(release_notes_output).resolve()
            write_release_notes_context_metadata(
                release_notes_path=release_notes_path,
                context=context,
            )
            print(f"Wrote AI release notes to {release_notes_path}")

    if polish_result is not None:
        final_markdown = render_polish_markdown(polish_result)
    else:
        assert draft_markdown is not None
        final_markdown = draft_markdown

    version = read_version_file(repo_root / "VERSION")
    cached_markdown = render_cached_draft_markdown(version=str(version), content=final_markdown, context=context)
    cached_target = args.output
    if cached_target is None or cached_target == "-":
        cached_target = DEFAULT_CHANGELOG_DRAFT_OUTPUT
    write_output(cached_markdown, cached_target)

    if args.output is None or args.output == "-":
        write_output(final_markdown, None)
    else:
        print(f"Wrote AI changelog draft to {Path(args.output).resolve()}")

    if args.save_json:
        if polish_result is not None:
            write_output(render_polish_result_json(polish_result), args.save_json)
        else:
            write_output(render_draft_result_json(draft), args.save_json)
        print(f"Wrote AI draft JSON to {Path(args.save_json).resolve()}")

    return 0
