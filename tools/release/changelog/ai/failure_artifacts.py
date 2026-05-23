from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

FAILURE_ARTIFACT_VERBOSE_ENV_VAR = "RELEASE_AI_FAILURE_EVIDENCE_VERBOSE"
_FAILURE_DIR = Path(".changelog_scratch") / "failures"
_CONTEXT_FILE = "context.json"
_REQUEST_FILE = "request.json"
_RESPONSE_FILE = "response.json"
_SECRET_KEY_EXACT_NAMES = {
    "api_key",
    "authorization",
    "proxy_authorization",
    "auth",
    "auth_token",
    "access_token",
    "refresh_token",
    "id_token",
    "secret",
    "password",
}
_SECRET_KEY_SUFFIXES = (
    "_api_key",
    "_auth_token",
    "_access_token",
    "_refresh_token",
    "_authorization",
    "_password",
    "_secret",
)
_JSON_MAX_DEPTH = 8
_JSON_LIST_LIMIT = 50
_JSON_STRING_LIMIT = 16000
_RAW_PAYLOAD_MAX_DEPTH = 20
_RAW_PAYLOAD_LIST_LIMIT = 5000
_RAW_PAYLOAD_STRING_LIMIT = 250000
_BEARER_TOKEN_PATTERN = re.compile(r"(?i)\bbearer\s+[a-z0-9._~+/=-]+\b")
_OPENAI_KEY_PATTERN = re.compile(r"\bsk-[A-Za-z0-9_-]{8,}\b")
_QUERY_SECRET_PATTERN = re.compile(
    r"(?i)([?&](?:api_key|access_token|refresh_token|id_token|auth_token|token|password|secret)=)[^&\s]+"
)


def collect_provider_failure_evidence(provider: Any) -> dict[str, Any] | None:
    snapshot = getattr(provider, "failure_evidence_snapshot", None)
    if callable(snapshot):
        value = snapshot()
        if isinstance(value, dict):
            return value
    return None


def provider_response_observed(provider_evidence: dict[str, Any] | None) -> bool:
    if not isinstance(provider_evidence, dict):
        return False
    attempts = provider_evidence.get("attempts")
    if not isinstance(attempts, list):
        return False
    for attempt in attempts:
        if not isinstance(attempt, dict):
            continue
        if attempt.get("response_received"):
            return True
        response_summary = attempt.get("response_summary")
        if isinstance(response_summary, dict) and response_summary:
            return True
    return False


def write_failure_artifact(
    *,
    repo_root: Path,
    command: str | None,
    stage: str,
    ai_profile: str | None,
    provider_key: str,
    model: str | None,
    structured_mode: str | None,
    normalized_request_settings: dict[str, Any],
    error: Exception,
    provider_evidence: dict[str, Any],
    extra: dict[str, Any] | None = None,
) -> Path:
    include_verbose = _env_bool(os.getenv(FAILURE_ARTIFACT_VERBOSE_ENV_VAR))
    now = datetime.now(timezone.utc)
    timestamp = now.strftime("%Y-%m-%dT%H-%M-%SZ")
    context_payload: dict[str, Any] = {
        "timestamp_utc": now.isoformat(),
        "metadata": {
            "command": command,
            "stage": stage,
            "ai_profile": ai_profile,
            "provider_key": provider_key,
            "model": model,
            "structured_mode": structured_mode,
        },
        "error": {
            "type": error.__class__.__name__,
            "message": str(error),
        },
        "normalized_request_settings": _sanitize_for_json(
            normalized_request_settings,
            depth_limit=_JSON_MAX_DEPTH,
            list_limit=_JSON_LIST_LIMIT,
            string_limit=_JSON_STRING_LIMIT,
        ),
        "provider_evidence": _reduce_provider_evidence(
            provider_evidence,
            include_verbose=include_verbose,
        ),
    }
    if extra:
        context_payload["extra"] = _sanitize_for_json(
            extra,
            depth_limit=_JSON_MAX_DEPTH,
            list_limit=_JSON_LIST_LIMIT,
            string_limit=_JSON_STRING_LIMIT,
        )

    failures_dir = (repo_root / _FAILURE_DIR).resolve()
    failures_dir.mkdir(parents=True, exist_ok=True)
    directory_name = _next_directory_name(
        base_dir=failures_dir,
        stem_parts=(
            timestamp,
            _slug(stage),
            _slug(provider_key),
            _slug(model or "unknown-model"),
            _slug(structured_mode or "unknown-mode"),
        ),
    )
    target_dir = failures_dir / directory_name
    target_dir.mkdir(parents=True, exist_ok=False)

    payload_attempt = _select_payload_attempt(provider_evidence)
    request_payload = _extract_request_payload(payload_attempt)
    response_payload = _extract_response_payload(payload_attempt)
    context_payload["raw_payload_capture"] = {
        "attempt_index": payload_attempt.get("attempt_index") if isinstance(payload_attempt, dict) else None,
        "mode": payload_attempt.get("mode") if isinstance(payload_attempt, dict) else None,
        "transport": payload_attempt.get("transport") if isinstance(payload_attempt, dict) else None,
        "request_available": request_payload is not None,
        "response_available": response_payload is not None,
        "request_file": _REQUEST_FILE,
        "response_file": _RESPONSE_FILE,
    }

    _write_json_file(target_dir / _CONTEXT_FILE, context_payload)
    _write_json_file(target_dir / _REQUEST_FILE, _render_payload_document(request_payload, kind="request"))
    _write_json_file(target_dir / _RESPONSE_FILE, _render_payload_document(response_payload, kind="response"))
    return target_dir


def _reduce_provider_evidence(
    provider_evidence: dict[str, Any],
    *,
    include_verbose: bool,
) -> dict[str, Any]:
    reduced: dict[str, Any] = {
        "provider_kind": provider_evidence.get("provider_kind"),
        "model": provider_evidence.get("model"),
        "base_url": provider_evidence.get("base_url"),
        "resolved_settings": _sanitize_for_json(
            provider_evidence.get("resolved_settings"),
            depth_limit=_JSON_MAX_DEPTH,
            list_limit=_JSON_LIST_LIMIT,
            string_limit=_JSON_STRING_LIMIT,
        ),
        "mode_chain": _sanitize_for_json(
            provider_evidence.get("mode_chain"),
            depth_limit=_JSON_MAX_DEPTH,
            list_limit=_JSON_LIST_LIMIT,
            string_limit=_JSON_STRING_LIMIT,
        ),
        "successful_mode": provider_evidence.get("successful_mode"),
        "status": provider_evidence.get("status"),
        "final_error": provider_evidence.get("final_error"),
        "parsed_json_preview": _sanitize_for_json(
            provider_evidence.get("parsed_json_preview"),
            depth_limit=_JSON_MAX_DEPTH,
            list_limit=_JSON_LIST_LIMIT,
            string_limit=_JSON_STRING_LIMIT,
        ),
    }

    attempts_value = provider_evidence.get("attempts")
    attempts: list[dict[str, Any]] = []
    if isinstance(attempts_value, list):
        for item in attempts_value:
            if not isinstance(item, dict):
                continue
            attempt: dict[str, Any] = {
                "attempt_index": item.get("attempt_index"),
                "mode": item.get("mode"),
                "transport": item.get("transport"),
                "response_received": item.get("response_received"),
                "normalized_request": _sanitize_for_json(
                    item.get("normalized_request"),
                    depth_limit=_JSON_MAX_DEPTH,
                    list_limit=_JSON_LIST_LIMIT,
                    string_limit=_JSON_STRING_LIMIT,
                ),
                "request_summary": _sanitize_for_json(
                    item.get("request_summary"),
                    depth_limit=_JSON_MAX_DEPTH,
                    list_limit=_JSON_LIST_LIMIT,
                    string_limit=_JSON_STRING_LIMIT,
                ),
                "response_summary": _sanitize_for_json(
                    item.get("response_summary"),
                    depth_limit=_JSON_MAX_DEPTH,
                    list_limit=_JSON_LIST_LIMIT,
                    string_limit=_JSON_STRING_LIMIT,
                ),
                "request_diagnostics": _sanitize_for_json(
                    item.get("request_diagnostics"),
                    depth_limit=_JSON_MAX_DEPTH,
                    list_limit=_JSON_LIST_LIMIT,
                    string_limit=_JSON_STRING_LIMIT,
                ),
                "response_diagnostics": _sanitize_for_json(
                    item.get("response_diagnostics"),
                    depth_limit=_JSON_MAX_DEPTH,
                    list_limit=_JSON_LIST_LIMIT,
                    string_limit=_JSON_STRING_LIMIT,
                ),
                "content_preview": _sanitize_for_json(
                    item.get("content_preview"),
                    depth_limit=_JSON_MAX_DEPTH,
                    list_limit=_JSON_LIST_LIMIT,
                    string_limit=_JSON_STRING_LIMIT,
                ),
                "content_length": item.get("content_length"),
                "parse_candidates": _sanitize_for_json(
                    item.get("parse_candidates"),
                    depth_limit=_JSON_MAX_DEPTH,
                    list_limit=_JSON_LIST_LIMIT,
                    string_limit=_JSON_STRING_LIMIT,
                ),
                "parse_candidates_lengths": _sanitize_for_json(
                    item.get("parse_candidates_lengths"),
                    depth_limit=_JSON_MAX_DEPTH,
                    list_limit=_JSON_LIST_LIMIT,
                    string_limit=_JSON_STRING_LIMIT,
                ),
                "parse_failures": _sanitize_for_json(
                    item.get("parse_failures"),
                    depth_limit=_JSON_MAX_DEPTH,
                    list_limit=_JSON_LIST_LIMIT,
                    string_limit=_JSON_STRING_LIMIT,
                ),
                "likely_truncated_json": item.get("likely_truncated_json"),
                "error_type": item.get("error_type"),
                "error": item.get("error"),
                "result": item.get("result"),
            }
            if include_verbose:
                attempt["request_payload_debug"] = _sanitize_for_json(
                    item.get("request_payload_debug"),
                    depth_limit=_JSON_MAX_DEPTH,
                    list_limit=_JSON_LIST_LIMIT,
                    string_limit=_JSON_STRING_LIMIT,
                )
                attempt["response_payload_debug"] = _sanitize_for_json(
                    item.get("response_payload_debug"),
                    depth_limit=_JSON_MAX_DEPTH,
                    list_limit=_JSON_LIST_LIMIT,
                    string_limit=_JSON_STRING_LIMIT,
                )
            attempts.append(attempt)
    reduced["attempts"] = attempts
    return reduced


def _sanitize_for_json(
    value: Any,
    *,
    depth: int = 0,
    depth_limit: int,
    list_limit: int,
    string_limit: int,
) -> Any:
    if depth > depth_limit:
        return "<max-depth>"
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return _truncate(_redact_sensitive_text(value), limit=string_limit)
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, item in value.items():
            key_str = str(key)
            if _is_sensitive_key(key_str):
                out[key_str] = "<redacted>"
            else:
                out[key_str] = _sanitize_for_json(
                    item,
                    depth=depth + 1,
                    depth_limit=depth_limit,
                    list_limit=list_limit,
                    string_limit=string_limit,
                )
        return out
    if isinstance(value, (list, tuple)):
        return [
            _sanitize_for_json(
                item,
                depth=depth + 1,
                depth_limit=depth_limit,
                list_limit=list_limit,
                string_limit=string_limit,
            )
            for item in list(value)[:list_limit]
        ]

    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        try:
            dumped = model_dump(exclude_none=True)
        except TypeError:
            dumped = model_dump()
        return _sanitize_for_json(
            dumped,
            depth=depth + 1,
            depth_limit=depth_limit,
            list_limit=list_limit,
            string_limit=string_limit,
        )

    to_dict = getattr(value, "to_dict", None)
    if callable(to_dict):
        return _sanitize_for_json(
            to_dict(),
            depth=depth + 1,
            depth_limit=depth_limit,
            list_limit=list_limit,
            string_limit=string_limit,
        )

    return _truncate(_redact_sensitive_text(repr(value)), limit=string_limit)


def _truncate(value: str, *, limit: int = 16000) -> str:
    if len(value) <= limit:
        return value
    return value[: limit - 3] + "..."


def _env_bool(raw: str | None) -> bool:
    if raw is None:
        return False
    normalized = raw.strip().lower()
    return normalized in {"1", "true", "yes", "on"}


def _slug(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        return "unknown"
    compact = re.sub(r"[^A-Za-z0-9._-]+", "-", normalized)
    compact = compact.strip("-")
    return compact or "unknown"


def _next_directory_name(*, base_dir: Path, stem_parts: tuple[str, ...]) -> str:
    stem = "_".join(stem_parts)
    candidate = stem
    if not (base_dir / candidate).exists():
        return candidate
    index = 2
    while True:
        candidate = f"{stem}_{index:02d}"
        if not (base_dir / candidate).exists():
            return candidate
        index += 1


def _write_json_file(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def _render_payload_document(payload: Any | None, *, kind: str) -> Any:
    if payload is None:
        return {
            "available": False,
            "reason": f"No {kind} payload captured for the selected failed attempt.",
        }
    return _sanitize_for_json(
        payload,
        depth_limit=_RAW_PAYLOAD_MAX_DEPTH,
        list_limit=_RAW_PAYLOAD_LIST_LIMIT,
        string_limit=_RAW_PAYLOAD_STRING_LIMIT,
    )


def _select_payload_attempt(provider_evidence: dict[str, Any]) -> dict[str, Any] | None:
    attempts_value = provider_evidence.get("attempts")
    if not isinstance(attempts_value, list):
        return None
    attempts = [item for item in attempts_value if isinstance(item, dict)]
    for item in reversed(attempts):
        if _extract_response_payload(item) is not None:
            return item
    for item in reversed(attempts):
        if _extract_request_payload(item) is not None:
            return item
    if attempts:
        return attempts[-1]
    return None


def _extract_request_payload(attempt: dict[str, Any] | None) -> Any | None:
    if not isinstance(attempt, dict):
        return None
    for key in ("request_payload_raw", "request_payload_debug", "request_payload"):
        value = attempt.get(key)
        if value is not None:
            return value
    return None


def _extract_response_payload(attempt: dict[str, Any] | None) -> Any | None:
    if not isinstance(attempt, dict):
        return None
    for key in ("response_payload_raw", "response_payload_debug", "response_payload"):
        value = attempt.get(key)
        if value is not None:
            return value
    return None


def _redact_sensitive_text(value: str) -> str:
    redacted = _BEARER_TOKEN_PATTERN.sub("Bearer <redacted>", value)
    redacted = _OPENAI_KEY_PATTERN.sub("<redacted>", redacted)
    redacted = _QUERY_SECRET_PATTERN.sub(r"\1<redacted>", redacted)
    return redacted


def _is_sensitive_key(key: str) -> bool:
    normalized = key.strip().lower().replace("-", "_")
    if normalized in _SECRET_KEY_EXACT_NAMES:
        return True
    return any(normalized.endswith(suffix) for suffix in _SECRET_KEY_SUFFIXES)
