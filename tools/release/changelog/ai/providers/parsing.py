from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class JSONParseFailure:
    reason: str
    sample: str


@dataclass(frozen=True)
class JSONParseDiagnostics:
    normalized_input: str
    candidates: tuple[str, ...]
    failures: tuple[JSONParseFailure, ...]


class JSONParseError(ValueError):
    def __init__(self, message: str, *, diagnostics: JSONParseDiagnostics) -> None:
        super().__init__(message)
        self.diagnostics = diagnostics


def parse_json_object_from_text(text: str) -> dict[str, Any]:
    normalized = text.strip()
    if not normalized:
        raise JSONParseError(
            "AI parse error: provider returned empty output.",
            diagnostics=JSONParseDiagnostics(
                normalized_input="",
                candidates=tuple(),
                failures=tuple(),
            ),
        )

    candidates = _candidate_json_strings(normalized)
    failures: list[JSONParseFailure] = []

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError as exc:
            failures.append(
                JSONParseFailure(
                    reason=f"invalid JSON ({exc.msg} at char {exc.pos})",
                    sample=_truncate(candidate),
                )
            )
            continue

        if not isinstance(parsed, dict):
            failures.append(
                JSONParseFailure(
                    reason=f"JSON root must be object, got {type(parsed).__name__}",
                    sample=_truncate(candidate),
                )
            )
            continue

        return _unwrap_common_object_envelope(parsed)

    details = "; ".join(f"{item.reason}: {item.sample}" for item in failures[:2])
    raise JSONParseError(
        f"AI parse error: could not recover valid JSON object. {details}".strip(),
        diagnostics=JSONParseDiagnostics(
            normalized_input=normalized,
            candidates=tuple(candidates),
            failures=tuple(failures),
        ),
    )


def _candidate_json_strings(text: str) -> list[str]:
    candidates: list[str] = [text]

    fence_match = re.search(r"```(?:json)?\s*(\{[\s\S]*\})\s*```", text, flags=re.IGNORECASE)
    if fence_match:
        candidates.append(fence_match.group(1).strip())

    balanced = _extract_first_balanced_object(text)
    if balanced is not None:
        candidates.append(balanced)

    deduped: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        deduped.append(candidate)
    return deduped


def _extract_first_balanced_object(text: str) -> str | None:
    in_string = False
    escape = False
    depth = 0
    start_index: int | None = None

    for index, char in enumerate(text):
        if in_string:
            if escape:
                escape = False
                continue
            if char == "\\":
                escape = True
                continue
            if char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue

        if char == "{":
            if depth == 0:
                start_index = index
            depth += 1
            continue

        if char == "}":
            if depth == 0:
                continue
            depth -= 1
            if depth == 0 and start_index is not None:
                return text[start_index : index + 1].strip()

    return None


def _truncate(value: str, *, max_len: int = 120) -> str:
    compact = " ".join(value.split())
    if len(compact) <= max_len:
        return compact
    return compact[: max_len - 3] + "..."


def _unwrap_common_object_envelope(parsed: dict[str, Any]) -> dict[str, Any]:
    # Some local providers wrap the JSON object under a generic container key.
    if len(parsed) != 1:
        return parsed
    key = next(iter(parsed.keys()))
    if key not in {"result", "output", "data", "json", "response"}:
        return parsed
    value = parsed.get(key)
    if isinstance(value, dict):
        return value
    return parsed
