from __future__ import annotations

from typing import Any, Protocol

from tools.release.changelog.ai.config import AIReasoningEffort, AIStageName, AIStructuredMode
from tools.release.changelog.ai.providers.capabilities import ProviderCapabilities


class StructuredJSONProvider(Protocol):
    provider_kind: str

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
        ...

    def capabilities(self) -> ProviderCapabilities:
        ...


class ModelDiscoveryProvider(Protocol):
    def list_models(self) -> list[str]:
        ...
