from __future__ import annotations

import json
from typing import Any

from tools.release.changelog.ai.config import (
    AIMaxOutputTokensPolicy,
    AIProviderKind,
    AIReasoningEffort,
    AIStructuredMode,
    DEFAULT_AI_POLISH_MODEL,
    DEFAULT_STAGE_MAX_OUTPUT_TOKENS,
    compute_max_output_tokens,
    estimate_input_size_units,
)
from tools.release.changelog.ai.contracts.draft import AIDraftResult
from tools.release.changelog.ai.contracts.polish import (
    AI_POLISH_RESPONSE_JSON_SCHEMA,
    AIPolishResult,
    ai_polish_result_to_dict,
    build_polish_input_payload,
    parse_ai_polish_response,
)
from tools.release.changelog.ai.prompts.polish import build_polish_system_prompt, build_polish_user_prompt
from tools.release.changelog.ai.providers.base import StructuredJSONProvider
from tools.release.changelog.ai.providers.openai import OpenAIProvider


def run_polish_stage(
    draft: AIDraftResult,
    *,
    model: str | None = None,
    provider: StructuredJSONProvider | None = None,
    provider_kind: AIProviderKind = "openai",
    reasoning_effort: AIReasoningEffort | None = None,
    structured_mode: AIStructuredMode | None = None,
    temperature: float | None = None,
    max_output_tokens_policy: AIMaxOutputTokensPolicy | None = None,
) -> AIPolishResult:
    active_provider = provider or OpenAIProvider(model=model or DEFAULT_AI_POLISH_MODEL, provider_kind=provider_kind)
    draft_payload = build_polish_input_payload(draft)
    system_prompt = build_polish_system_prompt()
    user_prompt = build_polish_user_prompt(draft_payload)
    policy = max_output_tokens_policy or DEFAULT_STAGE_MAX_OUTPUT_TOKENS["polish"]
    max_output_tokens = compute_max_output_tokens(
        policy,
        input_size=estimate_input_size_units(system_prompt, user_prompt),
    )
    structured = active_provider.generate_structured_json(
        stage="polish",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        json_schema=AI_POLISH_RESPONSE_JSON_SCHEMA,
        reasoning_effort=reasoning_effort,
        structured_mode=structured_mode,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )
    return parse_ai_polish_response(structured)


def render_polish_result_json(result: AIPolishResult) -> str:
    return json.dumps(ai_polish_result_to_dict(result), indent=2, sort_keys=False) + "\n"
