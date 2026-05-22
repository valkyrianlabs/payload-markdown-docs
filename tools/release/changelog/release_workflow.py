from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from email.utils import format_datetime
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Literal, Mapping

from tools.release.changelog.ai.config import (
    AIPipelineCLIOverrides,
    AIPipelineConfig,
    AIProviderConfig,
    AIStageName,
    resolve_ai_pipeline_config,
)
from tools.release.changelog.ai.contracts.polish import AIPolishResult
from tools.release.changelog.ai.contracts.triage import build_triage_ir_payload
from tools.release.changelog.ai.failure_artifacts import (
    collect_provider_failure_evidence,
    provider_response_observed,
    write_failure_artifact,
)
from tools.release.changelog.ai.providers import build_structured_json_provider, run_provider_preflight
from tools.release.changelog.ai.providers.base import StructuredJSONProvider
from tools.release.changelog.ai.render.markdown import render_draft_markdown, render_polish_markdown
from tools.release.changelog.ai.stages.draft import generate_draft_from_payload
from tools.release.changelog.ai.stages.emergency_triage import (
    build_triage_input_from_emergency_result,
    render_emergency_triage_result_json,
    run_emergency_triage_stage,
)
from tools.release.changelog.ai.stages.polish import run_polish_stage
from tools.release.changelog.ai.stages.release_notes import run_release_notes_stage
from tools.release.changelog.ai.stages.triage import run_triage_stage
from tools.release.changelog.models import ReleaseContext
from tools.release.version.adapters.debian import CHANGELOG_HEADER_PATTERN, parse_debian_version
from tools.release.version.adapters.version_file import read_version_file

ReleaseAIMode = Literal["auto", "openai-only", "local-only", "disabled"]
ReleaseChangelogPath = Literal["openai", "local", "cached-draft", "manual"]

DEFAULT_RELEASE_AI_MODE: ReleaseAIMode = "auto"
DEFAULT_RELEASE_OPENAI_PROFILE = "openai-balanced"
DEFAULT_CHANGELOG_SCRATCH_DIR = Path(".changelog_scratch")
DEFAULT_CACHED_DRAFT_PATH = DEFAULT_CHANGELOG_SCRATCH_DIR / "changelog.draft.md"
RELEASE_CONTEXT_METADATA_SCHEMA_VERSION = "vaulthalla.release.changelog_context.v1"
RELEASE_CONTEXT_FINGERPRINT_SCHEMA_VERSION = "vaulthalla.release.context_fingerprint.v1"
RELEASE_NOTES_CONTEXT_SCHEMA_VERSION = "vaulthalla.release.release_notes_context.v1"
CHANGELOG_SELECTION_SCHEMA_VERSION = "vaulthalla.release.changelog_selection.v2"
DEBIAN_CHANGELOG_SIGNATURE_PATTERN = re.compile(r"^ -- (?P<maintainer>.+?)  (?P<timestamp>.+)$")
DEBIAN_CHANGELOG_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9+.-]*$")
_DEBIAN_REPO_PATH_RE = re.compile(r"\b(?:core|tools|web|debian|deploy|bin)/[a-z0-9_./-]+\b", re.IGNORECASE)
_DEBIAN_FILE_PATH_RE = re.compile(
    r"\b[a-z0-9_.-]+(?:/[a-z0-9_.-]+)+\.(?:py|cpp|c|h|hpp|md|yaml|yml|json|toml|ini|sh|sql)\b",
    re.IGNORECASE,
)
_DEBIAN_KIND_REF_RE = re.compile(
    r"#(?:api-contract|command-surface|schema-change|prompt-contract|config-surface|error-handling|"
    r"filesystem-lifecycle|packaging-script|output-artifact|tests-contract|implementation-change)\b"
)


@dataclass(frozen=True)
class ReleaseAISettings:
    mode: ReleaseAIMode
    openai_profile: str
    openai_api_key_present: bool
    local_enabled: bool
    local_profile: str | None
    local_base_url_override: str | None
    local_api_key: str | None


@dataclass(frozen=True)
class ManualChangelogValidation:
    path: Path
    version: str
    detected_target: str
    content: str


@dataclass(frozen=True)
class ReleaseChangelogSelection:
    path: ReleaseChangelogPath
    content: str
    source_path: Path | None = None
    local_base_url_overrode_profile: bool = False
    release_notes_content: str | None = None


@dataclass(frozen=True)
class DebianChangelogUpdateResult:
    path: Path
    package: str
    full_version: str
    distribution: str
    urgency: str
    maintainer: str
    timestamp: str


@dataclass(frozen=True)
class _DebianTopEntry:
    package: str
    full_version: str
    distribution: str
    urgency: str
    maintainer: str
    start_index: int
    end_index: int
    lines: list[str]


def build_release_context_fingerprint(context: ReleaseContext) -> dict[str, Any]:
    return {
        "schema_version": RELEASE_CONTEXT_FINGERPRINT_SCHEMA_VERSION,
        "version": getattr(context, "version", None),
        "previous_tag": getattr(context, "previous_tag", None),
        "head_sha": getattr(context, "head_sha", None),
        "commit_count": getattr(context, "commit_count", None),
    }


def build_release_context_metadata(
    context: ReleaseContext,
    *,
    semantic_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    semantic_by_name: dict[str, dict[str, Any]] = {}
    if isinstance(semantic_payload, dict):
        for item in _as_dict_list(semantic_payload.get("categories")):
            name = _read_string_value(item.get("name"))
            if name:
                semantic_by_name[name] = item

    categories: list[dict[str, Any]] = []
    context_categories = getattr(context, "categories", {}) or {}
    for name, category in context_categories.items():
        semantic_category = semantic_by_name.get(name, {})
        categories.append(
            {
                "name": name,
                "commit_count": category.commit_count,
                "file_count": len(category.files),
                "snippet_count": len(category.snippets),
                "insertions": category.insertions,
                "deletions": category.deletions,
                "semantic_candidate_commit_count": len(_as_sequence(semantic_category.get("candidate_commits"))),
                "semantic_hunk_count": len(_as_sequence(semantic_category.get("semantic_hunks"))),
            }
        )

    semantic_categories = _as_sequence(semantic_payload.get("categories")) if isinstance(semantic_payload, dict) else []
    semantic_hunk_count = 0
    for item in semantic_categories:
        if isinstance(item, dict):
            semantic_hunk_count += len(_as_sequence(item.get("semantic_hunks")))

    return {
        "schema_version": RELEASE_CONTEXT_METADATA_SCHEMA_VERSION,
        "fingerprint": build_release_context_fingerprint(context),
        "version": getattr(context, "version", None),
        "previous_tag": getattr(context, "previous_tag", None),
        "head_sha": getattr(context, "head_sha", None),
        "commit_count": getattr(context, "commit_count", None),
        "latest_tag": getattr(context, "latest_tag", None),
        "skipped_current_release_tag": bool(getattr(context, "skipped_current_release_tag", False)),
        "explicit_previous_tag": bool(getattr(context, "explicit_previous_tag", False)),
        "semantic_category_count": len([item for item in semantic_categories if isinstance(item, dict)]),
        "semantic_hunk_count": semantic_hunk_count,
        "categories": categories,
        "commit_samples": {
            "newest": [_commit_summary(commit) for commit in list(getattr(context, "commits", []) or [])[:5]],
            "oldest": [_commit_summary(commit) for commit in list(getattr(context, "commits", []) or [])[-5:]],
        },
        "notes": list(getattr(context, "cross_cutting_notes", []) or []),
    }


def render_release_context_metadata_json(metadata: dict[str, Any]) -> str:
    return json.dumps(metadata, indent=2, sort_keys=False) + "\n"


def release_notes_context_path(release_notes_path: Path | str) -> Path:
    path = Path(release_notes_path)
    return path.with_name(f"{path.name}.context.json")


def write_release_notes_context_metadata(
    *,
    release_notes_path: Path | str,
    context: ReleaseContext,
) -> Path:
    target = release_notes_context_path(release_notes_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": RELEASE_NOTES_CONTEXT_SCHEMA_VERSION,
        "context": build_release_context_fingerprint(context),
    }
    target.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    return target


def release_notes_context_matches(
    *,
    release_notes_path: Path | str,
    context: ReleaseContext,
) -> bool:
    notes_path = Path(release_notes_path)
    if not notes_path.is_file() or not notes_path.read_text(encoding="utf-8").strip():
        return False
    metadata_path = release_notes_context_path(notes_path)
    if not metadata_path.is_file():
        return False
    try:
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False
    if not isinstance(payload, dict) or payload.get("schema_version") != RELEASE_NOTES_CONTEXT_SCHEMA_VERSION:
        return False
    actual = payload.get("context")
    return isinstance(actual, dict) and _context_fingerprint_matches(actual, build_release_context_fingerprint(context))


def parse_release_ai_settings(environ: Mapping[str, str] | None = None) -> ReleaseAISettings:
    env = dict(os.environ if environ is None else environ)

    mode_raw = env.get("RELEASE_AI_MODE", DEFAULT_RELEASE_AI_MODE)
    mode = _parse_release_ai_mode(mode_raw)
    openai_profile = _normalize_or_default(env.get("RELEASE_AI_PROFILE_OPENAI"), DEFAULT_RELEASE_OPENAI_PROFILE)
    openai_api_key_present = bool(_normalize_optional_string(env.get("OPENAI_API_KEY")))
    local_enabled = _parse_bool(env.get("RELEASE_LOCAL_LLM_ENABLED"), var_name="RELEASE_LOCAL_LLM_ENABLED", default=False)
    local_profile = _normalize_optional_string(env.get("RELEASE_LOCAL_LLM_PROFILE"))
    local_base_url_override = _normalize_optional_string(env.get("RELEASE_LOCAL_LLM_BASE_URL"))
    local_api_key = _normalize_optional_string(env.get("RELEASE_LOCAL_LLM_API_KEY"))

    return ReleaseAISettings(
        mode=mode,
        openai_profile=openai_profile,
        openai_api_key_present=openai_api_key_present,
        local_enabled=local_enabled,
        local_profile=local_profile,
        local_base_url_override=local_base_url_override,
        local_api_key=local_api_key,
    )


def resolve_release_changelog(
    *,
    repo_root: Path,
    payload: dict,
    semantic_payload: dict | None = None,
    context: ReleaseContext | None = None,
    settings: ReleaseAISettings,
    manual_changelog_path: Path | str = Path("debian/changelog"),
    cached_draft_path: Path | str = DEFAULT_CACHED_DRAFT_PATH,
    logger: Callable[[str], None] | None = None,
) -> ReleaseChangelogSelection:
    emit = logger or (lambda _line: None)
    emit(f"Release changelog mode: {settings.mode}")
    emit(f"OpenAI profile: {settings.openai_profile}")
    emit(f"OpenAI API key present: {'yes' if settings.openai_api_key_present else 'no'}")
    emit(f"Local LLM fallback enabled: {'yes' if settings.local_enabled else 'no'}")
    if settings.local_profile:
        emit(f"Local LLM profile: {settings.local_profile}")
    if settings.local_base_url_override:
        emit(f"Local LLM base URL override from env: {settings.local_base_url_override}")

    for candidate in _release_candidate_order(settings.mode):
        if candidate == "openai":
            can_use_openai, reason = _can_attempt_openai(settings)
            if not can_use_openai:
                emit(f"Skipping OpenAI path: {reason}")
                continue
            try:
                content, release_notes_content = _generate_openai_release_changelog(
                    repo_root=repo_root,
                    payload=payload,
                    semantic_payload=semantic_payload,
                    settings=settings,
                    logger=emit,
                )
            except Exception as exc:
                emit(f"OpenAI path failed, falling back: {exc}")
                continue
            emit("Selected changelog path: OpenAI")
            return ReleaseChangelogSelection(
                path="openai",
                content=content,
                release_notes_content=release_notes_content,
            )

        if candidate == "local":
            can_use_local, reason = _can_attempt_local(settings)
            if not can_use_local:
                emit(f"Skipping local LLM path: {reason}")
                continue
            try:
                content, release_notes_content, used_override = _generate_local_release_changelog(
                    repo_root=repo_root,
                    payload=payload,
                    semantic_payload=semantic_payload,
                    settings=settings,
                    logger=emit,
                )
            except Exception as exc:
                emit(f"Local LLM path failed, falling back: {exc}")
                continue
            emit("Selected changelog path: local LLM")
            return ReleaseChangelogSelection(
                path="local",
                content=content,
                local_base_url_overrode_profile=used_override,
                release_notes_content=release_notes_content,
            )

        if candidate == "cached-draft":
            try:
                cached = validate_cached_draft_current(
                    repo_root=repo_root,
                    draft_path=cached_draft_path,
                    context=context,
                    require_context=context is not None,
                )
            except Exception as exc:
                emit(f"Skipping cached draft path: {exc}")
                continue
            emit(f"Selected changelog path: cached local draft ({cached.path})")
            emit(
                "Cached draft validation passed: "
                f"{cached.path} targets VERSION {cached.detected_target}."
            )
            return ReleaseChangelogSelection(
                path="cached-draft",
                content=cached.content,
                source_path=cached.path,
            )

        validation = validate_manual_changelog_current(
            repo_root=repo_root,
            changelog_path=manual_changelog_path,
        )
        emit("Selected changelog path: manual/no-AI fallback (existing debian/changelog)")
        emit(
            "Manual changelog stale check passed: "
            f"{validation.path} targets version {validation.detected_target} (VERSION={validation.version})."
        )
        emit("No generated AI/cached draft content was selected; reusing manual changelog source.")
        return ReleaseChangelogSelection(path="manual", content=validation.content, source_path=validation.path)

    # The candidate order always ends with manual.
    raise ValueError("No release changelog strategy could be resolved.")


def resolve_local_release_pipeline_config(
    *,
    repo_root: Path,
    profile_slug: str,
    base_url_override: str | None,
) -> tuple[AIPipelineConfig, str | None, bool]:
    base_pipeline = resolve_ai_pipeline_config(
        repo_root=repo_root,
        profile_slug=profile_slug,
        cli_overrides=AIPipelineCLIOverrides(provider="openai-compatible"),
    )
    resolved_pipeline = resolve_ai_pipeline_config(
        repo_root=repo_root,
        profile_slug=profile_slug,
        cli_overrides=AIPipelineCLIOverrides(
            provider="openai-compatible",
            base_url=base_url_override,
        ),
    )
    normalized_override = _normalize_optional_string(base_url_override)
    override_applied = normalized_override is not None and resolved_pipeline.base_url == normalized_override
    return resolved_pipeline, base_pipeline.base_url, override_applied


def validate_manual_changelog_current(
    *,
    repo_root: Path,
    changelog_path: Path | str,
) -> ManualChangelogValidation:
    version_path = repo_root / "VERSION"
    version = read_version_file(version_path)
    target_path = Path(changelog_path)
    if not target_path.is_absolute():
        target_path = (repo_root / target_path).resolve()
    if not target_path.is_file():
        raise ValueError(
            "Manual changelog validation failed: "
            f"required file is missing at {target_path}."
        )

    content = target_path.read_text(encoding="utf-8")
    first_non_empty_line = ""
    for line in content.splitlines():
        stripped = line.strip()
        if stripped:
            first_non_empty_line = stripped
            break
    if not first_non_empty_line:
        raise ValueError(f"Manual changelog validation failed: changelog is empty: {target_path}")

    header_match = CHANGELOG_HEADER_PATTERN.fullmatch(first_non_empty_line)
    if header_match:
        detected = parse_debian_version(header_match.group("full_version")).upstream
        if detected != version:
            raise ValueError(
                "Manual changelog validation failed: stale changelog. "
                f"{target_path} targets {detected} but VERSION is {version}."
            )
        return ManualChangelogValidation(
            path=target_path,
            version=str(version),
            detected_target=str(detected),
            content=content,
        )

    token = re.escape(str(version))
    if not re.search(rf"\b{token}\b", content):
        raise ValueError(
            "Manual changelog validation failed: stale changelog. "
            f"{target_path} does not mention VERSION {version}."
        )
    return ManualChangelogValidation(
        path=target_path,
        version=str(version),
        detected_target=str(version),
        content=content,
    )


def validate_cached_draft_current(
    *,
    repo_root: Path,
    draft_path: Path | str = DEFAULT_CACHED_DRAFT_PATH,
    context: ReleaseContext | None = None,
    require_context: bool = False,
) -> ManualChangelogValidation:
    version_path = repo_root / "VERSION"
    version = read_version_file(version_path)
    target_path = Path(draft_path)
    if not target_path.is_absolute():
        target_path = (repo_root / target_path).resolve()
    if not target_path.is_file():
        raise ValueError(f"cached draft file is missing at {target_path}")

    content = target_path.read_text(encoding="utf-8")
    if not content.strip():
        raise ValueError(f"cached draft file is empty at {target_path}")

    detected_target = _detect_cached_draft_version(content)
    if detected_target is not None and detected_target != str(version):
        raise ValueError(
            "cached draft is stale. "
            f"{target_path} targets {detected_target} but VERSION is {version}."
        )
    if detected_target is None:
        raise ValueError(
            "cached draft metadata is missing required version marker. "
            f"Regenerate with `python3 -m tools.release changelog ai-draft`."
        )

    expected_context = build_release_context_fingerprint(context) if context is not None else None
    detected_context = _detect_cached_draft_context(content)
    if require_context and detected_context is None:
        raise ValueError(
            "cached draft metadata is missing required release context marker. "
            f"Regenerate with `python3 -m tools.release changelog ai-draft`."
        )
    if expected_context is not None and detected_context is not None:
        _validate_cached_context_matches(
            actual=detected_context,
            expected=expected_context,
            target_path=target_path,
        )

    return ManualChangelogValidation(
        path=target_path,
        version=str(version),
        detected_target=detected_target,
        content=_strip_cached_draft_metadata(content),
    )


def refresh_debian_changelog_entry(
    *,
    changelog_path: Path | str,
    release_markdown: str,
    distribution: str | None = None,
    urgency: str | None = None,
    environ: Mapping[str, str] | None = None,
    now: datetime | None = None,
) -> DebianChangelogUpdateResult:
    env = dict(os.environ if environ is None else environ)
    target_path = Path(changelog_path).resolve()
    if not target_path.is_file():
        raise ValueError(f"Debian changelog update failed: file not found: {target_path}")

    original = target_path.read_text(encoding="utf-8")
    top = _parse_debian_top_entry(original, target_path)
    maintainer = _resolve_debian_maintainer(top.maintainer, env)
    resolved_distribution = _resolve_debian_token(
        explicit=distribution,
        env_value=env.get("RELEASE_DEBIAN_DISTRIBUTION"),
        fallback=top.distribution,
        field_name="distribution",
    )
    resolved_urgency = _resolve_debian_token(
        explicit=urgency,
        env_value=env.get("RELEASE_DEBIAN_URGENCY"),
        fallback=top.urgency,
        field_name="urgency",
    )
    bullet_lines = _extract_debian_bullets(release_markdown)
    now_value = now if now is not None else datetime.now(timezone.utc)
    if now_value.tzinfo is None:
        now_value = now_value.replace(tzinfo=timezone.utc)
    timestamp = format_datetime(now_value.astimezone(timezone.utc))

    rendered_entry = _render_debian_entry(
        package=top.package,
        full_version=top.full_version,
        distribution=resolved_distribution,
        urgency=resolved_urgency,
        maintainer=maintainer,
        timestamp=timestamp,
        bullets=bullet_lines,
    )
    updated = _replace_debian_top_entry(top, rendered_entry)
    target_path.write_text(updated, encoding="utf-8")

    return DebianChangelogUpdateResult(
        path=target_path,
        package=top.package,
        full_version=top.full_version,
        distribution=resolved_distribution,
        urgency=resolved_urgency,
        maintainer=maintainer,
        timestamp=timestamp,
    )


def _release_candidate_order(mode: ReleaseAIMode) -> tuple[ReleaseChangelogPath, ...]:
    if mode == "auto":
        return ("openai", "local", "cached-draft", "manual")
    if mode == "openai-only":
        return ("openai", "cached-draft", "manual")
    if mode == "local-only":
        return ("local", "cached-draft", "manual")
    return ("cached-draft", "manual")


def _can_attempt_openai(settings: ReleaseAISettings) -> tuple[bool, str]:
    if not settings.openai_api_key_present:
        return False, "OPENAI_API_KEY is not set."
    if not settings.openai_profile:
        return False, "RELEASE_AI_PROFILE_OPENAI is not set."
    return True, "ok"


def _can_attempt_local(settings: ReleaseAISettings) -> tuple[bool, str]:
    if not settings.local_enabled:
        return False, "RELEASE_LOCAL_LLM_ENABLED is not true."
    if not settings.local_profile:
        return False, "RELEASE_LOCAL_LLM_PROFILE is not set."
    return True, "ok"


def _generate_openai_release_changelog(
    *,
    repo_root: Path,
    payload: dict,
    semantic_payload: dict | None,
    settings: ReleaseAISettings,
    logger: Callable[[str], None],
) -> tuple[str, str | None]:
    pipeline = resolve_ai_pipeline_config(
        repo_root=repo_root,
        profile_slug=settings.openai_profile,
        cli_overrides=AIPipelineCLIOverrides(provider="openai"),
    )
    logger(f"Attempting OpenAI profile `{settings.openai_profile}`.")
    return _run_release_ai_pipeline(
        repo_root=repo_root,
        payload=payload,
        semantic_payload=semantic_payload,
        pipeline=pipeline,
        logger=logger,
    )


def _generate_local_release_changelog(
    *,
    repo_root: Path,
    payload: dict,
    semantic_payload: dict | None,
    settings: ReleaseAISettings,
    logger: Callable[[str], None],
) -> tuple[str, str | None, bool]:
    assert settings.local_profile is not None
    pipeline, profile_base_url, override_applied = resolve_local_release_pipeline_config(
        repo_root=repo_root,
        profile_slug=settings.local_profile,
        base_url_override=settings.local_base_url_override,
    )
    if settings.local_base_url_override:
        logger(
            "Local LLM base URL override active via RELEASE_LOCAL_LLM_BASE_URL: "
            f"{pipeline.base_url} (profile base_url={profile_base_url or '<none>'})."
        )
    else:
        logger(f"Local LLM base URL from profile/default: {pipeline.base_url or '<provider-default>'}.")

    if settings.local_api_key:
        logger("Using RELEASE_LOCAL_LLM_API_KEY for local OpenAI-compatible gateway authentication.")
    logger(f"Attempting local profile `{settings.local_profile}`.")
    content, release_notes = _run_release_ai_pipeline(
        repo_root=repo_root,
        payload=payload,
        semantic_payload=semantic_payload,
        pipeline=pipeline,
        local_api_key=settings.local_api_key,
        logger=logger,
    )
    return content, release_notes, override_applied


def _run_release_ai_pipeline(
    *,
    repo_root: Path,
    payload: dict,
    semantic_payload: dict | None,
    pipeline: AIPipelineConfig,
    local_api_key: str | None = None,
    logger: Callable[[str], None],
) -> tuple[str, str | None]:
    emit = logger or (lambda _line: None)
    run_triage = pipeline.is_stage_enabled("triage")
    run_emergency_triage = pipeline.is_stage_enabled("emergency_triage") and run_triage
    run_polish = pipeline.is_stage_enabled("polish")
    run_release_notes = pipeline.is_stage_enabled("release_notes")

    providers = _build_stage_providers(
        pipeline=pipeline,
        include_emergency_triage=run_emergency_triage,
        include_triage=run_triage,
        include_polish=run_polish,
        include_release_notes=run_release_notes,
        local_api_key=local_api_key if pipeline.provider == "openai-compatible" else None,
        logger=logger,
    )

    draft_input: dict = payload
    source_kind = "payload"
    triage_input_mode = "raw_semantic"
    triage_input_payload = semantic_payload if isinstance(semantic_payload, dict) else payload
    semantic_categories = semantic_payload.get("categories") if isinstance(semantic_payload, dict) else None
    has_empty_semantic_categories = bool(
        isinstance(semantic_categories, list)
        and not any(isinstance(item, dict) for item in semantic_categories)
    )
    emergency_triage_cfg = pipeline.stages["emergency_triage"]
    triage_cfg = pipeline.stages["triage"]
    draft_cfg = pipeline.stages["draft"]
    polish_cfg = pipeline.stages["polish"]
    release_notes_cfg = pipeline.stages["release_notes"]

    if run_triage:
        if has_empty_semantic_categories:
            emit(
                "Skipping triage stages: semantic payload has no categories; "
                "falling back to deterministic payload draft input."
            )
            run_triage = False
            run_emergency_triage = False
        if run_triage and run_emergency_triage and isinstance(semantic_payload, dict):
            try:
                emit("Emergency triage: batch aggregation start")
                emergency_triage_result = run_emergency_triage_stage(
                    semantic_payload,
                    provider=providers["emergency_triage"],
                    provider_kind=pipeline.provider,
                    reasoning_effort=emergency_triage_cfg.reasoning_effort,
                    structured_mode=emergency_triage_cfg.structured_mode,
                    temperature=emergency_triage_cfg.temperature,
                    max_output_tokens_policy=emergency_triage_cfg.max_output_tokens,
                    progress_logger=emit,
                )
                emit("Emergency triage: batch aggregation end")
            except Exception as exc:
                _capture_release_stage_failure_artifact(
                    repo_root=repo_root,
                    pipeline=pipeline,
                    stage="emergency_triage",
                    provider=providers["emergency_triage"],
                    exc=exc,
                    stage_settings={
                        "structured_mode": emergency_triage_cfg.structured_mode,
                        "reasoning_effort": emergency_triage_cfg.reasoning_effort,
                        "temperature": emergency_triage_cfg.temperature,
                        "max_output_tokens_policy": str(emergency_triage_cfg.max_output_tokens),
                    },
                )
                raise ValueError(f"Emergency triage stage failed: {exc}") from exc
            emit("Emergency triage: artifact write start")
            _write_emergency_triage_artifact(repo_root=repo_root, content=render_emergency_triage_result_json(emergency_triage_result))
            emit("Emergency triage: artifact write end")
            if emergency_triage_result.items:
                triage_input_payload = build_triage_input_from_emergency_result(
                    semantic_payload,
                    emergency_triage_result,
                )
                triage_input_mode = "synthesized_semantic"
            else:
                emit(
                    "Emergency triage produced zero synthesized items; "
                    "falling back to raw semantic triage input."
                )
        if run_triage:
            try:
                triage_result = run_triage_stage(
                    triage_input_payload,
                    provider=providers["triage"],
                    provider_kind=pipeline.provider,
                    reasoning_effort=triage_cfg.reasoning_effort,
                    structured_mode=triage_cfg.structured_mode,
                    temperature=triage_cfg.temperature,
                    max_output_tokens_policy=triage_cfg.max_output_tokens,
                    input_mode=triage_input_mode,
                )
            except Exception as exc:
                _capture_release_stage_failure_artifact(
                    repo_root=repo_root,
                    pipeline=pipeline,
                    stage="triage",
                    provider=providers["triage"],
                    exc=exc,
                    stage_settings={
                        "structured_mode": triage_cfg.structured_mode,
                        "reasoning_effort": triage_cfg.reasoning_effort,
                        "temperature": triage_cfg.temperature,
                        "max_output_tokens_policy": str(triage_cfg.max_output_tokens),
                    },
                )
                raise ValueError(f"Triage stage failed: {exc}") from exc
            draft_input = build_triage_ir_payload(triage_result)
            source_kind = "triage"

    try:
        draft = generate_draft_from_payload(
            draft_input,
            provider=providers["draft"],
            source_kind=source_kind,
            provider_kind=pipeline.provider,
            reasoning_effort=draft_cfg.reasoning_effort,
            structured_mode=draft_cfg.structured_mode,
            temperature=draft_cfg.temperature,
            max_output_tokens_policy=draft_cfg.max_output_tokens,
        )
    except Exception as exc:
        _capture_release_stage_failure_artifact(
            repo_root=repo_root,
            pipeline=pipeline,
            stage="draft",
            provider=providers["draft"],
            exc=exc,
            stage_settings={
                "structured_mode": draft_cfg.structured_mode,
                "reasoning_effort": draft_cfg.reasoning_effort,
                "temperature": draft_cfg.temperature,
                "max_output_tokens_policy": str(draft_cfg.max_output_tokens),
                "source_kind": source_kind,
            },
        )
        raise ValueError(f"Draft stage failed: {exc}") from exc

    draft_markdown = render_draft_markdown(draft)
    release_notes_markdown: str | None = None
    if run_release_notes:
        try:
            release_notes_result = run_release_notes_stage(
                draft_markdown,
                provider=providers["release_notes"],
                provider_kind=pipeline.provider,
                reasoning_effort=release_notes_cfg.reasoning_effort,
                structured_mode=release_notes_cfg.structured_mode,
                temperature=release_notes_cfg.temperature,
                max_output_tokens_policy=release_notes_cfg.max_output_tokens,
            )
            release_notes_markdown = release_notes_result.markdown
        except Exception as exc:
            _capture_release_stage_failure_artifact(
                repo_root=repo_root,
                pipeline=pipeline,
                stage="release_notes",
                provider=providers["release_notes"],
                exc=exc,
                stage_settings={
                    "structured_mode": release_notes_cfg.structured_mode,
                    "reasoning_effort": release_notes_cfg.reasoning_effort,
                    "temperature": release_notes_cfg.temperature,
                    "max_output_tokens_policy": str(release_notes_cfg.max_output_tokens),
                },
            )
            raise ValueError(f"Release notes stage failed: {exc}") from exc

    polish_result: AIPolishResult | None = None
    if run_polish:
        try:
            polish_result = run_polish_stage(
                draft,
                provider=providers["polish"],
                provider_kind=pipeline.provider,
                reasoning_effort=polish_cfg.reasoning_effort,
                structured_mode=polish_cfg.structured_mode,
                temperature=polish_cfg.temperature,
                max_output_tokens_policy=polish_cfg.max_output_tokens,
            )
        except Exception as exc:
            _capture_release_stage_failure_artifact(
                repo_root=repo_root,
                pipeline=pipeline,
                stage="polish",
                provider=providers["polish"],
                exc=exc,
                stage_settings={
                    "structured_mode": polish_cfg.structured_mode,
                    "reasoning_effort": polish_cfg.reasoning_effort,
                    "temperature": polish_cfg.temperature,
                    "max_output_tokens_policy": str(polish_cfg.max_output_tokens),
                },
            )
            raise ValueError(f"Polish stage failed: {exc}") from exc

    if polish_result is not None:
        return render_polish_markdown(polish_result), release_notes_markdown
    return draft_markdown, release_notes_markdown


def _build_stage_providers(
    *,
    pipeline: AIPipelineConfig,
    include_emergency_triage: bool,
    include_triage: bool,
    include_polish: bool,
    include_release_notes: bool,
    local_api_key: str | None,
    logger: Callable[[str], None],
) -> dict[AIStageName, StructuredJSONProvider]:
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

    providers_by_fingerprint: dict[tuple[str, str, str | None, str | None], StructuredJSONProvider] = {}
    stage_providers: dict[AIStageName, StructuredJSONProvider] = {}

    for stage in stage_order:
        stage_cfg = pipeline.stages[stage]
        provider_cfg = AIProviderConfig(
            kind=pipeline.provider,
            model=stage_cfg.model,
            base_url=pipeline.base_url,
            api_key=local_api_key,
            timeout_seconds=_resolve_stage_provider_timeout_seconds(stage),
        )
        fingerprint = (
            provider_cfg.kind,
            provider_cfg.model,
            provider_cfg.base_url,
            provider_cfg.api_key,
            str(provider_cfg.timeout_seconds),
        )
        provider = providers_by_fingerprint.get(fingerprint)
        if provider is None:
            provider = build_structured_json_provider(provider_cfg)
            _ = run_provider_preflight(provider_cfg, provider=provider, require_model=True)
            providers_by_fingerprint[fingerprint] = provider
            endpoint = provider_cfg.base_url or "<hosted>"
            logger(
                "AI preflight OK: "
                f"provider={provider_cfg.kind}, model={provider_cfg.model}, endpoint={endpoint}"
            )
        stage_providers[stage] = provider

    return stage_providers


def _write_emergency_triage_artifact(*, repo_root: Path, content: str) -> None:
    target = (repo_root / DEFAULT_CHANGELOG_SCRATCH_DIR / "emergency_triage.json").resolve()
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    except Exception:
        return


def _capture_release_stage_failure_artifact(
    *,
    repo_root: Path,
    pipeline: AIPipelineConfig,
    stage: AIStageName,
    provider: StructuredJSONProvider,
    exc: Exception,
    stage_settings: dict[str, object],
) -> None:
    provider_evidence = collect_provider_failure_evidence(provider)
    if not provider_response_observed(provider_evidence):
        return
    provider_cfg = pipeline.provider_config_for_stage(stage)
    mode_value = stage_settings.get("structured_mode")
    if mode_value is None and isinstance(provider_evidence, dict):
        resolved = provider_evidence.get("resolved_settings")
        if isinstance(resolved, dict):
            mode_value = resolved.get("structured_mode")
    try:
        _ = write_failure_artifact(
            repo_root=repo_root,
            command="release",
            stage=stage,
            ai_profile=pipeline.profile_slug,
            provider_key=provider_cfg.kind,
            model=provider_cfg.model,
            structured_mode=str(mode_value or "unknown-mode"),
            normalized_request_settings={
                "stage": stage,
                "provider_kind": provider_cfg.kind,
                "model": provider_cfg.model,
                **stage_settings,
            },
            error=exc,
            provider_evidence=provider_evidence,
        )
    except Exception:
        return


def _resolve_stage_provider_timeout_seconds(stage: AIStageName) -> float | None:
    if stage != "emergency_triage":
        return None
    raw = os.getenv("RELEASE_AI_EMERGENCY_TRIAGE_PROVIDER_TIMEOUT_SECONDS", "45").strip()
    if not raw:
        return 45.0
    try:
        value = float(raw)
    except ValueError:
        return 45.0
    if value <= 0:
        return 45.0
    return value


def _validate_cached_context_matches(
    *,
    actual: dict[str, Any],
    expected: dict[str, Any],
    target_path: Path,
) -> None:
    if _context_fingerprint_matches(actual, expected):
        return
    expected_range = _format_context_fingerprint(expected)
    actual_range = _format_context_fingerprint(actual)
    raise ValueError(
        "cached draft is stale for the current release context. "
        f"{target_path} has {actual_range} but current context is {expected_range}."
    )


def _context_fingerprint_matches(actual: Mapping[str, Any], expected: Mapping[str, Any]) -> bool:
    for key in ("version", "previous_tag", "head_sha", "commit_count"):
        if actual.get(key) != expected.get(key):
            return False
    return True


def _format_context_fingerprint(fingerprint: Mapping[str, Any]) -> str:
    version = fingerprint.get("version") or "<unknown-version>"
    previous_tag = fingerprint.get("previous_tag") or "none"
    head_sha = fingerprint.get("head_sha") or "<unknown-head>"
    commit_count = fingerprint.get("commit_count")
    head_label = str(head_sha)[:12]
    return f"version={version}, previous_tag={previous_tag}, head={head_label}, commits={commit_count}"


def _as_sequence(raw: Any) -> list[Any]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, tuple):
        return list(raw)
    return []


def _as_dict_list(raw: Any) -> list[dict[str, Any]]:
    return [item for item in _as_sequence(raw) if isinstance(item, dict)]


def _read_string_value(raw: Any) -> str | None:
    if not isinstance(raw, str):
        return None
    normalized = raw.strip()
    return normalized or None


def _commit_summary(commit: Any) -> dict[str, Any]:
    return {
        "sha": str(getattr(commit, "sha", ""))[:12],
        "subject": str(getattr(commit, "subject", "")),
        "categories": list(getattr(commit, "categories", []) or []),
    }


def _parse_release_ai_mode(raw: str | None) -> ReleaseAIMode:
    normalized = _normalize_or_default(raw, DEFAULT_RELEASE_AI_MODE)
    if normalized not in {"auto", "openai-only", "local-only", "disabled"}:
        raise ValueError(
            "Invalid RELEASE_AI_MODE. Expected one of: auto, openai-only, local-only, disabled."
        )
    return normalized  # type: ignore[return-value]


def _parse_bool(raw: str | None, *, var_name: str, default: bool) -> bool:
    normalized = _normalize_optional_string(raw)
    if normalized is None:
        return default
    truthy = {"1", "true", "yes", "on"}
    falsy = {"0", "false", "no", "off"}
    lower = normalized.lower()
    if lower in truthy:
        return True
    if lower in falsy:
        return False
    raise ValueError(f"Invalid {var_name}: expected true/false.")


def _normalize_optional_string(raw: str | None) -> str | None:
    if raw is None:
        return None
    normalized = raw.strip()
    return normalized or None


def _normalize_or_default(raw: str | None, default: str) -> str:
    normalized = _normalize_optional_string(raw)
    return normalized if normalized is not None else default


def render_cached_draft_markdown(
    *,
    version: str,
    content: str,
    context: ReleaseContext | None = None,
    context_fingerprint: Mapping[str, Any] | None = None,
) -> str:
    cleaned = content.strip()
    if not cleaned:
        raise ValueError("Cannot render cached draft markdown: content is empty.")
    fingerprint = dict(context_fingerprint) if context_fingerprint is not None else None
    if fingerprint is None and context is not None:
        fingerprint = build_release_context_fingerprint(context)
    metadata = f"<!-- vaulthalla-release-version: {version} -->\n"
    if fingerprint is not None:
        metadata += (
            "<!-- vaulthalla-release-context: "
            f"{json.dumps(fingerprint, sort_keys=True, separators=(',', ':'))} -->\n"
        )
    return f"{metadata}{cleaned}\n"


def _detect_cached_draft_version(content: str) -> str | None:
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        match = re.fullmatch(r"<!--\s*vaulthalla-release-version:\s*([0-9]+\.[0-9]+\.[0-9]+)\s*-->", stripped)
        if match:
            return match.group(1)
        return None
    return None


def _detect_cached_draft_context(content: str) -> dict[str, Any] | None:
    for line in content.splitlines()[:8]:
        stripped = line.strip()
        if not stripped:
            continue
        match = re.fullmatch(r"<!--\s*vaulthalla-release-context:\s*(\{.*\})\s*-->", stripped)
        if not match:
            continue
        try:
            parsed = json.loads(match.group(1))
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def _strip_cached_draft_metadata(content: str) -> str:
    lines = content.splitlines()
    if not lines:
        return ""
    start_index = 0
    while start_index < len(lines):
        line = lines[start_index]
        is_version = re.fullmatch(
            r"\s*<!--\s*vaulthalla-release-version:\s*[0-9]+\.[0-9]+\.[0-9]+\s*-->\s*",
            line,
        )
        is_context = re.fullmatch(r"\s*<!--\s*vaulthalla-release-context:\s*\{.*\}\s*-->\s*", line)
        if not is_version and not is_context:
            break
        start_index += 1
    if start_index:
        body = "\n".join(lines[start_index:]).lstrip("\n")
        return f"{body}\n" if body and not body.endswith("\n") else body
    return content


def _parse_debian_top_entry(content: str, path: Path) -> _DebianTopEntry:
    lines = content.splitlines()
    if not lines:
        raise ValueError(f"Debian changelog update failed: changelog is empty: {path}")

    start_index = -1
    header_line = ""
    for idx, line in enumerate(lines):
        stripped = line.strip()
        if stripped:
            start_index = idx
            header_line = stripped
            break
    if start_index < 0:
        raise ValueError(f"Debian changelog update failed: changelog is empty: {path}")

    header_match = CHANGELOG_HEADER_PATTERN.fullmatch(header_line)
    if not header_match:
        raise ValueError(
            "Debian changelog update failed: could not parse top header "
            f"in {path}: {header_line}"
        )

    signature_index = -1
    maintainer = ""
    for idx in range(start_index + 1, len(lines)):
        match = DEBIAN_CHANGELOG_SIGNATURE_PATTERN.fullmatch(lines[idx])
        if match:
            signature_index = idx
            maintainer = match.group("maintainer").strip()
            break

    if signature_index < 0:
        raise ValueError(
            "Debian changelog update failed: missing maintainer signature line in top entry "
            f"at {path}."
        )

    if not maintainer:
        raise ValueError(
            "Debian changelog update failed: top entry maintainer signature is empty "
            f"in {path}."
        )

    end_index = signature_index + 1
    if end_index < len(lines) and lines[end_index].strip() == "":
        end_index += 1

    return _DebianTopEntry(
        package=header_match.group("package"),
        full_version=header_match.group("full_version"),
        distribution=header_match.group("distribution"),
        urgency=header_match.group("urgency"),
        maintainer=maintainer,
        start_index=start_index,
        end_index=end_index,
        lines=lines,
    )


def _resolve_debian_maintainer(existing: str, env: Mapping[str, str]) -> str:
    name = _normalize_optional_string(env.get("DEBFULLNAME"))
    email = _normalize_optional_string(env.get("DEBEMAIL"))
    if name and email:
        return f"{name} <{email}>"
    return existing


def _resolve_debian_token(
    *,
    explicit: str | None,
    env_value: str | None,
    fallback: str,
    field_name: str,
) -> str:
    value = _normalize_optional_string(explicit)
    if value is None:
        value = _normalize_optional_string(env_value)
    if value is None:
        value = fallback

    if not DEBIAN_CHANGELOG_TOKEN_PATTERN.fullmatch(value):
        raise ValueError(
            f"Debian changelog update failed: invalid {field_name} '{value}'. "
            f"Use a Debian token like 'unstable' or 'medium'."
        )
    return value


def _extract_debian_bullets(markdown: str) -> list[str]:
    bullets: list[str] = []
    code_fence_open = False

    for raw_line in markdown.splitlines():
        stripped = raw_line.strip()
        if stripped.startswith("```"):
            code_fence_open = not code_fence_open
            continue
        if code_fence_open or not stripped:
            continue

        bullet_match = re.match(r"^(?:[-*+]|\d+\.)\s+(?P<item>.+)$", stripped)
        if not bullet_match:
            continue

        normalized = _normalize_bullet_text(bullet_match.group("item"))
        if _is_low_value_debian_bullet(normalized):
            continue
        if normalized and normalized not in bullets:
            bullets.append(normalized)
        if len(bullets) >= 8:
            break

    if bullets:
        return bullets

    # Fallback for markdown with no list markers: use up to 4 meaningful lines.
    fallback: list[str] = []
    for raw_line in markdown.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue
        if stripped.startswith("#") or stripped.startswith(">") or stripped.startswith("```"):
            continue
        normalized = _normalize_bullet_text(stripped)
        if _is_low_value_debian_bullet(normalized):
            continue
        if normalized and normalized not in fallback:
            fallback.append(normalized)
        if len(fallback) >= 4:
            break

    if not fallback:
        raise ValueError(
            "Debian changelog update failed: no usable summary lines were found in generated release markdown."
        )
    return fallback


def _normalize_bullet_text(text: str) -> str:
    normalized = text.strip()
    normalized = re.sub(r"`([^`]+)`", r"\1", normalized)
    normalized = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _is_low_value_debian_bullet(text: str) -> bool:
    normalized = text.strip()
    if not normalized:
        return True
    lower = normalized.lower()

    classifier_residue_markers = (
        "important files",
        "retained snippet",
        "retained snippets",
        "evidence ref",
        "evidence refs",
        "grounded claim",
        "grounded claims",
        "priority rank",
        "signal strength",
        "category:",
        "theme:",
        "overview:",
    )
    if any(marker in lower for marker in classifier_residue_markers):
        return True
    if _DEBIAN_KIND_REF_RE.search(lower):
        return True
    if _DEBIAN_REPO_PATH_RE.search(normalized) or _DEBIAN_FILE_PATH_RE.search(normalized):
        return True
    if re.match(r"^(low-signal|meta(?:\s+only)?|formatting(?:\s+only)?)\b", lower):
        return True
    return False


def _render_debian_entry(
    *,
    package: str,
    full_version: str,
    distribution: str,
    urgency: str,
    maintainer: str,
    timestamp: str,
    bullets: list[str],
) -> str:
    lines = [
        f"{package} ({full_version}) {distribution}; urgency={urgency}",
        "",
    ]
    for bullet in bullets:
        lines.append(f"  - {bullet}")
    lines.extend(
        [
            "",
            f" -- {maintainer}  {timestamp}",
            "",
        ]
    )
    return "\n".join(lines)


def _replace_debian_top_entry(top: _DebianTopEntry, rendered_entry: str) -> str:
    lines = top.lines
    prefix_lines = lines[:top.start_index]
    suffix_lines = lines[top.end_index:]

    output_parts: list[str] = []
    if prefix_lines:
        output_parts.append("\n".join(prefix_lines).rstrip("\n"))
    output_parts.append(rendered_entry.rstrip("\n"))
    if suffix_lines:
        output_parts.append("\n".join(suffix_lines).lstrip("\n"))

    merged = "\n".join(part for part in output_parts if part)
    if not merged.endswith("\n"):
        merged += "\n"
    return merged
