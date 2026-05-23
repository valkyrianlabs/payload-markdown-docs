from __future__ import annotations

import json
from typing import Any

from tools.release.changelog.ai.config import (
    AIMaxOutputTokensPolicy,
    AIProviderKind,
    AIReasoningEffort,
    AIStructuredMode,
    DEFAULT_AI_DRAFT_MODEL,
    DEFAULT_STAGE_MAX_OUTPUT_TOKENS,
    compute_max_output_tokens,
    estimate_input_size_units,
)
from tools.release.changelog.ai.contracts.draft import (
    AI_DRAFT_RESPONSE_JSON_SCHEMA,
    AIDraftResult,
    ai_draft_result_to_dict,
    parse_ai_draft_response,
)
from tools.release.changelog.ai.prompts.draft import build_draft_system_prompt, build_draft_user_prompt
from tools.release.changelog.ai.providers.base import StructuredJSONProvider
from tools.release.changelog.ai.providers.openai import OpenAIProvider


def generate_draft_from_payload(
    payload: dict[str, Any],
    *,
    model: str | None = None,
    provider: StructuredJSONProvider | None = None,
    source_kind: str = "payload",
    provider_kind: AIProviderKind = "openai",
    reasoning_effort: AIReasoningEffort | None = None,
    structured_mode: AIStructuredMode | None = None,
    temperature: float | None = None,
    max_output_tokens_policy: AIMaxOutputTokensPolicy | None = None,
) -> AIDraftResult:
    active_provider = provider or OpenAIProvider(model=model or DEFAULT_AI_DRAFT_MODEL, provider_kind=provider_kind)
    system_prompt = build_draft_system_prompt()
    user_prompt = build_draft_user_prompt(payload, source_kind=source_kind)
    policy = max_output_tokens_policy or DEFAULT_STAGE_MAX_OUTPUT_TOKENS["draft"]
    max_output_tokens = compute_max_output_tokens(
        policy,
        input_size=estimate_input_size_units(system_prompt, user_prompt),
    )
    structured = active_provider.generate_structured_json(
        stage="draft",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        json_schema=AI_DRAFT_RESPONSE_JSON_SCHEMA,
        reasoning_effort=reasoning_effort,
        structured_mode=structured_mode,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )
    return parse_ai_draft_response(structured)


def render_draft_result_json(draft: AIDraftResult) -> str:
    return json.dumps(ai_draft_result_to_dict(draft), indent=2, sort_keys=False) + "\n"
