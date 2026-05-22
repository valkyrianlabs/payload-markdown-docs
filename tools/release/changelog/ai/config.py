from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import yaml

OPENAI_API_KEY_ENV_VAR = "OPENAI_API_KEY"
DEFAULT_AI_DRAFT_MODEL = "gpt-5.4-mini"
DEFAULT_AI_TRIAGE_MODEL = DEFAULT_AI_DRAFT_MODEL
DEFAULT_AI_EMERGENCY_TRIAGE_MODEL = DEFAULT_AI_TRIAGE_MODEL
DEFAULT_AI_POLISH_MODEL = DEFAULT_AI_DRAFT_MODEL
DEFAULT_AI_RELEASE_NOTES_MODEL = DEFAULT_AI_DRAFT_MODEL
DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "http://localhost:8888/v1"
DEFAULT_AI_PROVIDER_KIND = "openai"
AI_PROFILE_SCHEMA_VERSION = "vaulthalla.release.ai_profile.v1"
STAGE_EXECUTION_ORDER: tuple["AIStageName", ...] = (
    "emergency_triage",
    "triage",
    "draft",
    "polish",
    "release_notes",
)
DEFAULT_STAGE_TEMPERATURES: dict["AIStageName", float] = {
    "emergency_triage": 0.0,
    "triage": 0.0,
    "draft": 0.2,
    "polish": 0.0,
    "release_notes": 0.0,
}

VALID_REASONING_EFFORTS = ("minimal", "low", "medium", "high", "xhigh")
VALID_STRUCTURED_MODES = ("strict_json_schema", "json_object", "prompt_json")

AIProviderKind = Literal["openai", "openai-compatible"]
AIReasoningEffort = Literal["minimal", "low", "medium", "high", "xhigh"]
AIStructuredMode = Literal["strict_json_schema", "json_object", "prompt_json"]


@dataclass(frozen=True)
class AIDynamicRatioTokenBudget:
    mode: Literal["dynamic_ratio"]
    ratio: float
    min: int
    max: int


AIMaxOutputTokensPolicy = int | AIDynamicRatioTokenBudget
DEFAULT_STAGE_MAX_OUTPUT_TOKENS: dict["AIStageName", AIMaxOutputTokensPolicy] = {
    "emergency_triage": AIDynamicRatioTokenBudget(mode="dynamic_ratio", ratio=0.55, min=1200, max=12000),
    "triage": 300,
    "draft": AIDynamicRatioTokenBudget(mode="dynamic_ratio", ratio=0.35, min=800, max=4000),
    "polish": 800,
    "release_notes": 1200,
}


@dataclass(frozen=True)
class AIDraftStageConfig:
    model: str = DEFAULT_AI_DRAFT_MODEL
    api_key_env_var: str = OPENAI_API_KEY_ENV_VAR


@dataclass(frozen=True)
class AITriageStageConfig:
    model: str = DEFAULT_AI_TRIAGE_MODEL
    api_key_env_var: str = OPENAI_API_KEY_ENV_VAR


@dataclass(frozen=True)
class AIEmergencyTriageStageConfig:
    model: str = DEFAULT_AI_EMERGENCY_TRIAGE_MODEL
    api_key_env_var: str = OPENAI_API_KEY_ENV_VAR


@dataclass(frozen=True)
class AIPolishStageConfig:
    model: str = DEFAULT_AI_POLISH_MODEL
    api_key_env_var: str = OPENAI_API_KEY_ENV_VAR


@dataclass(frozen=True)
class AIProviderConfig:
    kind: AIProviderKind = DEFAULT_AI_PROVIDER_KIND
    model: str = DEFAULT_AI_DRAFT_MODEL
    base_url: str | None = None
    api_key_env_var: str = OPENAI_API_KEY_ENV_VAR
    api_key: str | None = None
    timeout_seconds: float | None = None


AIStageName = Literal["emergency_triage", "triage", "draft", "polish", "release_notes"]


@dataclass(frozen=True)
class AIPipelineStageConfig:
    model: str
    reasoning_effort: AIReasoningEffort | None = None
    structured_mode: AIStructuredMode | None = None
    temperature: float = 0.0
    max_output_tokens: AIMaxOutputTokensPolicy = 300


@dataclass(frozen=True)
class AIPipelineConfig:
    provider: AIProviderKind
    base_url: str | None
    fallback_model: str
    stages: dict[AIStageName, AIPipelineStageConfig]
    enabled_stages: tuple[AIStageName, ...]
    profile_slug: str | None = None

    def stage_model(self, stage: AIStageName) -> str:
        return self.stages[stage].model

    def is_stage_enabled(self, stage: AIStageName) -> bool:
        return stage in self.enabled_stages

    def provider_config_for_stage(self, stage: AIStageName) -> AIProviderConfig:
        return AIProviderConfig(
            kind=self.provider,
            model=self.stage_model(stage),
            base_url=self.base_url,
        )


@dataclass(frozen=True)
class AIPipelineCLIOverrides:
    provider: AIProviderKind | None = None
    base_url: str | None = None
    model: str | None = None


DEFAULT_AI_PROFILE_PATH = Path("ai.yml")


def resolve_ai_pipeline_config(
    *,
    repo_root: Path,
    profile_slug: str | None,
    cli_overrides: AIPipelineCLIOverrides,
) -> AIPipelineConfig:
    provider: AIProviderKind = DEFAULT_AI_PROVIDER_KIND
    base_url: str | None = None
    fallback_model = DEFAULT_AI_DRAFT_MODEL
    stage_models: dict[AIStageName, str | None] = {
        "emergency_triage": DEFAULT_AI_EMERGENCY_TRIAGE_MODEL,
        "triage": DEFAULT_AI_TRIAGE_MODEL,
        "draft": DEFAULT_AI_DRAFT_MODEL,
        "polish": DEFAULT_AI_POLISH_MODEL,
        "release_notes": DEFAULT_AI_RELEASE_NOTES_MODEL,
    }
    stage_reasoning: dict[AIStageName, AIReasoningEffort | None] = {
        "emergency_triage": None,
        "triage": None,
        "draft": None,
        "polish": None,
        "release_notes": None,
    }
    stage_structured_modes: dict[AIStageName, AIStructuredMode | None] = {
        "emergency_triage": None,
        "triage": None,
        "draft": None,
        "polish": None,
        "release_notes": None,
    }
    stage_temperatures: dict[AIStageName, float] = dict(DEFAULT_STAGE_TEMPERATURES)
    stage_max_output_tokens: dict[AIStageName, AIMaxOutputTokensPolicy] = dict(DEFAULT_STAGE_MAX_OUTPUT_TOKENS)
    enabled_stages: set[AIStageName] = {"draft"}

    if profile_slug:
        profile = _load_profile(repo_root / DEFAULT_AI_PROFILE_PATH, profile_slug)
        provider = _read_provider(profile.get("provider"), path=f"profiles.{profile_slug}.provider")
        base_url = _read_optional_non_empty_string(profile.get("base_url"), path=f"profiles.{profile_slug}.base_url")
        explicitly_configured_stages: set[AIStageName] = set()
        profile_fallback = _read_optional_non_empty_string(profile.get("model"), path=f"profiles.{profile_slug}.model")
        if profile_fallback is not None:
            fallback_model = profile_fallback
        profile_reasoning_fallback = _read_optional_reasoning_effort(
            profile.get("reasoning_effort"),
            path=f"profiles.{profile_slug}.reasoning_effort",
        )
        profile_structured_mode_fallback = _read_optional_structured_mode(
            profile.get("structured_mode"),
            path=f"profiles.{profile_slug}.structured_mode",
        )
        for stage_name, stage_temperature in _read_optional_stage_temperature_defaults(
            profile.get("default_temperature"),
            path=f"profiles.{profile_slug}.default_temperature",
        ).items():
            stage_temperatures[stage_name] = stage_temperature
        for stage_name, stage_budget in _read_optional_stage_max_output_token_defaults(
            profile.get("default_max_output_tokens"),
            path=f"profiles.{profile_slug}.default_max_output_tokens",
        ).items():
            stage_max_output_tokens[stage_name] = stage_budget

        stages = profile.get("stages")
        if stages is not None:
            if not isinstance(stages, dict):
                raise ValueError(f"Invalid AI profile `profiles.{profile_slug}.stages`: expected mapping.")
            if "draft" not in stages:
                raise ValueError(
                    f"Invalid AI profile `profiles.{profile_slug}.stages`: required stage `draft` is missing."
                )
            for stage_name, stage_cfg in stages.items():
                if stage_name not in {"emergency_triage", "triage", "draft", "polish", "release_notes"}:
                    raise ValueError(
                        f"Invalid AI profile `profiles.{profile_slug}.stages.{stage_name}`: unknown stage."
                    )
                if not isinstance(stage_cfg, dict):
                    raise ValueError(
                        f"Invalid AI profile `profiles.{profile_slug}.stages.{stage_name}`: expected mapping."
                    )
                model = _read_optional_non_empty_string(
                    stage_cfg.get("model"),
                    path=f"profiles.{profile_slug}.stages.{stage_name}.model",
                )
                if model is not None:
                    stage_models[stage_name] = model
                    explicitly_configured_stages.add(stage_name)
                enabled_stages.add(stage_name)
                stage_reasoning[stage_name] = _read_optional_reasoning_effort(
                    stage_cfg.get("reasoning_effort"),
                    path=f"profiles.{profile_slug}.stages.{stage_name}.reasoning_effort",
                )
                stage_structured_modes[stage_name] = _read_optional_structured_mode(
                    stage_cfg.get("structured_mode"),
                    path=f"profiles.{profile_slug}.stages.{stage_name}.structured_mode",
                )
                stage_temperature = _read_optional_temperature(
                    stage_cfg.get("temperature"),
                    path=f"profiles.{profile_slug}.stages.{stage_name}.temperature",
                )
                if stage_temperature is not None:
                    stage_temperatures[stage_name] = stage_temperature
                stage_budget = _read_optional_max_output_tokens_policy(
                    stage_cfg.get("max_output_tokens"),
                    path=f"profiles.{profile_slug}.stages.{stage_name}.max_output_tokens",
                )
                if stage_budget is not None:
                    stage_max_output_tokens[stage_name] = stage_budget

        if "emergency_triage" in enabled_stages and "triage" not in enabled_stages:
            raise ValueError(
                f"Invalid AI profile `profiles.{profile_slug}.stages`: `emergency_triage` requires stage `triage`."
            )

        if profile_fallback is not None:
            for stage_name in ("emergency_triage", "triage", "draft", "polish", "release_notes"):
                if stage_name not in explicitly_configured_stages:
                    stage_models[stage_name] = profile_fallback
        if profile_reasoning_fallback is not None:
            for stage_name in ("emergency_triage", "triage", "draft", "polish", "release_notes"):
                if stage_reasoning[stage_name] is None:
                    stage_reasoning[stage_name] = profile_reasoning_fallback
        if profile_structured_mode_fallback is not None:
            for stage_name in ("emergency_triage", "triage", "draft", "polish", "release_notes"):
                if stage_structured_modes[stage_name] is None:
                    stage_structured_modes[stage_name] = profile_structured_mode_fallback

    if cli_overrides.provider is not None:
        provider = cli_overrides.provider

    if cli_overrides.base_url is not None:
        base_url = _normalize_optional_string(cli_overrides.base_url)

    cli_model = _read_optional_non_empty_string(cli_overrides.model, path="cli.model")
    if cli_model is not None:
        fallback_model = cli_model
        stage_models["emergency_triage"] = cli_model
        stage_models["triage"] = cli_model
        stage_models["draft"] = cli_model
        stage_models["polish"] = cli_model
        stage_models["release_notes"] = cli_model

    resolved_stages: dict[AIStageName, AIPipelineStageConfig] = {
        "emergency_triage": AIPipelineStageConfig(
            model=stage_models["emergency_triage"] or fallback_model,
            reasoning_effort=stage_reasoning["emergency_triage"],
            structured_mode=stage_structured_modes["emergency_triage"],
            temperature=stage_temperatures["emergency_triage"],
            max_output_tokens=stage_max_output_tokens["emergency_triage"],
        ),
        "triage": AIPipelineStageConfig(
            model=stage_models["triage"] or fallback_model,
            reasoning_effort=stage_reasoning["triage"],
            structured_mode=stage_structured_modes["triage"],
            temperature=stage_temperatures["triage"],
            max_output_tokens=stage_max_output_tokens["triage"],
        ),
        "draft": AIPipelineStageConfig(
            model=stage_models["draft"] or fallback_model,
            reasoning_effort=stage_reasoning["draft"],
            structured_mode=stage_structured_modes["draft"],
            temperature=stage_temperatures["draft"],
            max_output_tokens=stage_max_output_tokens["draft"],
        ),
        "polish": AIPipelineStageConfig(
            model=stage_models["polish"] or fallback_model,
            reasoning_effort=stage_reasoning["polish"],
            structured_mode=stage_structured_modes["polish"],
            temperature=stage_temperatures["polish"],
            max_output_tokens=stage_max_output_tokens["polish"],
        ),
        "release_notes": AIPipelineStageConfig(
            model=stage_models["release_notes"] or fallback_model,
            reasoning_effort=stage_reasoning["release_notes"],
            structured_mode=stage_structured_modes["release_notes"],
            temperature=stage_temperatures["release_notes"],
            max_output_tokens=stage_max_output_tokens["release_notes"],
        ),
    }
    resolved_enabled_stages = tuple(stage for stage in STAGE_EXECUTION_ORDER if stage == "draft" or stage in enabled_stages)

    return AIPipelineConfig(
        provider=provider,
        base_url=base_url,
        fallback_model=fallback_model,
        stages=resolved_stages,
        enabled_stages=resolved_enabled_stages,  # type: ignore[arg-type]
        profile_slug=profile_slug,
    )


def _load_profile(path: Path, profile_slug: str) -> dict:
    if not path.is_file():
        raise ValueError(
            f"AI profile `{profile_slug}` requested but config file is missing: {path}"
        )

    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid AI profile config YAML at {path}: {exc}") from exc
    except Exception as exc:
        raise ValueError(f"Failed to read AI profile config at {path}: {exc}") from exc

    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise ValueError(f"Invalid AI profile config at {path}: root must be a mapping.")
    _ = _resolve_top_level_schema_version(raw, path=path)

    profiles = raw.get("profiles")
    if not isinstance(profiles, dict):
        raise ValueError(f"Invalid AI profile config at {path}: `profiles` must be a mapping.")

    if profile_slug not in profiles:
        available = ", ".join(sorted(profiles.keys())) or "<none>"
        raise ValueError(
            f"Unknown AI profile `{profile_slug}` in {path}. Available profiles: {available}"
        )

    profile = profiles[profile_slug]
    if not isinstance(profile, dict):
        raise ValueError(f"Invalid AI profile `profiles.{profile_slug}`: expected mapping.")
    return profile


def _resolve_top_level_schema_version(raw: dict[str, object], *, path: Path) -> str:
    schema_version = raw.get("schema_version")
    if schema_version is None:
        return AI_PROFILE_SCHEMA_VERSION
    if not isinstance(schema_version, str) or not schema_version.strip():
        raise ValueError("`schema_version` must be a non-empty string.")
    normalized = schema_version.strip()
    if normalized != AI_PROFILE_SCHEMA_VERSION:
        raise ValueError(
            f"Unsupported AI profile schema_version `{normalized}` in {path}. "
            f"Supported schema_version: {AI_PROFILE_SCHEMA_VERSION}"
        )
    return normalized


def _read_provider(raw: object, *, path: str) -> AIProviderKind:
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError(f"Invalid AI profile `{path}`: expected non-empty provider string.")
    provider = raw.strip()
    if provider not in {"openai", "openai-compatible"}:
        raise ValueError(f"Invalid AI profile `{path}`: unsupported provider `{provider}`.")
    return provider  # type: ignore[return-value]


def _normalize_optional_string(raw: str | None) -> str | None:
    if raw is None:
        return None
    normalized = raw.strip()
    return normalized or None


def _read_optional_non_empty_string(raw: object, *, path: str) -> str | None:
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise ValueError(f"Invalid `{path}`: expected string.")
    normalized = raw.strip()
    if not normalized:
        raise ValueError(f"Invalid `{path}`: expected non-empty string.")
    return normalized


def _read_optional_reasoning_effort(raw: object, *, path: str) -> AIReasoningEffort | None:
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise ValueError(f"Invalid `{path}`: expected string.")
    normalized = raw.strip()
    if normalized not in VALID_REASONING_EFFORTS:
        allowed = ", ".join(VALID_REASONING_EFFORTS)
        raise ValueError(f"Invalid `{path}`: expected one of {allowed}.")
    return normalized  # type: ignore[return-value]


def _read_optional_structured_mode(raw: object, *, path: str) -> AIStructuredMode | None:
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise ValueError(f"Invalid `{path}`: expected string.")
    normalized = raw.strip()
    if normalized not in VALID_STRUCTURED_MODES:
        allowed = ", ".join(VALID_STRUCTURED_MODES)
        raise ValueError(f"Invalid `{path}`: expected one of {allowed}.")
    return normalized  # type: ignore[return-value]


def _read_optional_stage_temperature_defaults(
    raw: object,
    *,
    path: str,
) -> dict[AIStageName, float]:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise ValueError(f"Invalid `{path}`: expected mapping.")
    parsed: dict[AIStageName, float] = {}
    for stage_name, value in raw.items():
        stage = _parse_stage_name(stage_name, path=f"{path}.{stage_name}")
        parsed[stage] = _read_temperature(value, path=f"{path}.{stage_name}")
    return parsed


def _read_optional_stage_max_output_token_defaults(
    raw: object,
    *,
    path: str,
) -> dict[AIStageName, AIMaxOutputTokensPolicy]:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise ValueError(f"Invalid `{path}`: expected mapping.")
    parsed: dict[AIStageName, AIMaxOutputTokensPolicy] = {}
    for stage_name, value in raw.items():
        stage = _parse_stage_name(stage_name, path=f"{path}.{stage_name}")
        parsed[stage] = _read_max_output_tokens_policy(value, path=f"{path}.{stage_name}")
    return parsed


def _parse_stage_name(raw: object, *, path: str) -> AIStageName:
    if not isinstance(raw, str):
        raise ValueError(f"Invalid `{path}`: unknown stage.")
    stage = raw.strip()
    if stage not in {"emergency_triage", "triage", "draft", "polish", "release_notes"}:
        raise ValueError(f"Invalid `{path}`: unknown stage.")
    return stage  # type: ignore[return-value]


def _read_optional_temperature(raw: object, *, path: str) -> float | None:
    if raw is None:
        return None
    return _read_temperature(raw, path=path)


def _read_temperature(raw: object, *, path: str) -> float:
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        raise ValueError(f"Invalid `{path}`: expected numeric temperature in range [0, 2].")
    value = float(raw)
    if value < 0.0 or value > 2.0:
        raise ValueError(f"Invalid `{path}`: expected value in range [0, 2].")
    return value


def _read_optional_max_output_tokens_policy(raw: object, *, path: str) -> AIMaxOutputTokensPolicy | None:
    if raw is None:
        return None
    return _read_max_output_tokens_policy(raw, path=path)


def _read_max_output_tokens_policy(raw: object, *, path: str) -> AIMaxOutputTokensPolicy:
    if isinstance(raw, bool):
        raise ValueError(f"Invalid `{path}`: expected positive integer or dynamic_ratio object.")
    if isinstance(raw, int):
        if raw <= 0:
            raise ValueError(f"Invalid `{path}`: expected positive integer.")
        return raw
    if not isinstance(raw, dict):
        raise ValueError(f"Invalid `{path}`: expected positive integer or dynamic_ratio object.")

    mode = raw.get("mode")
    if mode != "dynamic_ratio":
        raise ValueError(f"Invalid `{path}.mode`: expected `dynamic_ratio`.")

    ratio = raw.get("ratio")
    min_tokens = raw.get("min")
    max_tokens = raw.get("max")
    if ratio is None or min_tokens is None or max_tokens is None:
        raise ValueError(f"Invalid `{path}`: dynamic_ratio requires `ratio`, `min`, and `max`.")
    if isinstance(ratio, bool) or not isinstance(ratio, (int, float)):
        raise ValueError(f"Invalid `{path}.ratio`: expected numeric value in range (0, 2].")
    ratio_value = float(ratio)
    if ratio_value <= 0 or ratio_value > 2:
        raise ValueError(f"Invalid `{path}.ratio`: expected value in range (0, 2].")
    if isinstance(min_tokens, bool) or not isinstance(min_tokens, int) or min_tokens <= 0:
        raise ValueError(f"Invalid `{path}.min`: expected positive integer.")
    if isinstance(max_tokens, bool) or not isinstance(max_tokens, int) or max_tokens <= 0:
        raise ValueError(f"Invalid `{path}.max`: expected positive integer.")
    if min_tokens > max_tokens:
        raise ValueError(f"Invalid `{path}`: expected `min` <= `max`.")
    return AIDynamicRatioTokenBudget(
        mode="dynamic_ratio",
        ratio=ratio_value,
        min=min_tokens,
        max=max_tokens,
    )


def compute_max_output_tokens(
    policy: AIMaxOutputTokensPolicy,
    *,
    input_size: int,
) -> int:
    if input_size < 0:
        raise ValueError("input_size must be non-negative.")
    if isinstance(policy, int):
        return policy
    computed = int(round(float(input_size) * policy.ratio))
    return max(policy.min, min(policy.max, computed))


def estimate_input_size_units(*segments: str) -> int:
    return sum(len(segment) for segment in segments)
