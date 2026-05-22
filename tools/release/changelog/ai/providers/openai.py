from __future__ import annotations

import json
import os
import sys
from typing import Any
from uuid import uuid4

from tools.release.changelog.ai.config import (
    AIProviderKind,
    AIReasoningEffort,
    AIStageName,
    AIStructuredMode,
    DEFAULT_AI_DRAFT_MODEL,
    OPENAI_API_KEY_ENV_VAR,
)
from tools.release.changelog.ai.providers.capabilities import (
    ProviderCapabilities,
    build_structured_mode_fallback_chain,
    get_provider_capabilities,
    resolve_request_parameter_capabilities,
    resolve_generation_settings,
)
from tools.release.changelog.ai.providers.parsing import JSONParseError, parse_json_object_from_text

LOCAL_NO_AUTH_API_KEY_PLACEHOLDER = "local-no-auth"
_MODE_RECOVERABLE_ERROR_MARKERS = (
    "response_format",
    "json_schema",
    "invalid schema",
    "strict",
    "unsupported",
    "not supported",
    "invalid request",
    "invalid_request_error",
    "unknown parameter",
    "unrecognized",
    "does not support",
)
_RESPONSES_TEXT_CONTENT_TYPES = frozenset(
    {
        "output_text",
        "text",
        "summary_text",
        "reasoning_text",
    }
)
_RESPONSES_JSON_CONTENT_FIELDS = (
    "json",
    "parsed",
    "output_json",
)
_EVIDENCE_STRING_LIMIT = 4096
_EVIDENCE_LIST_LIMIT = 12
_HOSTED_PROMPT_JSON_MIN_OUTPUT_TOKENS = 1200
_HOSTED_TRIAGE_STRICT_MIN_OUTPUT_TOKENS = 1400
_HOSTED_TRIAGE_PROMPT_JSON_MIN_OUTPUT_TOKENS = 2200
_DEFAULT_OPENAI_BASE_URL = "https://api.openai.com"
_RESPONSES_ENDPOINT_PATH = "/v1/responses"
_CHAT_COMPLETIONS_ENDPOINT_PATH = "/v1/chat/completions"
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
_PROGRESS_LOG_ENABLED = os.getenv("RELEASE_AI_EMERGENCY_TRIAGE_PROGRESS", "1").strip().lower() not in {
    "0",
    "false",
    "no",
    "off",
}


class _AttemptFailure(Exception):
    def __init__(
        self,
        message: str,
        *,
        transport: str,
        request_payload: dict[str, Any],
        response_received: bool,
        response_summary: dict[str, Any] | None = None,
        request_payload_debug: Any | None = None,
        response_payload_debug: Any | None = None,
        request_payload_raw: Any | None = None,
        response_payload_raw: Any | None = None,
        request_diagnostics: dict[str, Any] | None = None,
        response_diagnostics: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.transport = transport
        self.request_payload = request_payload
        self.response_received = response_received
        self.response_summary = response_summary
        self.request_payload_debug = request_payload_debug
        self.response_payload_debug = response_payload_debug
        self.request_payload_raw = request_payload_raw
        self.response_payload_raw = response_payload_raw
        self.request_diagnostics = request_diagnostics
        self.response_diagnostics = response_diagnostics


class _GenerationOutcome:
    def __init__(
        self,
        *,
        transport: str,
        request_payload: dict[str, Any],
        response_summary: dict[str, Any],
        content: str,
        request_payload_debug: Any,
        response_payload_debug: Any,
        request_payload_raw: Any,
        response_payload_raw: Any,
        request_diagnostics: dict[str, Any],
        response_diagnostics: dict[str, Any] | None,
    ) -> None:
        self.transport = transport
        self.request_payload = request_payload
        self.response_summary = response_summary
        self.content = content
        self.request_payload_debug = request_payload_debug
        self.response_payload_debug = response_payload_debug
        self.request_payload_raw = request_payload_raw
        self.response_payload_raw = response_payload_raw
        self.request_diagnostics = request_diagnostics
        self.response_diagnostics = response_diagnostics


class OpenAIProvider:
    """Thin OpenAI transport adapter for one structured JSON generation pass."""

    def __init__(
        self,
        *,
        model: str = DEFAULT_AI_DRAFT_MODEL,
        provider_kind: AIProviderKind = "openai",
        api_key: str | None = None,
        api_key_env_var: str = OPENAI_API_KEY_ENV_VAR,
        base_url: str | None = None,
        timeout_seconds: float | None = None,
        require_api_key: bool = True,
        sdk_client: Any | None = None,
    ) -> None:
        self.model = model
        self.provider_kind = provider_kind
        self.base_url = base_url
        self.last_structured_mode_used: AIStructuredMode | None = None
        self._last_generation_evidence: dict[str, Any] | None = None

        if sdk_client is not None:
            self._client = sdk_client
            return

        resolved_api_key = api_key or os.getenv(api_key_env_var)
        if not resolved_api_key and require_api_key:
            raise ValueError(
                f"{api_key_env_var} is not set. Export {api_key_env_var} to run `changelog ai-draft`."
            )
        if not resolved_api_key:
            # OpenAI-compatible local gateways may not require auth; keep a placeholder
            # so SDK client construction still succeeds when no key is provided.
            resolved_api_key = LOCAL_NO_AUTH_API_KEY_PLACEHOLDER

        self._client = _build_sdk_client(
            api_key=resolved_api_key,
            base_url=base_url,
            timeout_seconds=timeout_seconds,
        )

    def list_models(self) -> list[str]:
        try:
            response = self._client.models.list()
        except Exception as exc:
            raise ValueError(f"Model discovery request failed: {exc}") from exc

        data = response.get("data") if isinstance(response, dict) else getattr(response, "data", None)
        if not isinstance(data, list):
            raise ValueError("Model discovery response did not include a valid `data` list.")

        model_ids: list[str] = []
        for item in data:
            model_id = item.get("id") if isinstance(item, dict) else getattr(item, "id", None)
            if isinstance(model_id, str) and model_id.strip():
                model_ids.append(model_id.strip())
        return sorted(set(model_ids))

    def failure_evidence_snapshot(self) -> dict[str, Any] | None:
        if self._last_generation_evidence is None:
            return None
        return _safe_json_clone(self._last_generation_evidence)

    def generate_structured_json(
        self,
        *,
        stage: AIStageName | None = None,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any],
        reasoning_effort: AIReasoningEffort | None = None,
        structured_mode: AIStructuredMode | None = None,
        temperature: float | None = None,
        max_output_tokens: int | None = None,
    ) -> dict[str, Any]:
        self.last_structured_mode_used = None
        self._last_generation_evidence = None
        settings = resolve_generation_settings(
            provider_kind=self.provider_kind,
            requested_structured_mode=structured_mode,
            requested_reasoning_effort=reasoning_effort,
        )
        initial_mode_chain = build_structured_mode_fallback_chain(settings.structured_mode)
        mode_chain = _resolve_runtime_mode_chain(
            provider_kind=self.provider_kind,
            model=self.model,
            stage=stage,
            mode_chain=initial_mode_chain,
        )
        trace: dict[str, Any] = {
            "provider_kind": self.provider_kind,
            "model": self.model,
            "base_url": self.base_url,
            "requested": {
                "stage": stage,
                "structured_mode": structured_mode,
                "reasoning_effort": reasoning_effort,
                "temperature": temperature,
                "max_output_tokens": max_output_tokens,
            },
            "resolved_settings": {
                "structured_mode": settings.structured_mode,
                "reasoning_effort": settings.reasoning_effort,
                "degradations": list(settings.degradations),
            },
            "requested_mode_chain": list(initial_mode_chain),
            "mode_chain": list(mode_chain),
            "attempts": [],
        }
        if mode_chain != initial_mode_chain:
            if _is_hosted_gpt5_model(provider_kind=self.provider_kind, model=self.model) and stage == "triage":
                trace["resolved_settings"]["degradations"].append(
                    "Hosted OpenAI GPT-5 triage lanes prefer answer-first `prompt_json` before strict schema and skip `json_object` fallback."
                )
            else:
                trace["resolved_settings"]["degradations"].append(
                    "Hosted OpenAI GPT-5 runtime skips json_object fallback because it repeatedly returns reasoning-only output in this pipeline."
                )
        errors: list[str] = []

        for mode_index, mode in enumerate(mode_chain):
            _emit_generation_progress(
                stage=stage,
                message=f"provider attempt start (mode={mode}, attempt={mode_index + 1}/{len(mode_chain)})",
            )
            attempt_reasoning_effort = _resolve_attempt_reasoning_effort(
                provider_kind=self.provider_kind,
                model=self.model,
                stage=stage,
                structured_mode=mode,
                requested_reasoning_effort=settings.reasoning_effort,
            )
            attempt_max_output_tokens = _resolve_attempt_max_output_tokens(
                provider_kind=self.provider_kind,
                model=self.model,
                stage=stage,
                structured_mode=mode,
                requested_max_output_tokens=max_output_tokens,
            )
            attempt: dict[str, Any] = {
                "attempt_index": mode_index + 1,
                "mode": mode,
                "normalized_request": {
                    "structured_mode": mode,
                    "reasoning_effort": attempt_reasoning_effort,
                    "temperature": temperature,
                    "max_output_tokens": attempt_max_output_tokens,
                },
            }
            trace["attempts"].append(attempt)
            try:
                outcome = self._generate_text_output(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    json_schema=json_schema,
                    structured_mode=mode,
                    reasoning_effort=attempt_reasoning_effort,
                    temperature=temperature,
                    max_output_tokens=attempt_max_output_tokens,
                )
                attempt["transport"] = outcome.transport
                attempt["response_received"] = True
                attempt["request_summary"] = _summarize_request_payload(
                    request_payload=outcome.request_payload,
                    transport=outcome.transport,
                )
                attempt["response_summary"] = outcome.response_summary
                attempt["response_payload_debug"] = outcome.response_payload_debug
                attempt["request_payload_debug"] = outcome.request_payload_debug
                attempt["request_payload_raw"] = outcome.request_payload_raw
                attempt["response_payload_raw"] = outcome.response_payload_raw
                attempt["request_diagnostics"] = outcome.request_diagnostics
                attempt["response_diagnostics"] = outcome.response_diagnostics
                attempt["content_preview"] = _truncate_text(outcome.content)
                attempt["content_length"] = len(outcome.content)
                try:
                    parsed = parse_json_object_from_text(outcome.content)
                except JSONParseError as exc:
                    attempt["error"] = str(exc)
                    attempt["error_type"] = "json_parse_error"
                    attempt["parse_candidates"] = [
                        _truncate_text(candidate)
                        for candidate in exc.diagnostics.candidates[:_EVIDENCE_LIST_LIMIT]
                    ]
                    attempt["parse_candidates_lengths"] = [
                        len(candidate) for candidate in exc.diagnostics.candidates[:_EVIDENCE_LIST_LIMIT]
                    ]
                    attempt["parse_failures"] = [
                        {
                            "reason": failure.reason,
                            "sample": failure.sample,
                        }
                        for failure in exc.diagnostics.failures[:_EVIDENCE_LIST_LIMIT]
                    ]
                    attempt["likely_truncated_json"] = _detect_likely_truncated_json(exc)
                    raise

                self.last_structured_mode_used = mode
                attempt["result"] = "success"
                trace["successful_mode"] = mode
                trace["parsed_json_preview"] = _sanitize_for_evidence(parsed)
                trace["status"] = "success"
                self._last_generation_evidence = trace
                _emit_generation_progress(
                    stage=stage,
                    message=f"provider attempt end (mode={mode}, result=success)",
                )
                return parsed
            except _AttemptFailure as exc:
                message = str(exc)
                attempt["error"] = message
                attempt["error_type"] = "provider_error"
                attempt["transport"] = exc.transport
                attempt["response_received"] = exc.response_received
                attempt["request_summary"] = _summarize_request_payload(
                    request_payload=exc.request_payload,
                    transport=exc.transport,
                )
                attempt["response_summary"] = exc.response_summary
                attempt["response_payload_debug"] = exc.response_payload_debug
                attempt["request_payload_debug"] = exc.request_payload_debug
                attempt["request_payload_raw"] = exc.request_payload_raw
                attempt["response_payload_raw"] = exc.response_payload_raw
                attempt["request_diagnostics"] = exc.request_diagnostics
                attempt["response_diagnostics"] = exc.response_diagnostics
            except Exception as exc:
                message = str(exc)
                attempt["error"] = message
                attempt["error_type"] = "unknown"
                mode_label = f"{self.provider_kind}:{mode}"
                errors.append(f"{mode_label}: {message}")
                if message.startswith("AI provider refusal:"):
                    trace["status"] = "failed"
                    trace["final_error"] = message
                    self._last_generation_evidence = trace
                    raise ValueError(message) from exc
                has_next_mode = mode_index < len(mode_chain) - 1
                if has_next_mode and _is_mode_recoverable_error(message):
                    continue
                break
            else:
                message = ""

            mode_label = f"{self.provider_kind}:{mode}"
            errors.append(f"{mode_label}: {message}")
            has_next_mode = mode_index < len(mode_chain) - 1
            if has_next_mode and _is_mode_recoverable_error(message):
                _emit_generation_progress(
                    stage=stage,
                    message=(
                        f"provider fallback transition (from={mode}, "
                        f"to={mode_chain[mode_index + 1]}, reason={_truncate_text(message, limit=180)})"
                    ),
                )
                continue
            break

        attempted = ", ".join(mode_chain)
        details = " | ".join(errors[-2:])
        trace["status"] = "failed"
        trace["final_error"] = (
            f"AI generation failed after structured-mode attempts [{attempted}]. {details}"
        )
        self._last_generation_evidence = trace
        raise ValueError(
            f"AI generation failed after structured-mode attempts [{attempted}]. {details}"
        )

    def capabilities(self) -> ProviderCapabilities:
        return get_provider_capabilities(self.provider_kind)

    def _generate_text_output(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any],
        structured_mode: AIStructuredMode,
        reasoning_effort: AIReasoningEffort | None,
        temperature: float | None,
        max_output_tokens: int | None,
    ) -> _GenerationOutcome:
        if self.provider_kind == "openai":
            return self._generate_hosted_openai_output(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                json_schema=json_schema,
                structured_mode=structured_mode,
                reasoning_effort=reasoning_effort,
                temperature=temperature,
                max_output_tokens=max_output_tokens,
            )
        return self._generate_openai_compatible_output(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=json_schema,
            structured_mode=structured_mode,
            reasoning_effort=reasoning_effort,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
        )

    def _generate_hosted_openai_output(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any],
        structured_mode: AIStructuredMode,
        reasoning_effort: AIReasoningEffort | None,
        temperature: float | None,
        max_output_tokens: int | None,
    ) -> _GenerationOutcome:
        responses = getattr(self._client, "responses", None)
        create = getattr(responses, "create", None)
        if not callable(create):
            raise ValueError(
                "AI transport error: Hosted OpenAI provider requires Responses API support on the active OpenAI SDK/client."
            )
        client_request_id = _new_client_request_id()
        parameter_capabilities = resolve_request_parameter_capabilities(
            provider_kind="openai",
            model=self.model,
        )
        request_payload = self._build_responses_request(
            model=self.model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=json_schema,
            structured_mode=structured_mode,
            reasoning_effort=reasoning_effort,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            include_temperature=parameter_capabilities.supports_temperature,
        )
        request_payload["extra_headers"] = {"X-Client-Request-Id": client_request_id}
        request_diagnostics = _build_request_diagnostics(
            transport="responses",
            endpoint_path=_RESPONSES_ENDPOINT_PATH,
            base_url=self.base_url,
            request_payload=request_payload,
            instruction_channel="instructions",
            instruction_role=None,
            client_request_id=client_request_id,
            response_parser="responses_output_text",
        )
        request_payload_raw = _serialize_payload_for_failure_capture(request_payload)
        raw_create = _resolve_raw_create(responses)
        response_diagnostics: dict[str, Any] | None = None
        try:
            if callable(raw_create):
                raw_response = raw_create(**request_payload)
                response = _parse_raw_response(raw_response)
                response_diagnostics = _extract_response_diagnostics(
                    transport="responses",
                    endpoint_path=_RESPONSES_ENDPOINT_PATH,
                    base_url=self.base_url,
                    raw_response=raw_response,
                    client_request_id=client_request_id,
                )
            else:
                response = create(**request_payload)
                response_diagnostics = _extract_response_diagnostics(
                    transport="responses",
                    endpoint_path=_RESPONSES_ENDPOINT_PATH,
                    base_url=self.base_url,
                    raw_response=response,
                    client_request_id=client_request_id,
                )
        except Exception as exc:
            raise _AttemptFailure(
                f"AI transport error: Responses API request failed: {exc}",
                transport="responses",
                request_payload=request_payload,
                response_received=False,
                request_payload_debug=_sanitize_for_evidence(request_payload),
                request_payload_raw=request_payload_raw,
                request_diagnostics=request_diagnostics,
                response_diagnostics=_extract_response_diagnostics_from_exception(
                    exc=exc,
                    transport="responses",
                    endpoint_path=_RESPONSES_ENDPOINT_PATH,
                    base_url=self.base_url,
                    client_request_id=client_request_id,
                ),
            ) from exc

        response_summary = _summarize_responses_response(response)
        response_payload_raw = _serialize_payload_for_failure_capture(response)
        try:
            content = _extract_responses_output_text(response)
        except Exception as exc:
            raise _AttemptFailure(
                str(exc),
                transport="responses",
                request_payload=request_payload,
                response_received=True,
                response_summary=response_summary,
                request_payload_debug=_sanitize_for_evidence(request_payload),
                response_payload_debug=_sanitize_for_evidence(response),
                request_payload_raw=request_payload_raw,
                response_payload_raw=response_payload_raw,
                request_diagnostics=request_diagnostics,
                response_diagnostics=response_diagnostics,
            ) from exc
        return _GenerationOutcome(
            transport="responses",
            request_payload=request_payload,
            response_summary=response_summary,
            content=content,
            request_payload_debug=_sanitize_for_evidence(request_payload),
            response_payload_debug=_sanitize_for_evidence(response),
            request_payload_raw=request_payload_raw,
            response_payload_raw=response_payload_raw,
            request_diagnostics=request_diagnostics,
            response_diagnostics=response_diagnostics,
        )

    def _generate_openai_compatible_output(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any],
        structured_mode: AIStructuredMode,
        reasoning_effort: AIReasoningEffort | None,
        temperature: float | None,
        max_output_tokens: int | None,
    ) -> _GenerationOutcome:
        client_request_id = _new_client_request_id()
        request_payload = self._build_chat_request(
            model=self.model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=json_schema,
            structured_mode=structured_mode,
            reasoning_effort=reasoning_effort,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
        )
        instruction_role = None
        messages = request_payload.get("messages")
        if isinstance(messages, list) and messages:
            first_message = messages[0]
            if isinstance(first_message, dict):
                role = first_message.get("role")
                if isinstance(role, str):
                    instruction_role = role
        request_payload["extra_headers"] = {"X-Client-Request-Id": client_request_id}
        request_diagnostics = _build_request_diagnostics(
            transport="chat_completions",
            endpoint_path=_CHAT_COMPLETIONS_ENDPOINT_PATH,
            base_url=self.base_url,
            request_payload=request_payload,
            instruction_channel="messages",
            instruction_role=instruction_role,
            client_request_id=client_request_id,
            response_parser="chat_message_content",
        )
        request_payload_raw = _serialize_payload_for_failure_capture(request_payload)
        completions = getattr(getattr(self._client, "chat", None), "completions", None)
        raw_create = _resolve_raw_create(completions)
        response_diagnostics: dict[str, Any] | None = None
        try:
            if callable(raw_create):
                raw_response = raw_create(**request_payload)
                response = _parse_raw_response(raw_response)
                response_diagnostics = _extract_response_diagnostics(
                    transport="chat_completions",
                    endpoint_path=_CHAT_COMPLETIONS_ENDPOINT_PATH,
                    base_url=self.base_url,
                    raw_response=raw_response,
                    client_request_id=client_request_id,
                )
            else:
                response = self._client.chat.completions.create(**request_payload)
                response_diagnostics = _extract_response_diagnostics(
                    transport="chat_completions",
                    endpoint_path=_CHAT_COMPLETIONS_ENDPOINT_PATH,
                    base_url=self.base_url,
                    raw_response=response,
                    client_request_id=client_request_id,
                )
        except Exception as exc:
            raise _AttemptFailure(
                f"AI transport error: Chat Completions request failed: {exc}",
                transport="chat_completions",
                request_payload=request_payload,
                response_received=False,
                request_payload_debug=_sanitize_for_evidence(request_payload),
                request_payload_raw=request_payload_raw,
                request_diagnostics=request_diagnostics,
                response_diagnostics=_extract_response_diagnostics_from_exception(
                    exc=exc,
                    transport="chat_completions",
                    endpoint_path=_CHAT_COMPLETIONS_ENDPOINT_PATH,
                    base_url=self.base_url,
                    client_request_id=client_request_id,
                ),
            ) from exc

        response_summary = _summarize_chat_response(response)
        response_payload_raw = _serialize_payload_for_failure_capture(response)
        try:
            content = _extract_message_content(response)
        except Exception as exc:
            raise _AttemptFailure(
                str(exc),
                transport="chat_completions",
                request_payload=request_payload,
                response_received=True,
                response_summary=response_summary,
                request_payload_debug=_sanitize_for_evidence(request_payload),
                response_payload_debug=_sanitize_for_evidence(response),
                request_payload_raw=request_payload_raw,
                response_payload_raw=response_payload_raw,
                request_diagnostics=request_diagnostics,
                response_diagnostics=response_diagnostics,
            ) from exc
        return _GenerationOutcome(
            transport="chat_completions",
            request_payload=request_payload,
            response_summary=response_summary,
            content=content,
            request_payload_debug=_sanitize_for_evidence(request_payload),
            response_payload_debug=_sanitize_for_evidence(response),
            request_payload_raw=request_payload_raw,
            response_payload_raw=response_payload_raw,
            request_diagnostics=request_diagnostics,
            response_diagnostics=response_diagnostics,
        )

    @staticmethod
    def _build_chat_request(
        *,
        model: str,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any],
        structured_mode: AIStructuredMode,
        reasoning_effort: AIReasoningEffort | None,
        temperature: float | None,
        max_output_tokens: int | None,
    ) -> dict[str, Any]:
        instruction_role = _resolve_chat_instruction_role(model=model)
        messages = [
            {"role": instruction_role, "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        request: dict[str, Any] = {
            "model": model,
            "messages": messages,
        }

        if structured_mode == "strict_json_schema":
            request["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "vaulthalla_release_changelog_draft",
                    "schema": json_schema,
                    "strict": True,
                },
            }
        elif structured_mode == "json_object":
            request["response_format"] = {"type": "json_object"}
        else:
            messages[0]["content"] = (
                f"{system_prompt}\n\nReturn only a valid JSON object with no prose or markdown."
            )

        if reasoning_effort is not None:
            request["reasoning"] = {"effort": reasoning_effort}
        if temperature is not None:
            request["temperature"] = temperature
        if max_output_tokens is not None:
            request["max_completion_tokens"] = max_output_tokens

        return request

    @staticmethod
    def _build_responses_request(
        *,
        model: str,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any],
        structured_mode: AIStructuredMode,
        reasoning_effort: AIReasoningEffort | None,
        temperature: float | None,
        max_output_tokens: int | None,
        include_temperature: bool,
    ) -> dict[str, Any]:
        effective_system_prompt = system_prompt
        if structured_mode == "prompt_json":
            effective_system_prompt = (
                f"{system_prompt}\n\nReturn only a valid JSON object with no prose or markdown."
            )

        request: dict[str, Any] = {
            "model": model,
            "instructions": effective_system_prompt,
            "input": [
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": user_prompt}],
                },
            ],
        }

        if structured_mode == "strict_json_schema":
            request["text"] = {
                "format": {
                    "type": "json_schema",
                    "name": "vaulthalla_release_changelog_draft",
                    "schema": json_schema,
                    "strict": True,
                }
            }
        elif structured_mode == "json_object":
            request["text"] = {"format": {"type": "json_object"}}

        if reasoning_effort is not None:
            request["reasoning"] = {"effort": reasoning_effort}
        if include_temperature and temperature is not None:
            request["temperature"] = temperature
        if max_output_tokens is not None:
            request["max_output_tokens"] = max_output_tokens

        return request


def _build_sdk_client(
    *,
    api_key: str,
    base_url: str | None = None,
    timeout_seconds: float | None = None,
) -> Any:
    try:
        from openai import OpenAI
    except Exception as exc:
        raise ValueError(
            "OpenAI SDK is not available in this environment. Install `openai` in the active venv."
        ) from exc
    kwargs: dict[str, Any] = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    if timeout_seconds is not None:
        kwargs["timeout"] = timeout_seconds
    return OpenAI(**kwargs)


def _extract_message_content(response: Any) -> str:
    choices = getattr(response, "choices", None)
    if not choices:
        raise ValueError("AI parse error: OpenAI response contained no choices.")

    message = getattr(choices[0], "message", None)
    if message is None:
        raise ValueError("AI parse error: OpenAI response choice contained no message.")

    refusal = getattr(message, "refusal", None)
    if refusal:
        raise ValueError(f"AI provider refusal: {refusal}")

    content = getattr(message, "content", None)
    if isinstance(content, str) and content.strip():
        return content

    # Some SDK variants may return content blocks instead of a raw string.
    if isinstance(content, list):
        blocks: list[str] = []
        for block in content:
            if isinstance(block, dict):
                text = block.get("text")
            else:
                text = getattr(block, "text", None)
            if isinstance(text, str) and text.strip():
                blocks.append(text)
        if blocks:
            return "".join(blocks)

    raise ValueError("AI parse error: OpenAI response did not include structured JSON content.")


def _extract_responses_output_text(response: Any) -> str:
    output_text = _extract_text_candidate(_read_response_field(response, "output_text"))
    if output_text is not None:
        return output_text

    response_status = _response_type_label(_read_response_field(response, "status"))
    incomplete_details = _read_response_field(response, "incomplete_details")
    incomplete_reason = _response_type_label(
        _read_response_field(incomplete_details, "reason")
    )
    output_items = _as_response_items(_read_response_field(response, "output"))
    text_chunks: list[str] = []
    text_seen: set[str] = set()
    json_chunks: list[str] = []
    json_seen: set[str] = set()
    refusal_chunks: list[str] = []
    item_types: set[str] = set()
    content_types: set[str] = set()

    for item in output_items:
        item_type = _response_type_label(_read_response_field(item, "type"))
        if item_type is not None:
            item_types.add(item_type)

        item_refusal = _extract_text_candidate(_read_response_field(item, "refusal"))
        if item_type == "refusal" or item_refusal is not None:
            refusal_chunks.append(item_refusal or "request refused")

        _append_unique(
            text_chunks,
            text_seen,
            _extract_text_candidate(_read_response_field(item, "text")),
        )
        _append_unique(
            text_chunks,
            text_seen,
            _extract_text_candidate(_read_response_field(item, "output_text")),
        )
        for field in _RESPONSES_JSON_CONTENT_FIELDS:
            _append_unique(
                json_chunks,
                json_seen,
                _extract_json_candidate(_read_response_field(item, field)),
            )

        for content_item in _as_response_items(_read_response_field(item, "content")):
            content_type = _response_type_label(_read_response_field(content_item, "type"))
            if content_type is not None:
                content_types.add(content_type)

            content_refusal = _extract_text_candidate(_read_response_field(content_item, "refusal"))
            if content_type == "refusal" or content_refusal is not None:
                refusal_chunks.append(content_refusal or "request refused")

            _append_unique(
                text_chunks,
                text_seen,
                _extract_text_candidate(_read_response_field(content_item, "text")),
            )
            _append_unique(
                text_chunks,
                text_seen,
                _extract_text_candidate(_read_response_field(content_item, "output_text")),
            )
            _append_unique(
                text_chunks,
                text_seen,
                _extract_text_candidate(_read_response_field(content_item, "summary")),
            )
            _append_unique(
                text_chunks,
                text_seen,
                _extract_text_candidate(_read_response_field(content_item, "reasoning")),
            )
            if content_type in _RESPONSES_TEXT_CONTENT_TYPES:
                _append_unique(
                    text_chunks,
                    text_seen,
                    _extract_text_candidate(content_item),
                )

            for field in _RESPONSES_JSON_CONTENT_FIELDS:
                _append_unique(
                    json_chunks,
                    json_seen,
                    _extract_json_candidate(_read_response_field(content_item, field)),
                )

    if text_chunks:
        return "".join(text_chunks)
    if json_chunks:
        return json_chunks[0]

    refusal_only = bool(refusal_chunks)
    if refusal_only:
        refusal_text = " | ".join(chunk for chunk in refusal_chunks if chunk.strip())
        raise ValueError(f"AI provider refusal: {refusal_text or 'request refused'}")

    raise ValueError(
        _format_responses_parse_error(
            item_types=item_types,
            content_types=content_types,
            saw_refusal=bool(refusal_chunks),
            saw_output=bool(output_items),
            response_status=response_status,
            incomplete_reason=incomplete_reason,
        )
    )


def _read_response_field(obj: Any, key: str) -> Any:
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def _as_response_items(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return list(value)
    return [value]


def _response_type_label(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        label = value.strip()
        return label or None
    return str(value)


def _extract_text_candidate(value: Any, *, depth: int = 0) -> str | None:
    if value is None or depth > 5:
        return None
    if isinstance(value, str):
        text = value.strip()
        return text if text else None
    if isinstance(value, (list, tuple)):
        chunks = [
            chunk
            for chunk in (_extract_text_candidate(item, depth=depth + 1) for item in value)
            if chunk is not None
        ]
        if chunks:
            return "".join(chunks)
        return None
    if isinstance(value, dict):
        for key in (
            "value",
            "text",
            "output_text",
            "summary_text",
            "reasoning_text",
            "summary",
            "reasoning",
            "content",
            "message",
        ):
            nested = value.get(key)
            extracted = _extract_text_candidate(nested, depth=depth + 1)
            if extracted is not None:
                return extracted
        return None

    for attr in (
        "value",
        "text",
        "output_text",
        "summary_text",
        "reasoning_text",
        "summary",
        "reasoning",
        "content",
        "message",
    ):
        nested = getattr(value, attr, None)
        if nested is None:
            continue
        extracted = _extract_text_candidate(nested, depth=depth + 1)
        if extracted is not None:
            return extracted
    return None


def _extract_json_candidate(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        try:
            dumped = model_dump(exclude_none=True)
        except TypeError:
            dumped = model_dump()
        if isinstance(dumped, (dict, list)):
            return json.dumps(dumped, ensure_ascii=False)
    return None


def _append_unique(buffer: list[str], seen: set[str], value: str | None) -> None:
    if value is None:
        return
    if value in seen:
        return
    seen.add(value)
    buffer.append(value)


def _format_responses_parse_error(
    *,
    item_types: set[str],
    content_types: set[str],
    saw_refusal: bool,
    saw_output: bool,
    response_status: str | None,
    incomplete_reason: str | None,
) -> str:
    item_types_label = ", ".join(sorted(item_types)) if item_types else "<none>"
    content_types_label = ", ".join(sorted(content_types)) if content_types else "<none>"
    response_status_label = response_status or "<none>"
    incomplete_reason_label = incomplete_reason or "<none>"
    return (
        "AI parse error: Responses API output had no extractable text or JSON content "
        f"(saw_output={saw_output}, item_types={item_types_label}, "
        f"content_types={content_types_label}, saw_refusal={saw_refusal}, "
        f"response_status={response_status_label}, incomplete_reason={incomplete_reason_label})."
    )


def _resolve_runtime_mode_chain(
    *,
    provider_kind: AIProviderKind,
    model: str,
    stage: AIStageName | None,
    mode_chain: tuple[AIStructuredMode, ...],
) -> tuple[AIStructuredMode, ...]:
    if not _is_hosted_gpt5_model(provider_kind=provider_kind, model=model):
        return mode_chain
    filtered = tuple(mode for mode in mode_chain if mode != "json_object")
    if not filtered:
        return mode_chain
    if stage == "triage":
        # For hosted GPT-5 triage, lead with prompt_json to maximize answer-start probability.
        ordered: list[AIStructuredMode] = []
        if "prompt_json" in filtered:
            ordered.append("prompt_json")
        if "strict_json_schema" in filtered:
            ordered.append("strict_json_schema")
        return tuple(ordered) if ordered else filtered
    if stage == "emergency_triage":
        # Emergency triage depends on strict 1:1 schema conformance (version + per-unit items),
        # so keep strict_json_schema first and only fall back to prompt_json on recoverable failure.
        ordered: list[AIStructuredMode] = []
        if "strict_json_schema" in filtered:
            ordered.append("strict_json_schema")
        if "prompt_json" in filtered:
            ordered.append("prompt_json")
        return tuple(ordered) if ordered else filtered
    if stage not in {"triage", "emergency_triage"}:
        return filtered
    return filtered


def _resolve_attempt_reasoning_effort(
    *,
    provider_kind: AIProviderKind,
    model: str,
    stage: AIStageName | None,
    structured_mode: AIStructuredMode,
    requested_reasoning_effort: AIReasoningEffort | None,
) -> AIReasoningEffort | None:
    if _is_hosted_gpt5_model(provider_kind=provider_kind, model=model) and stage in {"triage", "emergency_triage"}:
        # For hosted GPT-5 triage lanes, enforce explicit low reasoning to avoid opaque default effort.
        return requested_reasoning_effort or "low"
    return requested_reasoning_effort


def _resolve_attempt_max_output_tokens(
    *,
    provider_kind: AIProviderKind,
    model: str,
    stage: AIStageName | None,
    structured_mode: AIStructuredMode,
    requested_max_output_tokens: int | None,
) -> int | None:
    if requested_max_output_tokens is None:
        return None
    if _is_hosted_gpt5_model(provider_kind=provider_kind, model=model) and stage in {"triage", "emergency_triage"}:
        if structured_mode == "strict_json_schema":
            return max(requested_max_output_tokens, _HOSTED_TRIAGE_STRICT_MIN_OUTPUT_TOKENS)
        if structured_mode == "prompt_json":
            return max(requested_max_output_tokens, _HOSTED_TRIAGE_PROMPT_JSON_MIN_OUTPUT_TOKENS)
    if (
        _is_hosted_gpt5_model(provider_kind=provider_kind, model=model)
        and structured_mode == "prompt_json"
    ):
        return max(requested_max_output_tokens, _HOSTED_PROMPT_JSON_MIN_OUTPUT_TOKENS)
    return requested_max_output_tokens


def _is_hosted_gpt5_model(*, provider_kind: AIProviderKind, model: str) -> bool:
    return provider_kind == "openai" and model.strip().lower().startswith("gpt-5")


def _emit_generation_progress(*, stage: AIStageName | None, message: str) -> None:
    if stage != "emergency_triage":
        return
    if not _PROGRESS_LOG_ENABLED:
        return
    print(f"emergency_triage: {message}", file=sys.stderr, flush=True)


def _detect_likely_truncated_json(exc: JSONParseError) -> bool:
    truncated_markers = (
        "unterminated",
        "expecting value",
        "expecting ',' delimiter",
        "expecting property name",
    )
    for failure in exc.diagnostics.failures:
        lower = failure.reason.lower()
        if any(marker in lower for marker in truncated_markers):
            return True
    if not exc.diagnostics.candidates:
        return False
    first_candidate = exc.diagnostics.candidates[0].rstrip()
    if not first_candidate:
        return False
    return not first_candidate.endswith("}")


def _summarize_request_payload(
    *,
    request_payload: dict[str, Any],
    transport: str,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "transport": transport,
        "model": request_payload.get("model"),
    }
    if transport == "responses":
        text_cfg = request_payload.get("text")
        format_type: str | None = None
        if isinstance(text_cfg, dict):
            fmt_cfg = text_cfg.get("format")
            if isinstance(fmt_cfg, dict):
                raw = fmt_cfg.get("type")
                if isinstance(raw, str):
                    format_type = raw
        summary["format_type"] = format_type
        reasoning = request_payload.get("reasoning")
        if isinstance(reasoning, dict):
            summary["reasoning_effort"] = reasoning.get("effort")
        summary["temperature"] = request_payload.get("temperature")
        summary["max_output_tokens"] = request_payload.get("max_output_tokens")
        summary["input_messages"] = len(request_payload.get("input", [])) if isinstance(request_payload.get("input"), list) else 0
        return summary

    response_format = request_payload.get("response_format")
    format_type = None
    if isinstance(response_format, dict):
        raw = response_format.get("type")
        if isinstance(raw, str):
            format_type = raw
    summary["format_type"] = format_type
    reasoning = request_payload.get("reasoning")
    if isinstance(reasoning, dict):
        summary["reasoning_effort"] = reasoning.get("effort")
    summary["temperature"] = request_payload.get("temperature")
    summary["max_completion_tokens"] = request_payload.get("max_completion_tokens")
    summary["messages"] = len(request_payload.get("messages", [])) if isinstance(request_payload.get("messages"), list) else 0
    return summary


def _summarize_responses_response(response: Any) -> dict[str, Any]:
    output_text = _extract_text_candidate(_read_response_field(response, "output_text"))
    output_items = _as_response_items(_read_response_field(response, "output"))
    response_status = _response_type_label(_read_response_field(response, "status"))
    raw_incomplete_details = _read_response_field(response, "incomplete_details")
    incomplete_details = _sanitize_for_evidence(raw_incomplete_details)
    incomplete_reason = _response_type_label(_read_response_field(raw_incomplete_details, "reason"))
    stop_reason = _response_type_label(_read_response_field(response, "stop_reason"))
    usage = _sanitize_for_evidence(_read_response_field(response, "usage"))
    item_types: set[str] = set()
    content_types: set[str] = set()
    saw_refusal = False
    output_tokens: int | None = None
    reasoning_tokens: int | None = None

    if isinstance(usage, dict):
        output_tokens_raw = usage.get("output_tokens")
        if isinstance(output_tokens_raw, int):
            output_tokens = output_tokens_raw
        output_tokens_details = usage.get("output_tokens_details")
        if isinstance(output_tokens_details, dict):
            reasoning_tokens_raw = output_tokens_details.get("reasoning_tokens")
            if isinstance(reasoning_tokens_raw, int):
                reasoning_tokens = reasoning_tokens_raw

    for item in output_items:
        item_type = _response_type_label(_read_response_field(item, "type"))
        if item_type is not None:
            item_types.add(item_type)
        refusal_text = _extract_text_candidate(_read_response_field(item, "refusal"))
        if item_type == "refusal" or refusal_text is not None:
            saw_refusal = True
        for content_item in _as_response_items(_read_response_field(item, "content")):
            content_type = _response_type_label(_read_response_field(content_item, "type"))
            if content_type is not None:
                content_types.add(content_type)
            content_refusal = _extract_text_candidate(_read_response_field(content_item, "refusal"))
            if content_type == "refusal" or content_refusal is not None:
                saw_refusal = True

    all_output_tokens_reasoning = (
        output_tokens is not None
        and output_tokens > 0
        and reasoning_tokens is not None
        and reasoning_tokens >= output_tokens
    )
    answer_started = bool(
        output_text is not None
        or "message" in item_types
        or {"output_text", "text", "output_json", "json", "parsed"} & content_types
    )

    return {
        "response_status": response_status,
        "stop_reason": stop_reason,
        "incomplete_details": incomplete_details,
        "incomplete_reason": incomplete_reason,
        "output_text_present": output_text is not None,
        "output_text_preview": _truncate_text(output_text) if output_text is not None else None,
        "output_text_length": len(output_text) if output_text is not None else 0,
        "output_items_count": len(output_items),
        "output_item_types": sorted(item_types),
        "content_item_types": sorted(content_types),
        "answer_started": answer_started,
        "all_output_tokens_reasoning": all_output_tokens_reasoning,
        "saw_refusal": saw_refusal,
        "usage": usage,
    }


def _summarize_chat_response(response: Any) -> dict[str, Any]:
    choices = _as_response_items(_read_response_field(response, "choices"))
    first_choice = choices[0] if choices else None
    message = _read_response_field(first_choice, "message")
    refusal = _extract_text_candidate(_read_response_field(message, "refusal"))
    content = _read_response_field(message, "content")
    content_text = _extract_text_candidate(content)
    content_kind = type(content).__name__ if content is not None else None
    return {
        "choices_count": len(choices),
        "message_present": message is not None,
        "content_kind": content_kind,
        "content_preview": _truncate_text(content_text) if content_text is not None else None,
        "saw_refusal": refusal is not None,
        "refusal_preview": _truncate_text(refusal) if refusal is not None else None,
    }


def _sanitize_for_evidence(value: Any, *, depth: int = 0) -> Any:
    if depth > 7:
        return "<max-depth>"
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return _truncate_text(value)
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, raw in list(value.items())[:_EVIDENCE_LIST_LIMIT]:
            key_str = str(key)
            if _is_sensitive_key(key_str):
                out[key_str] = "<redacted>"
            else:
                out[key_str] = _sanitize_for_evidence(raw, depth=depth + 1)
        return out
    if isinstance(value, (list, tuple)):
        return [
            _sanitize_for_evidence(item, depth=depth + 1)
            for item in list(value)[:_EVIDENCE_LIST_LIMIT]
        ]

    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        try:
            dumped = model_dump(exclude_none=True)
        except TypeError:
            dumped = model_dump()
        return _sanitize_for_evidence(dumped, depth=depth + 1)

    to_dict = getattr(value, "to_dict", None)
    if callable(to_dict):
        return _sanitize_for_evidence(to_dict(), depth=depth + 1)

    return _truncate_text(repr(value))


def _truncate_text(value: str | None, *, limit: int = _EVIDENCE_STRING_LIMIT) -> str:
    if value is None:
        return ""
    if len(value) <= limit:
        return value
    return value[: limit - 3] + "..."


def _is_sensitive_key(key: str) -> bool:
    normalized = key.strip().lower().replace("-", "_")
    if normalized in _SECRET_KEY_EXACT_NAMES:
        return True
    return any(normalized.endswith(suffix) for suffix in _SECRET_KEY_SUFFIXES)


def _resolve_chat_instruction_role(*, model: str) -> str:
    normalized = model.strip().lower()
    if normalized.startswith("o"):
        return "developer"
    if normalized.startswith("gpt-"):
        return "developer"
    return "system"


def _new_client_request_id() -> str:
    return f"vaulthalla-{uuid4()}"


def _resolve_endpoint_url(*, base_url: str | None, endpoint_path: str) -> str:
    if not base_url:
        return f"{_DEFAULT_OPENAI_BASE_URL}{endpoint_path}"
    normalized = base_url.strip().rstrip("/")
    suffix = endpoint_path
    if normalized.endswith("/v1") and endpoint_path.startswith("/v1/"):
        suffix = endpoint_path[len("/v1") :]
    return f"{normalized}{suffix}"


def _resolve_raw_create(resource: Any) -> Any | None:
    with_raw_response = getattr(resource, "with_raw_response", None)
    if with_raw_response is None:
        return None
    create = getattr(with_raw_response, "create", None)
    if callable(create):
        return create
    return None


def _parse_raw_response(raw_response: Any) -> Any:
    parse = getattr(raw_response, "parse", None)
    if callable(parse):
        return parse()
    return raw_response


def _header_value(headers: Any, name: str) -> str | None:
    if headers is None:
        return None
    if hasattr(headers, "get"):
        value = headers.get(name)
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
    if isinstance(headers, dict):
        for key, value in headers.items():
            if str(key).lower() == name.lower():
                if isinstance(value, str):
                    stripped = value.strip()
                    return stripped if stripped else None
                return str(value)
    return None


def _build_request_diagnostics(
    *,
    transport: str,
    endpoint_path: str,
    base_url: str | None,
    request_payload: dict[str, Any],
    instruction_channel: str,
    instruction_role: str | None,
    client_request_id: str,
    response_parser: str,
) -> dict[str, Any]:
    return {
        "transport": transport,
        "endpoint_path": endpoint_path,
        "endpoint_url": _resolve_endpoint_url(base_url=base_url, endpoint_path=endpoint_path),
        "model": request_payload.get("model"),
        "instruction_channel": instruction_channel,
        "instruction_role": instruction_role,
        "response_parser": response_parser,
        "reasoning_present": isinstance(request_payload.get("reasoning"), dict),
        "temperature_present": "temperature" in request_payload,
        "max_output_tokens_present": (
            "max_output_tokens" in request_payload or "max_completion_tokens" in request_payload
        ),
        "client_request_id": client_request_id,
        "request_body": _sanitize_for_evidence(request_payload),
    }


def _extract_response_diagnostics(
    *,
    transport: str,
    endpoint_path: str,
    base_url: str | None,
    raw_response: Any,
    client_request_id: str,
) -> dict[str, Any]:
    status_code_raw = getattr(raw_response, "status_code", None)
    status_code = status_code_raw if isinstance(status_code_raw, int) else None
    headers = getattr(raw_response, "headers", None)
    x_request_id = _header_value(headers, "x-request-id")
    x_client_request_id = _header_value(headers, "x-client-request-id")
    body: Any | None = None
    if status_code is not None and status_code >= 400:
        body = _extract_http_body(raw_response)
    return {
        "transport": transport,
        "endpoint_path": endpoint_path,
        "endpoint_url": _resolve_endpoint_url(base_url=base_url, endpoint_path=endpoint_path),
        "http_status": status_code,
        "x_request_id": x_request_id,
        "x_client_request_id": x_client_request_id or client_request_id,
        "response_body_non_2xx": _sanitize_for_evidence(body) if body is not None else None,
    }


def _extract_response_diagnostics_from_exception(
    *,
    exc: Exception,
    transport: str,
    endpoint_path: str,
    base_url: str | None,
    client_request_id: str,
) -> dict[str, Any]:
    status_code_raw = getattr(exc, "status_code", None)
    status_code = status_code_raw if isinstance(status_code_raw, int) else None
    request_id_raw = getattr(exc, "request_id", None)
    request_id = request_id_raw if isinstance(request_id_raw, str) else None
    body = getattr(exc, "body", None)
    response = getattr(exc, "response", None)
    x_client_request_id: str | None = client_request_id

    if response is not None:
        response_status = getattr(response, "status_code", None)
        if isinstance(response_status, int):
            status_code = response_status
        headers = getattr(response, "headers", None)
        response_request_id = _header_value(headers, "x-request-id")
        if response_request_id is not None:
            request_id = response_request_id
        response_client_request_id = _header_value(headers, "x-client-request-id")
        if response_client_request_id is not None:
            x_client_request_id = response_client_request_id
        if body is None:
            body = _extract_http_body(response)

    return {
        "transport": transport,
        "endpoint_path": endpoint_path,
        "endpoint_url": _resolve_endpoint_url(base_url=base_url, endpoint_path=endpoint_path),
        "http_status": status_code,
        "x_request_id": request_id,
        "x_client_request_id": x_client_request_id,
        "response_body_non_2xx": _sanitize_for_evidence(body) if body is not None else None,
        "exception_type": exc.__class__.__name__,
    }


def _extract_http_body(response: Any) -> Any | None:
    json_method = getattr(response, "json", None)
    if callable(json_method):
        try:
            return json_method()
        except Exception:
            pass

    text_attr = getattr(response, "text", None)
    if isinstance(text_attr, str):
        return text_attr
    if callable(text_attr):
        try:
            value = text_attr()
            if isinstance(value, str):
                return value
        except Exception:
            return None
    return None


def _serialize_payload_for_failure_capture(value: Any, *, depth: int = 0) -> Any:
    if depth > 20:
        return "<max-depth>"
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, dict):
        return {
            str(key): _serialize_payload_for_failure_capture(item, depth=depth + 1)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [_serialize_payload_for_failure_capture(item, depth=depth + 1) for item in value]

    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        try:
            dumped = model_dump(exclude_none=True)
        except TypeError:
            dumped = model_dump()
        return _serialize_payload_for_failure_capture(dumped, depth=depth + 1)

    to_dict = getattr(value, "to_dict", None)
    if callable(to_dict):
        return _serialize_payload_for_failure_capture(to_dict(), depth=depth + 1)

    return repr(value)


def _safe_json_clone(value: Any) -> Any:
    return json.loads(json.dumps(value))


def _is_mode_recoverable_error(message: str) -> bool:
    lower = message.lower()
    return any(marker in lower for marker in _MODE_RECOVERABLE_ERROR_MARKERS) or "ai parse error" in lower
