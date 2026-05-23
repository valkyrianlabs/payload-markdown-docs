from __future__ import annotations

import json
from typing import Any

from tools.release.changelog.ai.config import (
    AIMaxOutputTokensPolicy,
    AIProviderKind,
    AIReasoningEffort,
    AIStructuredMode,
    DEFAULT_STAGE_MAX_OUTPUT_TOKENS,
    DEFAULT_AI_TRIAGE_MODEL,
    compute_max_output_tokens,
    estimate_input_size_units,
)
from tools.release.changelog.ai.contracts.triage import (
    AITriageResult,
    ai_triage_result_to_dict,
    parse_ai_triage_response,
    resolve_triage_response_json_schema,
)
from tools.release.changelog.ai.prompts.triage import (
    TriageInputMode,
    build_triage_system_prompt,
    build_triage_user_prompt,
)
from tools.release.changelog.ai.providers.base import StructuredJSONProvider
from tools.release.changelog.ai.providers.openai import OpenAIProvider


def run_triage_stage(
    payload: dict[str, Any],
    *,
    model: str | None = None,
    provider: StructuredJSONProvider | None = None,
    provider_kind: AIProviderKind = "openai",
    reasoning_effort: AIReasoningEffort | None = None,
    structured_mode: AIStructuredMode | None = None,
    temperature: float | None = None,
    max_output_tokens_policy: AIMaxOutputTokensPolicy | None = None,
    input_mode: TriageInputMode = "raw_semantic",
) -> AITriageResult:
    active_provider = provider or OpenAIProvider(model=model or DEFAULT_AI_TRIAGE_MODEL, provider_kind=provider_kind)
    resolved_model = model
    if resolved_model is None:
        provider_model = getattr(active_provider, "model", None)
        if isinstance(provider_model, str) and provider_model.strip():
            resolved_model = provider_model.strip()
        else:
            resolved_model = DEFAULT_AI_TRIAGE_MODEL
    hosted_compact_mode = provider_kind == "openai" and resolved_model.strip().lower().startswith("gpt-5")
    system_prompt = build_triage_system_prompt(
        hosted_compact_mode=hosted_compact_mode,
        input_mode=input_mode,
    )
    user_prompt = build_triage_user_prompt(
        payload,
        hosted_compact_mode=hosted_compact_mode,
        input_mode=input_mode,
    )
    response_schema = resolve_triage_response_json_schema(
        provider_kind=provider_kind,
        model=resolved_model,
    )
    policy = max_output_tokens_policy or DEFAULT_STAGE_MAX_OUTPUT_TOKENS["triage"]
    max_output_tokens = compute_max_output_tokens(
        policy,
        input_size=estimate_input_size_units(system_prompt, user_prompt),
    )
    structured = active_provider.generate_structured_json(
        stage="triage",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        json_schema=response_schema,
        reasoning_effort=reasoning_effort,
        structured_mode=structured_mode,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )
    return parse_ai_triage_response(structured)


def render_triage_result_json(result: AITriageResult) -> str:
    return json.dumps(ai_triage_result_to_dict(result), indent=2, sort_keys=False) + "\n"
