from dataclasses import dataclass

from tools.release.changelog.ai.config import AIProviderConfig, DEFAULT_OPENAI_COMPATIBLE_BASE_URL
from tools.release.changelog.ai.providers.base import ModelDiscoveryProvider, StructuredJSONProvider
from tools.release.changelog.ai.providers.capabilities import (
    ProviderCapabilities,
    RequestParameterCapabilities,
    ResolvedGenerationSettings,
    build_structured_mode_fallback_chain,
    get_provider_capabilities,
    resolve_request_parameter_capabilities,
    resolve_generation_settings,
)
from tools.release.changelog.ai.providers.openai import OpenAIProvider
from tools.release.changelog.ai.providers.openai_compatible import OpenAICompatibleProvider


def build_structured_json_provider(config: AIProviderConfig) -> StructuredJSONProvider:
    model = _normalize_requested_model(config.model)

    if config.kind == "openai":
        if config.base_url:
            raise ValueError("`--base-url` is only valid when `--provider openai-compatible` is used.")
        return OpenAIProvider(
            model=model,
            provider_kind="openai",
            api_key=config.api_key,
            api_key_env_var=config.api_key_env_var,
            timeout_seconds=config.timeout_seconds,
        )

    if config.kind == "openai-compatible":
        return OpenAICompatibleProvider(
            model=model,
            base_url=config.base_url or DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
            api_key=config.api_key,
            api_key_env_var=config.api_key_env_var,
            timeout_seconds=config.timeout_seconds,
        )

    raise ValueError(f"Unsupported AI provider kind: {config.kind}")


@dataclass(frozen=True)
class ProviderPreflightResult:
    provider_kind: str
    model: str
    base_url: str | None
    discovered_models: tuple[str, ...]
    model_found: bool


def run_provider_preflight(
    config: AIProviderConfig,
    *,
    provider: StructuredJSONProvider | None = None,
    require_model: bool = True,
) -> ProviderPreflightResult:
    model = _normalize_requested_model(config.model)
    endpoint = config.base_url or DEFAULT_OPENAI_COMPATIBLE_BASE_URL
    active_provider = provider or build_structured_json_provider(config)

    if not hasattr(active_provider, "list_models"):
        raise ValueError("Configured provider does not support model discovery preflight checks.")

    try:
        discovered_models = tuple(active_provider.list_models())  # type: ignore[attr-defined]
    except Exception as exc:
        if config.kind == "openai-compatible":
            raise ValueError(
                f"Could not reach OpenAI-compatible endpoint at {endpoint}: {exc}"
            ) from exc
        raise ValueError(f"OpenAI provider preflight failed: {exc}") from exc

    model_found = model in discovered_models if discovered_models else False
    if require_model and discovered_models and not model_found:
        shown = ", ".join(discovered_models[:10])
        suffix = " ..." if len(discovered_models) > 10 else ""
        raise ValueError(
            f"Model `{model}` is not listed by provider {config.kind}. "
            f"Available models: {shown}{suffix}"
        )

    return ProviderPreflightResult(
        provider_kind=config.kind,
        model=model,
        base_url=config.base_url,
        discovered_models=discovered_models,
        model_found=model_found,
    )


def _normalize_requested_model(model: str) -> str:
    normalized = model.strip()
    if not normalized:
        raise ValueError("`--model` must be a non-empty model name.")
    return normalized


__all__ = [
    "StructuredJSONProvider",
    "ModelDiscoveryProvider",
    "OpenAIProvider",
    "OpenAICompatibleProvider",
    "build_structured_json_provider",
    "ProviderPreflightResult",
    "run_provider_preflight",
    "ProviderCapabilities",
    "RequestParameterCapabilities",
    "ResolvedGenerationSettings",
    "get_provider_capabilities",
    "resolve_request_parameter_capabilities",
    "resolve_generation_settings",
    "build_structured_mode_fallback_chain",
]
