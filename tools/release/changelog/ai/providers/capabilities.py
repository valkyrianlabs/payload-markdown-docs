from __future__ import annotations

from dataclasses import dataclass

from tools.release.changelog.ai.config import (
    AIProviderKind,
    AIReasoningEffort,
    AIStructuredMode,
    VALID_REASONING_EFFORTS,
    VALID_STRUCTURED_MODES,
)

STRUCTURED_MODE_FALLBACK_ORDER: tuple[AIStructuredMode, ...] = (
    "strict_json_schema",
    "json_object",
    "prompt_json",
)


@dataclass(frozen=True)
class ProviderCapabilities:
    provider_kind: AIProviderKind
    supports_reasoning_effort: bool
    supports_strict_schema: bool
    default_structured_mode: AIStructuredMode


@dataclass(frozen=True)
class ResolvedGenerationSettings:
    structured_mode: AIStructuredMode
    reasoning_effort: AIReasoningEffort | None
    degradations: tuple[str, ...] = ()


@dataclass(frozen=True)
class RequestParameterCapabilities:
    provider_kind: AIProviderKind
    model: str
    supports_temperature: bool


def get_provider_capabilities(provider_kind: AIProviderKind) -> ProviderCapabilities:
    if provider_kind == "openai":
        return ProviderCapabilities(
            provider_kind=provider_kind,
            supports_reasoning_effort=True,
            supports_strict_schema=True,
            default_structured_mode="strict_json_schema",
        )

    if provider_kind == "openai-compatible":
        return ProviderCapabilities(
            provider_kind=provider_kind,
            supports_reasoning_effort=False,
            supports_strict_schema=False,
            default_structured_mode="json_object",
        )

    raise ValueError(f"Unsupported AI provider kind: {provider_kind}")


def resolve_generation_settings(
    *,
    provider_kind: AIProviderKind,
    requested_structured_mode: AIStructuredMode | None = None,
    requested_reasoning_effort: AIReasoningEffort | None = None,
) -> ResolvedGenerationSettings:
    capabilities = get_provider_capabilities(provider_kind)
    degradations: list[str] = []

    explicit_structured_mode = requested_structured_mode is not None
    if requested_structured_mode is not None:
        _validate_structured_mode(requested_structured_mode)
        structured_mode: AIStructuredMode = requested_structured_mode
    else:
        structured_mode = capabilities.default_structured_mode

    if (
        structured_mode == "strict_json_schema"
        and not capabilities.supports_strict_schema
        and not explicit_structured_mode
    ):
        structured_mode = "json_object"
        degradations.append(
            "strict_json_schema unsupported by provider; downgraded to json_object."
        )
    elif structured_mode == "strict_json_schema" and not capabilities.supports_strict_schema:
        degradations.append(
            "strict_json_schema requested on provider without strict-schema guarantees; runtime fallback enabled."
        )

    if requested_reasoning_effort is not None:
        _validate_reasoning_effort(requested_reasoning_effort)

    reasoning_effort = requested_reasoning_effort
    if reasoning_effort is not None and not capabilities.supports_reasoning_effort:
        reasoning_effort = None
        degradations.append(
            "reasoning_effort unsupported by provider; omitted from request."
        )

    return ResolvedGenerationSettings(
        structured_mode=structured_mode,
        reasoning_effort=reasoning_effort,
        degradations=tuple(degradations),
    )


def build_structured_mode_fallback_chain(
    initial_mode: AIStructuredMode,
) -> tuple[AIStructuredMode, ...]:
    _validate_structured_mode(initial_mode)
    start_index = STRUCTURED_MODE_FALLBACK_ORDER.index(initial_mode)
    return STRUCTURED_MODE_FALLBACK_ORDER[start_index:]


def resolve_request_parameter_capabilities(
    *,
    provider_kind: AIProviderKind,
    model: str,
) -> RequestParameterCapabilities:
    supports_temperature = True
    normalized_model = model.strip().lower()
    if provider_kind == "openai" and normalized_model.startswith("gpt-5"):
        # GPT-5 reasoning flows are tuned via `reasoning` controls, not `temperature`.
        supports_temperature = False
    return RequestParameterCapabilities(
        provider_kind=provider_kind,
        model=model,
        supports_temperature=supports_temperature,
    )


def _validate_structured_mode(value: str) -> None:
    if value not in VALID_STRUCTURED_MODES:
        allowed = ", ".join(VALID_STRUCTURED_MODES)
        raise ValueError(f"Invalid structured mode `{value}`. Expected one of {allowed}.")


def _validate_reasoning_effort(value: str) -> None:
    if value not in VALID_REASONING_EFFORTS:
        allowed = ", ".join(VALID_REASONING_EFFORTS)
        raise ValueError(f"Invalid reasoning effort `{value}`. Expected one of {allowed}.")
