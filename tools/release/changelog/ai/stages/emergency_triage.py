from __future__ import annotations

import json
from copy import deepcopy
import os
import re
import sys
import time
from typing import Any, Callable

from tools.release.changelog.ai.config import (
    AIMaxOutputTokensPolicy,
    AIProviderKind,
    AIReasoningEffort,
    AIStructuredMode,
    DEFAULT_AI_EMERGENCY_TRIAGE_MODEL,
    DEFAULT_STAGE_MAX_OUTPUT_TOKENS,
    compute_max_output_tokens,
    estimate_input_size_units,
)
from tools.release.changelog.ai.contracts.emergency_triage import (
    AI_EMERGENCY_TRIAGE_RESPONSE_JSON_SCHEMA,
    AI_EMERGENCY_TRIAGE_SCHEMA_VERSION,
    AIEmergencyTriageResult,
    ai_emergency_triage_result_to_dict,
    parse_ai_emergency_triage_response,
)
from tools.release.changelog.ai.prompts.emergency_triage import (
    build_emergency_triage_system_prompt,
    build_emergency_triage_user_prompt,
)
from tools.release.changelog.ai.providers.base import StructuredJSONProvider
from tools.release.changelog.ai.providers.openai import OpenAIProvider

AI_TRIAGE_SYNTHESIZED_INPUT_SCHEMA_VERSION = "vaulthalla.release.triage_input.synthesized.v1"
_ID_SLUG_RE = re.compile(r"[^a-z0-9]+")
# Keep emergency triage bounded while avoiding oversized single-call payloads.
_EMERGENCY_TRIAGE_BATCH_SIZE = 6
_EMERGENCY_TRIAGE_NO_PROGRESS_TIMEOUT_SECONDS = float(
    os.getenv(
        "RELEASE_AI_EMERGENCY_TRIAGE_NO_PROGRESS_TIMEOUT_SECONDS",
        os.getenv("RELEASE_AI_EMERGENCY_TRIAGE_STAGE_TIMEOUT_SECONDS", "180"),
    )
)
_EMERGENCY_TRIAGE_PROGRESS_ENABLED = (
    os.getenv("RELEASE_AI_EMERGENCY_TRIAGE_PROGRESS", "1").strip().lower() not in {"0", "false", "no", "off"}
)


def run_emergency_triage_stage(
    semantic_payload: dict[str, Any],
    *,
    model: str | None = None,
    provider: StructuredJSONProvider | None = None,
    provider_kind: AIProviderKind = "openai",
    reasoning_effort: AIReasoningEffort | None = None,
    structured_mode: AIStructuredMode | None = None,
    temperature: float | None = None,
    max_output_tokens_policy: AIMaxOutputTokensPolicy | None = None,
    progress_logger: Callable[[str], None] | None = None,
) -> AIEmergencyTriageResult:
    last_progress_at = time.monotonic()
    active_provider = provider or OpenAIProvider(
        model=model or DEFAULT_AI_EMERGENCY_TRIAGE_MODEL,
        provider_kind=provider_kind
    )
    _emit_progress(progress_logger, "emergency_triage: batch construction start")
    projection = build_emergency_triage_input_payload(semantic_payload)
    expected_item_ids = tuple(_read_nested_string(item, "id") or "" for item in _as_sequence(projection.get("items")))
    expected_item_ids = tuple(item_id for item_id in expected_item_ids if item_id)
    payload_version = _read_nested_string(semantic_payload, "version") or _read_nested_string(projection, "version") or ""
    _emit_progress(
        progress_logger,
        "emergency_triage: batch construction end "
        f"(items={len(expected_item_ids)}, batch_size={_EMERGENCY_TRIAGE_BATCH_SIZE})",
    )
    if not expected_item_ids:
        return AIEmergencyTriageResult(
            schema_version=AI_EMERGENCY_TRIAGE_SCHEMA_VERSION,
            version=payload_version or "unknown",
            items=(),
        )

    system_prompt = build_emergency_triage_system_prompt()
    policy = max_output_tokens_policy or DEFAULT_STAGE_MAX_OUTPUT_TOKENS["emergency_triage"]
    collected_items: list[Any] = []
    resolved_version = payload_version or None

    all_items = _as_sequence(projection.get("items"))
    total_batches = (len(all_items) + _EMERGENCY_TRIAGE_BATCH_SIZE - 1) // _EMERGENCY_TRIAGE_BATCH_SIZE
    _emit_progress(progress_logger, f"emergency_triage: batch loop start (total_batches={total_batches})")

    for batch_index, start in enumerate(range(0, len(all_items), _EMERGENCY_TRIAGE_BATCH_SIZE), start=1):
        stalled_for = time.monotonic() - last_progress_at
        if (
            _EMERGENCY_TRIAGE_NO_PROGRESS_TIMEOUT_SECONDS > 0
            and stalled_for > _EMERGENCY_TRIAGE_NO_PROGRESS_TIMEOUT_SECONDS
        ):
            raise TimeoutError(
                "Emergency triage timed out due to no forward progress before dispatching next batch "
                f"(stalled_for={stalled_for:.1f}s, timeout={_EMERGENCY_TRIAGE_NO_PROGRESS_TIMEOUT_SECONDS:.1f}s, "
                f"batch={batch_index}/{total_batches})."
            )
        batch_items = all_items[start : start + _EMERGENCY_TRIAGE_BATCH_SIZE]
        batch_payload = _build_emergency_triage_batch_payload(projection, batch_items=batch_items)
        # Batch identity source of truth: expected ids are read from the exact payload
        # object serialized into this request, not from a parallel slice/view.
        batch_expected_ids = tuple(
            item_id
            for item_id in (
                _read_nested_string(item, "id") or "" for item in _as_sequence(batch_payload.get("items"))
            )
            if item_id
        )
        if not batch_expected_ids:
            continue
        _emit_progress(
            progress_logger,
            f"emergency_triage: batch {batch_index}/{total_batches} dispatch start "
            f"(ids={','.join(batch_expected_ids)}, count={len(batch_expected_ids)})",
        )
        batch_schema = _build_emergency_triage_batch_response_schema(expected_item_ids=batch_expected_ids)
        user_prompt = build_emergency_triage_user_prompt(batch_payload)
        max_output_tokens = compute_max_output_tokens(
            policy,
            input_size=estimate_input_size_units(system_prompt, user_prompt),
        )
        provider_started = time.monotonic()
        structured = active_provider.generate_structured_json(
            stage="emergency_triage",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=batch_schema,
            reasoning_effort=reasoning_effort,
            structured_mode=structured_mode,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
        )
        provider_elapsed = time.monotonic() - provider_started
        _emit_progress(
            progress_logger,
            f"emergency_triage: batch {batch_index}/{total_batches} provider call end "
            f"(elapsed={provider_elapsed:.2f}s)",
        )
        _emit_provider_mode_progress(active_provider, progress_logger, batch_index=batch_index, total_batches=total_batches)
        _emit_progress(progress_logger, f"emergency_triage: batch {batch_index}/{total_batches} parse start")
        parsed_batch = parse_ai_emergency_triage_response(
            structured,
            expected_item_ids=batch_expected_ids,
        )
        _emit_progress(progress_logger, f"emergency_triage: batch {batch_index}/{total_batches} parse end")
        if payload_version and parsed_batch.version != payload_version:
            raise ValueError(
                "AI emergency_triage response version mismatch: "
                f"expected `{payload_version}`, got `{parsed_batch.version}`."
            )
        if resolved_version is None:
            resolved_version = parsed_batch.version
        _emit_progress(
            progress_logger,
            f"emergency_triage: batch {batch_index}/{total_batches} aggregation start "
            f"(batch_items={len(parsed_batch.items)}, total_before={len(collected_items)})",
        )
        collected_items.extend(parsed_batch.items)
        last_progress_at = time.monotonic()
        _emit_progress(
            progress_logger,
            f"emergency_triage: batch {batch_index}/{total_batches} aggregation end "
            f"(total_after={len(collected_items)})",
        )

    _emit_progress(progress_logger, "emergency_triage: batch loop end")
    return AIEmergencyTriageResult(
        schema_version=AI_EMERGENCY_TRIAGE_SCHEMA_VERSION,
        version=resolved_version or "unknown",
        items=tuple(collected_items),
    )


def render_emergency_triage_result_json(result: AIEmergencyTriageResult) -> str:
    return json.dumps(ai_emergency_triage_result_to_dict(result), indent=2, sort_keys=False) + "\n"


def build_emergency_triage_input_payload(semantic_payload: dict[str, Any]) -> dict[str, Any]:
    categories: list[dict[str, Any]] = []
    items: list[dict[str, Any]] = []

    for category in _as_sequence(semantic_payload.get("categories")):
        if not isinstance(category, dict):
            continue
        category_name = _read_nested_string(category, "name")
        if not category_name:
            continue

        categories.append(
            {
                "name": category_name,
                "signal_strength": _read_nested_string(category, "signal_strength"),
                "summary_hint": _truncate(_read_nested_string(category, "summary_hint"), limit=260),
                "key_commits": _normalize_string_list(category.get("key_commits"), limit=10, max_chars=220),
                "candidate_commits": _compact_candidate_commits(
                    category.get("candidate_commits"),
                    limit=14,
                ),
                "supporting_files": _normalize_string_list(category.get("supporting_files"), limit=8, max_chars=240),
            }
        )

        for index, hunk in enumerate(_as_sequence(category.get("semantic_hunks"))):
            if not isinstance(hunk, dict):
                continue
            evidence_id = build_semantic_evidence_unit_id(category_name, index)
            items.append(
                {
                    "id": evidence_id,
                    "category": category_name,
                    "kind": _read_nested_string(hunk, "kind"),
                    "path": _read_nested_string(hunk, "path"),
                    "region_type": _read_nested_string(hunk, "region_type"),
                    "context_label": _truncate(_read_nested_string(hunk, "context_label"), limit=180),
                    "why_selected": _truncate(_read_nested_string(hunk, "why_selected"), limit=260),
                    "excerpt": _truncate(_read_nested_string(hunk, "excerpt"), limit=2200),
                }
            )

    return {
        "schema_version": semantic_payload.get("schema_version"),
        "version": _read_nested_string(semantic_payload, "version"),
        "previous_tag": _read_nested_string(semantic_payload, "previous_tag"),
        "head_sha": _read_nested_string(semantic_payload, "head_sha"),
        "commit_count": _read_nested_int(semantic_payload, "commit_count"),
        "categories": categories,
        "items": items,
        "all_commits": _compact_candidate_commits(semantic_payload.get("all_commits"), limit=64),
        "notes": _normalize_string_list(semantic_payload.get("notes"), limit=20, max_chars=220),
    }


def _build_emergency_triage_batch_payload(
    projection: dict[str, Any],
    *,
    batch_items: list[Any],
) -> dict[str, Any]:
    category_names: list[str] = []
    for item in batch_items:
        name = _read_nested_string(item, "category")
        if not name or name in category_names:
            continue
        category_names.append(name)

    category_lookup: dict[str, dict[str, Any]] = {}
    for raw_category in _as_sequence(projection.get("categories")):
        if not isinstance(raw_category, dict):
            continue
        name = _read_nested_string(raw_category, "name")
        if not name:
            continue
        category_lookup[name] = raw_category

    scoped_categories: list[dict[str, Any]] = []
    for name in category_names:
        category = category_lookup.get(name)
        if category is not None:
            scoped_categories.append(category)

    return {
        "schema_version": projection.get("schema_version"),
        "version": _read_nested_string(projection, "version"),
        "previous_tag": _read_nested_string(projection, "previous_tag"),
        "head_sha": _read_nested_string(projection, "head_sha"),
        "commit_count": _read_nested_int(projection, "commit_count"),
        "categories": scoped_categories,
        "items": list(batch_items),
    }


def _build_emergency_triage_batch_response_schema(
    *,
    expected_item_ids: tuple[str, ...],
) -> dict[str, Any]:
    schema = deepcopy(AI_EMERGENCY_TRIAGE_RESPONSE_JSON_SCHEMA)
    if not expected_item_ids:
        return schema
    items_schema = schema["properties"]["items"]
    items_schema["minItems"] = len(expected_item_ids)
    items_schema["maxItems"] = len(expected_item_ids)
    item_schema = items_schema["items"]
    item_schema["properties"]["id"] = {
        "type": "string",
        "enum": list(expected_item_ids),
    }
    return schema


def build_triage_input_from_emergency_result(
    semantic_payload: dict[str, Any],
    emergency_result: AIEmergencyTriageResult,
) -> dict[str, Any]:
    source_units = _build_source_unit_lookup(semantic_payload)
    output_units_by_category: dict[str, list[dict[str, Any]]] = {}
    for item in emergency_result.items:
        source = source_units.get(item.id, {})
        unit_payload: dict[str, Any] = {
            "id": item.id,
            "change_kind": item.change_kind,
            "change_summary": item.change_summary,
            "confidence": item.confidence,
            "source_path": source.get("path"),
            "source_kind": source.get("kind"),
            "source_region_type": source.get("region_type"),
            "source_context_label": source.get("context_label"),
            "source_why_selected": source.get("why_selected"),
        }
        if item.insufficient_context_reason:
            unit_payload["insufficient_context_reason"] = item.insufficient_context_reason
        if item.evidence_refs:
            unit_payload["evidence_refs"] = list(item.evidence_refs)
        output_units_by_category.setdefault(item.category, []).append(unit_payload)

    categories: list[dict[str, Any]] = []
    for category in _as_sequence(semantic_payload.get("categories")):
        if not isinstance(category, dict):
            continue
        name = _read_nested_string(category, "name")
        if not name:
            continue
        categories.append(
            {
                "name": name,
                "signal_strength": _read_nested_string(category, "signal_strength"),
                "summary_hint": _read_nested_string(category, "summary_hint"),
                "key_commits": _as_sequence(category.get("key_commits")),
                "candidate_commits": _as_sequence(category.get("candidate_commits")),
                "supporting_files": _as_sequence(category.get("supporting_files")),
                "synthesized_units": output_units_by_category.get(name, []),
            }
        )

    return {
        "schema_version": AI_TRIAGE_SYNTHESIZED_INPUT_SCHEMA_VERSION,
        "version": emergency_result.version or _read_nested_string(semantic_payload, "version"),
        "previous_tag": _read_nested_string(semantic_payload, "previous_tag"),
        "head_sha": _read_nested_string(semantic_payload, "head_sha"),
        "commit_count": _read_nested_int(semantic_payload, "commit_count"),
        "categories": categories,
        "all_commits": _as_sequence(semantic_payload.get("all_commits")),
        "notes": _as_sequence(semantic_payload.get("notes")),
    }


def build_semantic_evidence_unit_id(category_name: str, category_index: int) -> str:
    slug = _ID_SLUG_RE.sub("-", category_name.strip().lower()).strip("-")
    if not slug:
        slug = "category"
    return f"{slug}:{category_index + 1}"


def _build_source_unit_lookup(semantic_payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for category in _as_sequence(semantic_payload.get("categories")):
        if not isinstance(category, dict):
            continue
        name = _read_nested_string(category, "name")
        if not name:
            continue
        for index, hunk in enumerate(_as_sequence(category.get("semantic_hunks"))):
            if not isinstance(hunk, dict):
                continue
            evidence_id = build_semantic_evidence_unit_id(name, index)
            lookup[evidence_id] = {
                "path": _read_nested_string(hunk, "path"),
                "kind": _read_nested_string(hunk, "kind"),
                "region_type": _read_nested_string(hunk, "region_type"),
                "context_label": _read_nested_string(hunk, "context_label"),
                "why_selected": _read_nested_string(hunk, "why_selected"),
            }
    return lookup


def _compact_candidate_commits(raw: Any, *, limit: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in _as_sequence(raw):
        if not isinstance(item, dict):
            continue
        subject = _read_nested_string(item, "subject")
        if not subject:
            continue
        candidate: dict[str, Any] = {
            "sha": _truncate(_read_nested_string(item, "sha"), limit=16),
            "subject": _truncate(subject, limit=240),
            "categories": _normalize_string_list(item.get("categories"), limit=8, max_chars=60),
            "weight": _read_nested_string(item, "weight"),
            "weight_score": _read_nested_int(item, "weight_score"),
            "changed_files": _read_nested_int(item, "changed_files"),
            "insertions": _read_nested_int(item, "insertions"),
            "deletions": _read_nested_int(item, "deletions"),
            "sample_paths": _normalize_string_list(item.get("sample_paths"), limit=6, max_chars=200),
        }
        body = _read_nested_string(item, "body")
        if body:
            candidate["body"] = _truncate(body, limit=360)
        out.append(candidate)
        if len(out) >= limit:
            break
    return out


def _normalize_string_list(raw: Any, *, limit: int, max_chars: int) -> list[str]:
    out: list[str] = []
    for item in _as_sequence(raw):
        if not isinstance(item, str):
            continue
        cleaned = item.strip()
        if not cleaned:
            continue
        out.append(_truncate(cleaned, limit=max_chars) or cleaned)
        if len(out) >= limit:
            break
    return out


def _read_nested_string(obj: Any, key: str) -> str | None:
    if not isinstance(obj, dict):
        return None
    value = obj.get(key)
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


def _read_nested_int(obj: Any, key: str) -> int | None:
    if not isinstance(obj, dict):
        return None
    value = obj.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def _truncate(value: str | None, *, limit: int) -> str | None:
    if value is None:
        return None
    if len(value) <= limit:
        return value
    return value[: limit - 3].rstrip() + "..."


def _as_sequence(raw: Any) -> list[Any]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, tuple):
        return list(raw)
    return []


def _emit_progress(logger: Callable[[str], None] | None, message: str) -> None:
    if logger is not None:
        logger(message)
        return
    if _EMERGENCY_TRIAGE_PROGRESS_ENABLED:
        print(message, file=sys.stderr, flush=True)


def _emit_provider_mode_progress(
    provider: StructuredJSONProvider,
    logger: Callable[[str], None] | None,
    *,
    batch_index: int,
    total_batches: int,
) -> None:
    snapshot = getattr(provider, "failure_evidence_snapshot", None)
    if not callable(snapshot):
        return
    value = snapshot()
    if not isinstance(value, dict):
        return
    mode_chain_raw = value.get("mode_chain")
    successful_mode = value.get("successful_mode")
    if isinstance(mode_chain_raw, list):
        mode_chain = [mode for mode in mode_chain_raw if isinstance(mode, str)]
    else:
        mode_chain = []
    if mode_chain:
        _emit_progress(
            logger,
            f"emergency_triage: batch {batch_index}/{total_batches} provider attempts end "
            f"(mode_chain={' -> '.join(mode_chain)}, successful_mode={successful_mode})",
        )
        if isinstance(successful_mode, str) and successful_mode and successful_mode != mode_chain[0]:
            _emit_progress(
                logger,
                f"emergency_triage: batch {batch_index}/{total_batches} fallback transition "
                f"{mode_chain[0]} -> {successful_mode}",
            )
