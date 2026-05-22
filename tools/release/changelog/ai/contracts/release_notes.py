from __future__ import annotations

from dataclasses import dataclass
from typing import Any


AI_RELEASE_NOTES_SCHEMA_VERSION = "vaulthalla.release.ai_release_notes.v1"

AI_RELEASE_NOTES_RESPONSE_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["schema_version", "markdown"],
    "properties": {
        "schema_version": {"type": "string", "const": AI_RELEASE_NOTES_SCHEMA_VERSION},
        "markdown": {"type": "string", "minLength": 1, "maxLength": 12000},
    },
}


@dataclass(frozen=True)
class AIReleaseNotesResult:
    schema_version: str
    markdown: str


def parse_ai_release_notes_response(data: Any) -> AIReleaseNotesResult:
    if not isinstance(data, dict):
        raise ValueError("AI release_notes response must be a JSON object.")

    schema_version = _read_non_empty_string(data, "schema_version")
    if schema_version != AI_RELEASE_NOTES_SCHEMA_VERSION:
        raise ValueError(
            f"`schema_version` must be {AI_RELEASE_NOTES_SCHEMA_VERSION!r}, got {schema_version!r}."
        )
    markdown = _read_non_empty_string(data, "markdown")
    return AIReleaseNotesResult(schema_version=schema_version, markdown=markdown)


def ai_release_notes_result_to_dict(result: AIReleaseNotesResult) -> dict[str, Any]:
    return {
        "schema_version": result.schema_version,
        "markdown": result.markdown,
    }


def _read_non_empty_string(obj: dict[str, Any], key: str) -> str:
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"`{key}` must be a non-empty string.")
    return value.strip()
