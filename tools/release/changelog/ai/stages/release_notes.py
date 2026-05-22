from __future__ import annotations

import json

from tools.release.changelog.ai.config import (
    AIMaxOutputTokensPolicy,
    AIProviderKind,
    AIReasoningEffort,
    AIStructuredMode,
    DEFAULT_AI_RELEASE_NOTES_MODEL,
    DEFAULT_STAGE_MAX_OUTPUT_TOKENS,
    compute_max_output_tokens,
    estimate_input_size_units,
)
from tools.release.changelog.ai.contracts.release_notes import (
    AI_RELEASE_NOTES_RESPONSE_JSON_SCHEMA,
    AIReleaseNotesResult,
    ai_release_notes_result_to_dict,
    parse_ai_release_notes_response,
)
from tools.release.changelog.ai.prompts.release_notes import (
    build_release_notes_system_prompt,
    build_release_notes_user_prompt,
)
from tools.release.changelog.ai.providers.base import StructuredJSONProvider
from tools.release.changelog.ai.providers.openai import OpenAIProvider


def run_release_notes_stage(
    changelog_markdown: str,
    *,
    model: str | None = None,
    provider: StructuredJSONProvider | None = None,
    provider_kind: AIProviderKind = "openai",
    reasoning_effort: AIReasoningEffort | None = None,
    structured_mode: AIStructuredMode | None = None,
    temperature: float | None = None,
    max_output_tokens_policy: AIMaxOutputTokensPolicy | None = None,
) -> AIReleaseNotesResult:
    active_provider = provider or OpenAIProvider(
        model=model or DEFAULT_AI_RELEASE_NOTES_MODEL,
        provider_kind=provider_kind,
    )
    system_prompt = build_release_notes_system_prompt()
    user_prompt = build_release_notes_user_prompt(changelog_markdown)
    policy = max_output_tokens_policy or DEFAULT_STAGE_MAX_OUTPUT_TOKENS["release_notes"]
    max_output_tokens = compute_max_output_tokens(
        policy,
        input_size=estimate_input_size_units(system_prompt, user_prompt),
    )
    structured = active_provider.generate_structured_json(
        stage="release_notes",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        json_schema=AI_RELEASE_NOTES_RESPONSE_JSON_SCHEMA,
        reasoning_effort=reasoning_effort,
        structured_mode=structured_mode,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )
    return parse_ai_release_notes_response(structured)


def render_release_notes_result_json(result: AIReleaseNotesResult) -> str:
    return json.dumps(ai_release_notes_result_to_dict(result), indent=2, sort_keys=False) + "\n"
