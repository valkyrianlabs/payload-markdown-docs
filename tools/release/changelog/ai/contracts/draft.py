from __future__ import annotations

from dataclasses import dataclass
from typing import Any


AI_DRAFT_RESPONSE_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["title", "summary", "sections", "notes"],
    "properties": {
        "title": {
            "type": "string",
            "minLength": 1,
            "maxLength": 140,
        },
        "summary": {
            "type": "string",
            "minLength": 1,
            "maxLength": 1600,
        },
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
class AIDraftSection:
    category: str
    overview: str
    bullets: tuple[str, ...]


@dataclass(frozen=True)
class AIDraftResult:
    title: str
    summary: str
    sections: tuple[AIDraftSection, ...]
    notes: tuple[str, ...] = ()


def parse_ai_draft_response(data: Any) -> AIDraftResult:
    if not isinstance(data, dict):
        raise ValueError("AI draft response must be a JSON object.")

    title = _read_non_empty_string(data, "title")
    summary = _read_non_empty_string(data, "summary")
    sections_raw = data.get("sections")

    if not isinstance(sections_raw, list) or not sections_raw:
        raise ValueError("AI draft response must include non-empty `sections` list.")

    sections: list[AIDraftSection] = []
    for index, section_raw in enumerate(sections_raw):
        if not isinstance(section_raw, dict):
            raise ValueError(f"AI draft section at index {index} must be an object.")

        category = _read_non_empty_string(section_raw, "category", path=f"sections[{index}]")
        overview = _read_non_empty_string(section_raw, "overview", path=f"sections[{index}]")

        bullets_raw = section_raw.get("bullets")
        if not isinstance(bullets_raw, list) or not bullets_raw:
            raise ValueError(f"`sections[{index}].bullets` must be a non-empty list of strings.")

        bullets: list[str] = []
        for bullet_index, bullet in enumerate(bullets_raw):
            if not isinstance(bullet, str) or not bullet.strip():
                raise ValueError(
                    f"`sections[{index}].bullets[{bullet_index}]` must be a non-empty string."
                )
            bullets.append(bullet.strip())

        sections.append(
            AIDraftSection(
                category=category,
                overview=overview,
                bullets=tuple(bullets),
            )
        )

    notes = _read_optional_string_list(data, "notes")
    return AIDraftResult(title=title, summary=summary, sections=tuple(sections), notes=tuple(notes))


def ai_draft_result_to_dict(result: AIDraftResult) -> dict[str, Any]:
    payload: dict[str, Any] = {
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


def _read_non_empty_string(obj: dict[str, Any], key: str, path: str | None = None) -> str:
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip():
        prefix = f"{path}." if path else ""
        raise ValueError(f"`{prefix}{key}` must be a non-empty string.")
    return value.strip()


def _read_optional_string_list(obj: dict[str, Any], key: str) -> list[str]:
    raw = obj.get(key)
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError(f"`{key}` must be a list of strings when present.")

    normalized: list[str] = []
    for index, value in enumerate(raw):
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"`{key}[{index}]` must be a non-empty string.")
        normalized.append(value.strip())
    return normalized
