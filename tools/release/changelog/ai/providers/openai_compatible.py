from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from tools.release.changelog.ai.config import (
    AIReasoningEffort,
    AIStageName,
    AIStructuredMode,
    DEFAULT_AI_DRAFT_MODEL,
    OPENAI_API_KEY_ENV_VAR,
)
from tools.release.changelog.ai.providers.base import StructuredJSONProvider
from tools.release.changelog.ai.providers.capabilities import ProviderCapabilities, get_provider_capabilities
from tools.release.changelog.ai.providers.openai import OpenAIProvider


class OpenAICompatibleProvider(StructuredJSONProvider):
    """OpenAI-compatible transport for local or self-hosted endpoints."""

    def __init__(
        self,
        *,
        model: str = DEFAULT_AI_DRAFT_MODEL,
        base_url: str,
        api_key: str | None = None,
        api_key_env_var: str = OPENAI_API_KEY_ENV_VAR,
        timeout_seconds: float | None = None,
        sdk_client: Any | None = None,
    ) -> None:
        normalized_base_url = base_url.strip()
        if not normalized_base_url:
            raise ValueError("OpenAI-compatible provider requires a non-empty `base_url`.")
        parsed = urlparse(normalized_base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError(
                "OpenAI-compatible provider `base_url` must be an absolute http(s) URL, e.g. "
                "`http://localhost:8888/v1`."
            )
        self._delegate = OpenAIProvider(
            model=model,
            provider_kind="openai-compatible",
            api_key=api_key,
            api_key_env_var=api_key_env_var,
            base_url=normalized_base_url,
            timeout_seconds=timeout_seconds,
            require_api_key=False,
            sdk_client=sdk_client,
        )
        self.provider_kind = "openai-compatible"

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
        return self._delegate.generate_structured_json(
            stage=stage,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=json_schema,
            reasoning_effort=reasoning_effort,
            structured_mode=structured_mode,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
        )

    def list_models(self) -> list[str]:
        return self._delegate.list_models()

    def capabilities(self) -> ProviderCapabilities:
        return get_provider_capabilities("openai-compatible")

    def failure_evidence_snapshot(self) -> dict[str, Any] | None:
        return self._delegate.failure_evidence_snapshot()
