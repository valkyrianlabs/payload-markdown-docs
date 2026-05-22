from __future__ import annotations

from dataclasses import dataclass
from typing import Any


AI_EMERGENCY_TRIAGE_SCHEMA_VERSION = "vaulthalla.release.ai_emergency_triage.v1"
AI_EMERGENCY_TRIAGE_RESPONSE_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["schema_version", "version", "items"],
    "properties": {
        "schema_version": {"type": "string", "const": AI_EMERGENCY_TRIAGE_SCHEMA_VERSION},
        "version": {"type": "string", "minLength": 1, "maxLength": 80},
        "items": {
            "type": "array",
            "minItems": 1,
            "maxItems": 1200,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "id",
                    "category",
                    "change_kind",
                    "change_summary",
                    "confidence",
                    "insufficient_context_reason",
                    "evidence_refs",
                ],
                "properties": {
                    "id": {"type": "string", "minLength": 1, "maxLength": 120},
                    "category": {"type": "string", "minLength": 1, "maxLength": 60},
                    "change_kind": {"type": "string", "minLength": 1, "maxLength": 80},
                    "change_summary": {"type": "string", "minLength": 1, "maxLength": 360},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "insufficient_context_reason": {
                        "type": ["string", "null"],
                        "minLength": 1,
                        "maxLength": 240,
                    },
                    "evidence_refs": {
                        "type": "array",
                        "maxItems": 6,
                        "items": {"type": "string", "minLength": 1, "maxLength": 220},
                    },
                },
            },
        },
    },
}


@dataclass(frozen=True)
class AIEmergencyTriageItem:
    id: str
    category: str
    change_kind: str
    change_summary: str
    confidence: str
    insufficient_context_reason: str | None = None
    evidence_refs: tuple[str, ...] = ()


@dataclass(frozen=True)
class AIEmergencyTriageResult:
    schema_version: str
    version: str
    items: tuple[AIEmergencyTriageItem, ...]


def parse_ai_emergency_triage_response(
    data: Any,
    *,
    expected_item_ids: tuple[str, ...] | None = None,
) -> AIEmergencyTriageResult:
    if not isinstance(data, dict):
        raise ValueError("AI emergency_triage response must be a JSON object.")

    schema_version = _read_non_empty_string(data, "schema_version")
    if schema_version != AI_EMERGENCY_TRIAGE_SCHEMA_VERSION:
        raise ValueError(
            f"`schema_version` must be {AI_EMERGENCY_TRIAGE_SCHEMA_VERSION!r}, got {schema_version!r}."
        )
    version = _read_non_empty_string(data, "version")
    raw_items = data.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        raise ValueError("AI emergency_triage response must include non-empty `items` list.")

    seen_ids: set[str] = set()
    items: list[AIEmergencyTriageItem] = []
    for index, raw_item in enumerate(raw_items):
        if not isinstance(raw_item, dict):
            raise ValueError(f"AI emergency_triage item at index {index} must be an object.")

        path = f"items[{index}]"
        item_id = _read_non_empty_string(raw_item, "id", path=path)
        if item_id in seen_ids:
            raise ValueError(f"Duplicate emergency_triage item id `{item_id}` is not allowed.")
        seen_ids.add(item_id)

        category = _read_non_empty_string(raw_item, "category", path=path)
        change_kind = _read_non_empty_string(raw_item, "change_kind", path=path)
        change_summary = _read_non_empty_string(raw_item, "change_summary", path=path)
        confidence = _read_non_empty_string(raw_item, "confidence", path=path).lower()
        if confidence not in {"high", "medium", "low"}:
            raise ValueError(f"`{path}.confidence` must be one of high|medium|low.")

        items.append(
            AIEmergencyTriageItem(
                id=item_id,
                category=category,
                change_kind=change_kind,
                change_summary=change_summary,
                confidence=confidence,
                insufficient_context_reason=_read_optional_non_empty_string(
                    raw_item,
                    "insufficient_context_reason",
                    path=path,
                ),
                evidence_refs=tuple(_read_non_empty_string_list(raw_item, "evidence_refs", path=path)),
            )
        )

    if expected_item_ids is not None:
        expected = tuple(item for item in expected_item_ids if item.strip())
        if not expected:
            raise ValueError("Emergency triage expected id set must be non-empty.")
        expected_set = set(expected)
        parsed_set = {item.id for item in items}
        missing = [item for item in expected if item not in parsed_set]
        unexpected = sorted(parsed_set - expected_set)
        if missing or unexpected:
            fragments: list[str] = []
            if missing:
                fragments.append(f"missing ids: {', '.join(missing[:12])}")
            if unexpected:
                fragments.append(f"unexpected ids: {', '.join(unexpected[:12])}")
            raise ValueError(
                "AI emergency_triage response must preserve 1:1 item identity. " + "; ".join(fragments)
            )
        by_id = {item.id: item for item in items}
        items = [by_id[item_id] for item_id in expected]

    return AIEmergencyTriageResult(
        schema_version=schema_version,
        version=version,
        items=tuple(items),
    )


def ai_emergency_triage_result_to_dict(result: AIEmergencyTriageResult) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "schema_version": result.schema_version,
        "version": result.version,
        "items": [
            {
                "id": item.id,
                "category": item.category,
                "change_kind": item.change_kind,
                "change_summary": item.change_summary,
                "confidence": item.confidence,
            }
            for item in result.items
        ],
    }
    for index, item in enumerate(result.items):
        if item.insufficient_context_reason:
            payload["items"][index]["insufficient_context_reason"] = item.insufficient_context_reason
        if item.evidence_refs:
            payload["items"][index]["evidence_refs"] = list(item.evidence_refs)
    return payload


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
    if not isinstance(value, str) or not value.strip():
        _ = path
        return None
    return value.strip()


def _read_non_empty_string_list(
    obj: dict[str, Any],
    key: str,
    *,
    path: str | None = None,
) -> list[str]:
    raw = obj.get(key)
    if raw is None:
        return []
    prefix = f"{path}." if path else ""
    if not isinstance(raw, list):
        raise ValueError(f"`{prefix}{key}` must be a list of strings.")
    normalized: list[str] = []
    for index, value in enumerate(raw):
        if not isinstance(value, str):
            raise ValueError(f"`{prefix}{key}[{index}]` must be a non-empty string.")
        trimmed = value.strip()
        if not trimmed:
            continue
        normalized.append(trimmed)
    return normalized
