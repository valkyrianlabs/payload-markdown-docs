from __future__ import annotations

import json
from typing import Any, Literal

from tools.release.changelog.ai.contracts.triage import AI_TRIAGE_SCHEMA_VERSION

TriageInputMode = Literal["raw_semantic", "synthesized_semantic"]


def build_triage_system_prompt(
    *,
    hosted_compact_mode: bool = False,
    input_mode: TriageInputMode = "raw_semantic",
) -> str:
    base = (
        "You are a deterministic release triage classifier for Vaulthalla. "
        "Use only explicit input evidence. "
        "Never invent features, fixes, behavior, impact, or categories. "
        "Do not use speculative wording: likely, suggests, appears to, may indicate, could be interpreted as. "
        "Prefer behavior-, contract-, workflow-, and operator-meaningful change descriptions over file/path narration. "
        "Treat commit subjects and semantic diff evidence as primary evidence; treat paths only as support anchors. "
        "Do not foreground historical or stale version strings from evidence unless the change is explicitly about versioning or package metadata. "
        "When a release version must be mentioned, prefer the canonical top-level release version rather than older version literals found inside evidence. "
        "Avoid repeating the same idea across multiple categories when one category can own it more cleanly. "
        "Emit caution-style notes only when evidence is weak, conflicting, or requires operator verification. "
        "Return JSON only that matches the schema."
    )
    if input_mode == "synthesized_semantic":
        base = (
            f"{base} "
            "Input evidence is pre-synthesized unit summaries with source anchors; "
            "treat those synthesized units as primary and use source anchors as support."
        )
    else:
        base = (
            f"{base} "
            "Input evidence includes raw semantic hunks and commit evidence; "
            "interpret hunk meaning directly and avoid collapsing to path-only recap."
        )
    if not hosted_compact_mode:
        return base
    return (
        f"{base} "
        "This is a compression stage: produce the smallest valid high-signal object, "
        "not a comprehensive narrative. "
        "Preserve strongest summary points, clear top-category distinctions, and claim-level evidence anchors."
    )


def build_triage_user_prompt(
    payload: dict[str, Any],
    *,
    hosted_compact_mode: bool = False,
    input_mode: TriageInputMode = "raw_semantic",
) -> str:
    payload_json = json.dumps(
        _build_compact_payload_projection(
            payload,
            hosted_compact_mode=hosted_compact_mode,
            input_mode=input_mode,
        ),
        indent=2,
        sort_keys=False,
    )
    summary_max_items = 4 if hosted_compact_mode else 8
    category_max_items = 5 if hosted_compact_mode else 10
    grounded_claims_max_items = 4 if hosted_compact_mode else 6
    evidence_refs_max_items = 2 if hosted_compact_mode else 4
    mode_requirements = (
        "- Use synthesized unit summaries (`synthesized_units`) as the primary meaning substrate.\n"
        "- Preserve source anchors (`id`, `source_*`, `evidence_refs`) only as support evidence.\n"
        "- Do not assume raw code context beyond what synthesized units and source anchors state.\n"
        if input_mode == "synthesized_semantic"
        else "- Use semantic hunk excerpts plus commit candidates (`candidate_commits`, `all_commits`) as primary evidence.\n"
    )
    payload_label = (
        "Synthesized semantic payload (compact projection)"
        if input_mode == "synthesized_semantic"
        else "Semantic payload (compact projection)"
    )
    compression_directive = (
        "- Compression mode (hosted): prefer shorter arrays and denser phrasing; avoid rationale expansion.\n"
        "- Compression mode (hosted): keep top category distinctions and strongest grounded claims.\n"
        if hosted_compact_mode
        else ""
    )
    return (
        "Build a claim-centric triage intermediate representation from the semantic release payload.\n"
        "Requirements:\n"
        "- Keep only evidence needed for downstream drafting.\n"
        "- Create a category only when at least one concrete supporting item exists.\n"
        "- Rank categories by `priority_rank` (1 is highest).\n"
        f"{mode_requirements}"
        "- Preserve major commit themes; do not collapse commit evidence to path-only summaries.\n"
        "- Prefer concrete behavior, workflow, contract, lifecycle, configuration, API, or packaging changes over generic 'surface updated' phrasing.\n"
        "- Treat file paths and evidence refs as support anchors only; do not let them dominate the output.\n"
        "- Do not paraphrase metadata, churn, counts, or file rankings; focus on concrete change meaning.\n"
        "- Do not foreground historical version literals from commit text or diff evidence unless the category is explicitly about versioning/package metadata.\n"
        "- If a category is not primarily about versioning, suppress stale version strings in `theme`, `grounded_claims`, `summary_points`, and `operator_note`.\n"
        "- When version must be mentioned, prefer the canonical release version from top-level metadata, not older literals found in evidence.\n"
        "- Avoid duplicating the same claim across multiple categories; let the strongest owning category carry it.\n"
        f"- When `summary_points` is present, keep it concise and evidence-bound (max {summary_max_items}).\n"
        f"- Keep category `grounded_claims` concise and evidence-bound (max {grounded_claims_max_items}).\n"
        "- Use category `theme` as a compact meaning-first descriptor of what changed.\n"
        f"- Use `evidence_refs` only as short support anchors (max {evidence_refs_max_items}); do not let paths dominate output.\n"
        "- Avoid path-heavy recap and file-list dumping.\n"
        "- `operator_note` is optional and should appear only when evidence is weak, conflicting, or risky.\n"
        "- No filler prose, no intro/outro text, no repetition.\n"
        f"- Keep `categories` short and discriminating (max {category_max_items}).\n"
        f"{compression_directive}"
        "- Required top-level output fields: `schema_version`, `version`, `categories`.\n"
        "- Optional top-level fields: `summary_points`, `operator_note`.\n"
        f"- Set `schema_version` exactly to `{AI_TRIAGE_SCHEMA_VERSION}`.\n"
        "- Required category fields: `name`, `signal_strength`, `priority_rank`, `theme`, `grounded_claims`.\n"
        "- Optional category fields: `evidence_refs`, `operator_note`.\n"
        "- Never emit empty placeholders in arrays (no `\"\"`, whitespace-only items, nulls, or other non-string placeholders); omit blank items.\n"
        "- Return JSON only.\n\n"
        f"{payload_label}:\n"
        f"{payload_json}"
    )


def _build_compact_payload_projection(
    payload: dict[str, Any],
    *,
    hosted_compact_mode: bool,
    input_mode: TriageInputMode,
) -> dict[str, Any]:
    if input_mode == "synthesized_semantic":
        return _build_compact_synthesized_payload_projection(payload, hosted_compact_mode=hosted_compact_mode)
    return _build_compact_raw_payload_projection(payload, hosted_compact_mode=hosted_compact_mode)


def _build_compact_raw_payload_projection(
    payload: dict[str, Any],
    *,
    hosted_compact_mode: bool,
) -> dict[str, Any]:
    categories_raw = _as_sequence(payload.get("categories"))
    notes_raw = payload.get("notes")
    release_commit_count = _read_nested_int(payload, "commit_count") or 0
    category_limit = _category_projection_limit(release_commit_count, hosted_compact_mode=hosted_compact_mode)
    notes_limit = 8 if hosted_compact_mode else 14
    key_commit_limit = _key_commit_projection_limit(release_commit_count, hosted_compact_mode=hosted_compact_mode)
    hunk_limit = _hunk_projection_limit(release_commit_count, hosted_compact_mode=hosted_compact_mode)
    files_limit = 3 if hosted_compact_mode else 6
    commit_candidate_limit = _commit_candidate_projection_limit(
        release_commit_count,
        hosted_compact_mode=hosted_compact_mode,
    )

    compact: dict[str, Any] = {
        "schema_version": payload.get("schema_version"),
        "version": _read_nested_string(payload, "version"),
        "previous_tag": _read_nested_string(payload, "previous_tag"),
        "head_sha": _read_nested_string(payload, "head_sha"),
        "commit_count": release_commit_count if release_commit_count > 0 else None,
        "categories": [],
        "all_commits": _compact_commit_candidates(
            payload.get("all_commits"),
            limit=commit_candidate_limit,
            include_body=not hosted_compact_mode,
        ),
        "notes": _normalize_string_list(notes_raw, limit=notes_limit),
    }

    categories: list[dict[str, Any]] = []
    for category in categories_raw[:category_limit]:
        if not isinstance(category, dict):
            continue
        category_commit_count = len(_as_sequence(category.get("candidate_commits")))
        category_commit_limit = _commit_candidate_projection_limit(
            category_commit_count if category_commit_count > 0 else release_commit_count,
            hosted_compact_mode=hosted_compact_mode,
        )
        categories.append(
            {
                "name": _read_nested_string(category, "name"),
                "signal_strength": _read_nested_string(category, "signal_strength"),
                "summary_hint": _truncate(_read_nested_string(category, "summary_hint"), limit=220),
                "key_commits": _normalize_string_list(category.get("key_commits"), limit=key_commit_limit),
                "candidate_commits": _compact_commit_candidates(
                    category.get("candidate_commits"),
                    limit=category_commit_limit,
                    include_body=not hosted_compact_mode,
                ),
                "semantic_hunks": _compact_semantic_hunks(
                    category.get("semantic_hunks"),
                    hosted_compact_mode=hosted_compact_mode,
                    limit=hunk_limit,
                ),
                "supporting_files": _normalize_string_list(
                    category.get("supporting_files"),
                    limit=files_limit,
                ),
            }
        )
    compact["categories"] = categories
    return compact


def _build_compact_synthesized_payload_projection(
    payload: dict[str, Any],
    *,
    hosted_compact_mode: bool,
) -> dict[str, Any]:
    categories_raw = _as_sequence(payload.get("categories"))
    notes_raw = payload.get("notes")
    release_commit_count = _read_nested_int(payload, "commit_count") or 0
    category_limit = _category_projection_limit(release_commit_count, hosted_compact_mode=hosted_compact_mode)
    notes_limit = 8 if hosted_compact_mode else 14
    key_commit_limit = _key_commit_projection_limit(release_commit_count, hosted_compact_mode=hosted_compact_mode)
    files_limit = 3 if hosted_compact_mode else 6
    commit_candidate_limit = _commit_candidate_projection_limit(
        release_commit_count,
        hosted_compact_mode=hosted_compact_mode,
    )
    unit_limit = _synthesized_unit_projection_limit(
        release_commit_count,
        hosted_compact_mode=hosted_compact_mode,
    )

    compact: dict[str, Any] = {
        "schema_version": payload.get("schema_version"),
        "version": _read_nested_string(payload, "version"),
        "previous_tag": _read_nested_string(payload, "previous_tag"),
        "head_sha": _read_nested_string(payload, "head_sha"),
        "commit_count": release_commit_count if release_commit_count > 0 else None,
        "categories": [],
        "all_commits": _compact_commit_candidates(
            payload.get("all_commits"),
            limit=commit_candidate_limit,
            include_body=not hosted_compact_mode,
        ),
        "notes": _normalize_string_list(notes_raw, limit=notes_limit),
    }

    categories: list[dict[str, Any]] = []
    for category in categories_raw[:category_limit]:
        if not isinstance(category, dict):
            continue
        category_commit_count = len(_as_sequence(category.get("candidate_commits")))
        category_commit_limit = _commit_candidate_projection_limit(
            category_commit_count if category_commit_count > 0 else release_commit_count,
            hosted_compact_mode=hosted_compact_mode,
        )
        categories.append(
            {
                "name": _read_nested_string(category, "name"),
                "signal_strength": _read_nested_string(category, "signal_strength"),
                "summary_hint": _truncate(_read_nested_string(category, "summary_hint"), limit=220),
                "key_commits": _normalize_string_list(category.get("key_commits"), limit=key_commit_limit),
                "candidate_commits": _compact_commit_candidates(
                    category.get("candidate_commits"),
                    limit=category_commit_limit,
                    include_body=not hosted_compact_mode,
                ),
                "synthesized_units": _compact_synthesized_units(
                    category.get("synthesized_units"),
                    hosted_compact_mode=hosted_compact_mode,
                    limit=unit_limit,
                ),
                "supporting_files": _normalize_string_list(
                    category.get("supporting_files"),
                    limit=files_limit,
                ),
            }
        )
    compact["categories"] = categories
    return compact


def _compact_semantic_hunks(
    raw: Any,
    *,
    hosted_compact_mode: bool,
    limit: int,
) -> list[dict[str, Any]]:
    items = _as_sequence(raw)
    compact: list[dict[str, Any]] = []
    excerpt_limit = 180 if hosted_compact_mode else 340
    for item in items:
        if not isinstance(item, dict):
            continue
        compact.append(
            {
                "kind": _read_nested_string(item, "kind"),
                "why_selected": _truncate(_read_nested_string(item, "why_selected"), limit=180),
                "excerpt": _truncate(_read_nested_string(item, "excerpt"), limit=excerpt_limit),
                "evidence_ref": _read_nested_string(item, "path"),
            }
        )
        if len(compact) >= limit:
            break
    return compact


def _compact_synthesized_units(
    raw: Any,
    *,
    hosted_compact_mode: bool,
    limit: int,
) -> list[dict[str, Any]]:
    items = _as_sequence(raw)
    compact: list[dict[str, Any]] = []
    summary_limit = 180 if hosted_compact_mode else 320
    reason_limit = 120 if hosted_compact_mode else 200
    for item in items:
        if not isinstance(item, dict):
            continue
        compact.append(
            {
                "id": _read_nested_string(item, "id"),
                "change_kind": _read_nested_string(item, "change_kind"),
                "change_summary": _truncate(_read_nested_string(item, "change_summary"), limit=summary_limit),
                "confidence": _read_nested_string(item, "confidence"),
                "insufficient_context_reason": _truncate(
                    _read_nested_string(item, "insufficient_context_reason"),
                    limit=reason_limit,
                ),
                "evidence_refs": _normalize_string_list(item.get("evidence_refs"), limit=3 if hosted_compact_mode else 5),
                "source_path": _read_nested_string(item, "source_path"),
                "source_kind": _read_nested_string(item, "source_kind"),
                "source_region_type": _read_nested_string(item, "source_region_type"),
                "source_context_label": _truncate(_read_nested_string(item, "source_context_label"), limit=140),
            }
        )
        if len(compact) >= limit:
            break
    return compact


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


def _normalize_string_list(raw: Any, *, limit: int) -> list[str]:
    items = _as_sequence(raw)
    out: list[str] = []
    for value in items:
        if not isinstance(value, str):
            continue
        trimmed = value.strip()
        if not trimmed:
            continue
        out.append(_truncate(trimmed, limit=180) or trimmed)
        if len(out) >= limit:
            break
    return out


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


def _category_projection_limit(release_commit_count: int, *, hosted_compact_mode: bool) -> int:
    if hosted_compact_mode:
        return max(8, min(20, release_commit_count + 6))
    return max(12, min(36, release_commit_count + 12))


def _key_commit_projection_limit(release_commit_count: int, *, hosted_compact_mode: bool) -> int:
    if hosted_compact_mode:
        return max(6, min(24, (release_commit_count * 2) + 4))
    return max(12, min(64, (release_commit_count * 3) + 8))


def _hunk_projection_limit(release_commit_count: int, *, hosted_compact_mode: bool) -> int:
    if hosted_compact_mode:
        return max(4, min(14, (release_commit_count // 2) + 4))
    return max(8, min(24, release_commit_count + 6))


def _synthesized_unit_projection_limit(release_commit_count: int, *, hosted_compact_mode: bool) -> int:
    if hosted_compact_mode:
        return max(6, min(18, (release_commit_count // 2) + 6))
    return max(10, min(28, release_commit_count + 10))


def _commit_candidate_projection_limit(release_commit_count: int, *, hosted_compact_mode: bool) -> int:
    if hosted_compact_mode:
        return max(24, min(220, (release_commit_count * 4) + 20))
    return max(40, min(400, (release_commit_count * 6) + 32))


def _compact_commit_candidates(
    raw: Any,
    *,
    limit: int,
    include_body: bool,
) -> list[dict[str, Any]]:
    items = _as_sequence(raw)
    compact: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        subject = _truncate(_read_nested_string(item, "subject"), limit=220)
        if not subject:
            continue
        candidate: dict[str, Any] = {
            "sha": _truncate(_read_nested_string(item, "sha"), limit=16),
            "subject": subject,
            "categories": _normalize_string_list(item.get("categories"), limit=8),
            "weight": _read_nested_string(item, "weight"),
            "weight_score": _read_nested_int(item, "weight_score"),
            "changed_files": _read_nested_int(item, "changed_files"),
            "insertions": _read_nested_int(item, "insertions"),
            "deletions": _read_nested_int(item, "deletions"),
            "sample_paths": _normalize_string_list(item.get("sample_paths"), limit=6),
        }
        if include_body:
            body = _truncate(_read_nested_string(item, "body"), limit=300)
            if body:
                candidate["body"] = body
        compact.append(candidate)
        if len(compact) >= limit:
            break
    return compact
