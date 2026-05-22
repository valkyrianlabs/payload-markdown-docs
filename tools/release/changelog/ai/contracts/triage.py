from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from tools.release.changelog.ai.config import AIProviderKind

AI_TRIAGE_SCHEMA_VERSION = "vaulthalla.release.ai_triage.v2"
_OPTIONAL_CATEGORY_STRING_ARRAY_FIELDS = ("evidence_refs",)
_OPTIONAL_CATEGORY_STRING_FIELDS = ("operator_note",)
_OPTIONAL_TOP_LEVEL_STRING_FIELDS = ("operator_note",)


@dataclass(frozen=True)
class _TriageSchemaLimits:
    version_max_length: int
    summary_points_max_items: int
    summary_point_max_length: int
    categories_max_items: int
    category_name_max_length: int
    priority_rank_maximum: int
    theme_max_length: int
    grounded_claims_max_items: int
    grounded_claim_max_length: int
    evidence_refs_max_items: int
    evidence_ref_max_length: int
    operator_note_max_length: int


_DEFAULT_TRIAGE_SCHEMA_LIMITS = _TriageSchemaLimits(
    version_max_length=80,
    summary_points_max_items=8,
    summary_point_max_length=260,
    categories_max_items=10,
    category_name_max_length=60,
    priority_rank_maximum=20,
    theme_max_length=280,
    grounded_claims_max_items=6,
    grounded_claim_max_length=260,
    evidence_refs_max_items=4,
    evidence_ref_max_length=220,
    operator_note_max_length=260,
)

_HOSTED_COMPACT_TRIAGE_SCHEMA_LIMITS = _TriageSchemaLimits(
    version_max_length=40,
    summary_points_max_items=4,
    summary_point_max_length=180,
    categories_max_items=5,
    category_name_max_length=50,
    priority_rank_maximum=12,
    theme_max_length=200,
    grounded_claims_max_items=4,
    grounded_claim_max_length=180,
    evidence_refs_max_items=2,
    evidence_ref_max_length=180,
    operator_note_max_length=180,
)


def _build_triage_response_json_schema(limits: _TriageSchemaLimits) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "schema_version",
            "version",
            "categories",
        ],
        "properties": {
            "schema_version": {"type": "string", "const": AI_TRIAGE_SCHEMA_VERSION},
            "version": {"type": "string", "minLength": 1, "maxLength": limits.version_max_length},
            "summary_points": {
                "type": "array",
                "minItems": 1,
                "maxItems": limits.summary_points_max_items,
                "items": {"type": "string", "minLength": 1, "maxLength": limits.summary_point_max_length},
            },
            "categories": {
                "type": "array",
                "minItems": 1,
                "maxItems": limits.categories_max_items,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "name",
                        "signal_strength",
                        "priority_rank",
                        "theme",
                        "grounded_claims",
                    ],
                    "properties": {
                        "name": {"type": "string", "minLength": 1, "maxLength": limits.category_name_max_length},
                        "signal_strength": {"type": "string", "enum": ["strong", "moderate", "weak"]},
                        "priority_rank": {"type": "integer", "minimum": 1, "maximum": limits.priority_rank_maximum},
                        "theme": {"type": "string", "minLength": 1, "maxLength": limits.theme_max_length},
                        "grounded_claims": {
                            "type": "array",
                            "minItems": 1,
                            "maxItems": limits.grounded_claims_max_items,
                            "items": {"type": "string", "minLength": 1, "maxLength": limits.grounded_claim_max_length},
                        },
                        "evidence_refs": {
                            "type": "array",
                            "maxItems": limits.evidence_refs_max_items,
                            "items": {"type": "string", "minLength": 1, "maxLength": limits.evidence_ref_max_length},
                        },
                        "operator_note": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": limits.operator_note_max_length,
                        },
                    },
                },
            },
            "operator_note": {
                "type": "string",
                "minLength": 1,
                "maxLength": limits.operator_note_max_length,
            },
        },
    }


AI_TRIAGE_RESPONSE_JSON_SCHEMA: dict[str, Any] = _build_triage_response_json_schema(
    _DEFAULT_TRIAGE_SCHEMA_LIMITS
)
AI_TRIAGE_HOSTED_COMPACT_RESPONSE_JSON_SCHEMA: dict[str, Any] = _build_triage_response_json_schema(
    _HOSTED_COMPACT_TRIAGE_SCHEMA_LIMITS
)


def resolve_triage_response_json_schema(
    *,
    provider_kind: AIProviderKind,
    model: str | None,
) -> dict[str, Any]:
    if provider_kind == "openai" and isinstance(model, str) and model.strip().lower().startswith("gpt-5"):
        return AI_TRIAGE_HOSTED_COMPACT_RESPONSE_JSON_SCHEMA
    return AI_TRIAGE_RESPONSE_JSON_SCHEMA


@dataclass(frozen=True)
class AITriageCategory:
    name: str
    signal_strength: str
    priority_rank: int
    theme: str
    grounded_claims: tuple[str, ...]
    evidence_refs: tuple[str, ...] = ()
    operator_note: str | None = None


@dataclass(frozen=True)
class AITriageResult:
    schema_version: str
    version: str
    summary_points: tuple[str, ...]
    categories: tuple[AITriageCategory, ...]
    operator_note: str | None = None


def parse_ai_triage_response(data: Any) -> AITriageResult:
    if not isinstance(data, dict):
        raise ValueError("AI triage response must be a JSON object.")
    normalized_data = _normalize_optional_fields(data)

    schema_version = _read_non_empty_string(normalized_data, "schema_version")
    if schema_version != AI_TRIAGE_SCHEMA_VERSION:
        raise ValueError(
            f"`schema_version` must be {AI_TRIAGE_SCHEMA_VERSION!r}, got {schema_version!r}."
        )

    version = _read_non_empty_string(normalized_data, "version")
    summary_points = _read_non_empty_string_list(normalized_data, "summary_points")
    categories_raw = normalized_data.get("categories")
    if not isinstance(categories_raw, list) or not categories_raw:
        raise ValueError("AI triage response must include non-empty `categories` list.")

    seen_names: set[str] = set()
    seen_ranks: set[int] = set()
    categories: list[AITriageCategory] = []
    for index, category_raw in enumerate(categories_raw):
        if not isinstance(category_raw, dict):
            raise ValueError(f"AI triage category at index {index} must be an object.")

        path = f"categories[{index}]"
        name = _read_non_empty_string(category_raw, "name", path=path)
        if name in seen_names:
            raise ValueError(f"Duplicate triage category name `{name}` is not allowed.")
        seen_names.add(name)

        signal_strength = _read_non_empty_string(category_raw, "signal_strength", path=path)
        if signal_strength not in {"strong", "moderate", "weak"}:
            raise ValueError(
                f"`{path}.signal_strength` must be one of strong|moderate|weak."
            )

        priority_rank_raw = category_raw.get("priority_rank")
        if not isinstance(priority_rank_raw, int) or priority_rank_raw < 1:
            raise ValueError(f"`{path}.priority_rank` must be an integer >= 1.")
        if priority_rank_raw in seen_ranks:
            raise ValueError(f"Duplicate triage priority rank `{priority_rank_raw}` is not allowed.")
        seen_ranks.add(priority_rank_raw)

        theme = _read_non_empty_string(category_raw, "theme", path=path)
        grounded_claims = _read_non_empty_string_list(category_raw, "grounded_claims", path=path, required=True)
        evidence_refs = _read_non_empty_string_list(category_raw, "evidence_refs", path=path)
        operator_note = _read_optional_non_empty_string(category_raw, "operator_note", path=path)

        categories.append(
            AITriageCategory(
                name=name,
                signal_strength=signal_strength,
                priority_rank=priority_rank_raw,
                theme=theme,
                grounded_claims=tuple(grounded_claims),
                evidence_refs=tuple(evidence_refs),
                operator_note=operator_note,
            )
        )

    categories.sort(key=lambda item: item.priority_rank)
    return AITriageResult(
        schema_version=schema_version,
        version=version,
        summary_points=tuple(summary_points),
        categories=tuple(categories),
        operator_note=_read_optional_non_empty_string(normalized_data, "operator_note"),
    )


def ai_triage_result_to_dict(result: AITriageResult) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "schema_version": result.schema_version,
        "version": result.version,
        "summary_points": list(result.summary_points),
        "categories": [
            {
                "name": category.name,
                "signal_strength": category.signal_strength,
                "priority_rank": category.priority_rank,
                "theme": category.theme,
                "grounded_claims": list(category.grounded_claims),
            }
            for category in result.categories
        ],
    }
    for index, category in enumerate(result.categories):
        if category.evidence_refs:
            payload["categories"][index]["evidence_refs"] = list(category.evidence_refs)
        if category.operator_note:
            payload["categories"][index]["operator_note"] = category.operator_note
    if result.operator_note:
        payload["operator_note"] = result.operator_note
    return payload


def build_triage_ir_payload(result: AITriageResult) -> dict[str, Any]:
    """Return compact, deterministic draft-input representation from triage result."""
    return ai_triage_result_to_dict(result)


def _read_non_empty_string(obj: dict[str, Any], key: str, path: str | None = None) -> str:
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip():
        prefix = f"{path}." if path else ""
        raise ValueError(f"`{prefix}{key}` must be a non-empty string.")
    return value.strip()


def _read_optional_non_empty_string(
    obj: dict[str, Any],
    key: str,
    *,
    path: str | None = None,
) -> str | None:
    value = obj.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    _ = path
    return trimmed


def _read_non_empty_string_list(
    obj: dict[str, Any],
    key: str,
    *,
    path: str | None = None,
    required: bool = False,
) -> list[str]:
    raw = obj.get(key)
    prefix = f"{path}." if path else ""

    if raw is None:
        if required:
            raise ValueError(f"`{prefix}{key}` must be a non-empty list of strings.")
        return []
    if not isinstance(raw, list):
        raise ValueError(f"`{prefix}{key}` must be a list of strings.")
    if required and not raw:
        raise ValueError(f"`{prefix}{key}` must be a non-empty list of strings.")

    normalized: list[str] = []
    for index, value in enumerate(raw):
        if not isinstance(value, str):
            raise ValueError(f"`{prefix}{key}[{index}]` must be a non-empty string.")
        trimmed = value.strip()
        if not trimmed:
            if required:
                raise ValueError(f"`{prefix}{key}[{index}]` must be a non-empty string.")
            continue
        normalized.append(trimmed)
    if required and not normalized:
        raise ValueError(f"`{prefix}{key}` must be a non-empty list of strings.")
    return normalized


def _normalize_optional_fields(data: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = dict(data)
    for field in _OPTIONAL_TOP_LEVEL_STRING_FIELDS:
        if field in normalized:
            normalized[field] = _normalize_optional_string_value(normalized[field])

    categories_raw = normalized.get("categories")
    if isinstance(categories_raw, list):
        normalized_categories: list[Any] = []
        for category_raw in categories_raw:
            if not isinstance(category_raw, dict):
                normalized_categories.append(category_raw)
                continue
            category = dict(category_raw)
            for field in _OPTIONAL_CATEGORY_STRING_ARRAY_FIELDS:
                if field in category:
                    category[field] = _normalize_optional_string_array_value(category[field])
            for field in _OPTIONAL_CATEGORY_STRING_FIELDS:
                if field in category:
                    category[field] = _normalize_optional_string_value(category[field])
            normalized_categories.append(category)
        normalized["categories"] = normalized_categories
    return normalized


def _normalize_optional_string_array_value(raw: Any) -> Any:
    if raw is None:
        return []
    if not isinstance(raw, list):
        return raw
    normalized: list[str] = []
    for value in raw:
        if not isinstance(value, str):
            # Optional arrays can contain local-model placeholders; drop non-string entries.
            continue
        trimmed = value.strip()
        if trimmed:
            normalized.append(trimmed)
    return normalized


def _normalize_optional_string_value(raw: Any) -> Any:
    if raw is None:
        return None
    if not isinstance(raw, str):
        return None
    trimmed = raw.strip()
    return trimmed or None
