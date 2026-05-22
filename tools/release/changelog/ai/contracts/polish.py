from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from tools.release.changelog.ai.contracts.draft import AIDraftResult, ai_draft_result_to_dict


AI_POLISH_SCHEMA_VERSION = "vaulthalla.release.ai_polish.v1"

AI_POLISH_RESPONSE_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["schema_version", "title", "summary", "sections", "notes"],
    "properties": {
        "schema_version": {"type": "string", "const": AI_POLISH_SCHEMA_VERSION},
        "title": {"type": "string", "minLength": 1, "maxLength": 140},
        "summary": {"type": "string", "minLength": 1, "maxLength": 1600},
        "sections": {
            "type": "array",
            "minItems": 1,
            "maxItems": 12,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["category", "overview", "bullets"],
                "properties": {
                    "category": {"type": "string", "minLength": 1, "maxLength": 60},
                    "overview": {"type": "string", "minLength": 1, "maxLength": 900},
                    "bullets": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 8,
                        "items": {"type": "string", "minLength": 1, "maxLength": 320},
                    },
                },
            },
        },
        "notes": {
            "type": "array",
            "maxItems": 8,
            "items": {"type": "string", "minLength": 1, "maxLength": 320},
        },
    },
}


@dataclass(frozen=True)
class AIPolishSection:
    category: str
    overview: str
    bullets: tuple[str, ...]


@dataclass(frozen=True)
class AIPolishResult:
    schema_version: str
    title: str
    summary: str
    sections: tuple[AIPolishSection, ...]
    notes: tuple[str, ...] = ()


def parse_ai_polish_response(data: Any) -> AIPolishResult:
    if not isinstance(data, dict):
        raise ValueError("AI polish response must be a JSON object.")

    schema_version = _read_non_empty_string(data, "schema_version")
    if schema_version != AI_POLISH_SCHEMA_VERSION:
        raise ValueError(
            f"`schema_version` must be {AI_POLISH_SCHEMA_VERSION!r}, got {schema_version!r}."
        )

    title = _read_non_empty_string(data, "title")
    summary = _read_non_empty_string(data, "summary")
    sections_raw = data.get("sections")
    if not isinstance(sections_raw, list) or not sections_raw:
        raise ValueError("AI polish response must include non-empty `sections` list.")

    sections: list[AIPolishSection] = []
    for index, section_raw in enumerate(sections_raw):
        if not isinstance(section_raw, dict):
            raise ValueError(f"AI polish section at index {index} must be an object.")

        path = f"sections[{index}]"
        category = _read_non_empty_string(section_raw, "category", path=path)
        overview = _read_non_empty_string(section_raw, "overview", path=path)
        bullets = _read_non_empty_string_list(section_raw, "bullets", path=path, required=True)
        sections.append(AIPolishSection(category=category, overview=overview, bullets=tuple(bullets)))

    notes = _read_non_empty_string_list(data, "notes")
    return AIPolishResult(
        schema_version=schema_version,
        title=title,
        summary=summary,
        sections=tuple(sections),
        notes=tuple(notes),
    )


def ai_polish_result_to_dict(result: AIPolishResult) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "schema_version": result.schema_version,
        "title": result.title,
        "summary": result.summary,
        "sections": [
            {
                "category": section.category,
                "overview": section.overview,
                "bullets": list(section.bullets),
            }
            for section in result.sections
        ],
    }
    if result.notes:
        payload["notes"] = list(result.notes)
    return payload


def build_polish_input_payload(draft: AIDraftResult) -> dict[str, Any]:
    """Create compact, deterministic polish input from the draft result."""
    return ai_draft_result_to_dict(draft)


def _read_non_empty_string(obj: dict[str, Any], key: str, path: str | None = None) -> str:
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip():
        prefix = f"{path}." if path else ""
        raise ValueError(f"`{prefix}{key}` must be a non-empty string.")
    return value.strip()


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
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"`{prefix}{key}[{index}]` must be a non-empty string.")
        normalized.append(value.strip())
    return normalized
