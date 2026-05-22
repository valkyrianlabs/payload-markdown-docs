import argparse
import os
from pathlib import Path

from tools.release.changelog import build_release_context
from tools.release.changelog.ai import AIPipelineConfig, AIPipelineCLIOverrides, resolve_ai_pipeline_config, \
    AIStageName, AIProviderConfig, build_structured_json_provider
from tools.release.changelog.ai.providers import StructuredJSONProvider
from tools.release.version.adapters import read_version_file


def build_changelog_context(repo_root: Path, since_tag: str | None):
    version_path = repo_root / "VERSION"

    try:
        version = read_version_file(version_path)
    except Exception as exc:
        raise ValueError(f"Failed to read canonical version from {version_path}: {exc}") from exc

    return build_release_context(
        version=str(version),
        repo_root=repo_root,
        previous_tag=since_tag,
    )


def build_ai_pipeline_config_from_args(
    args: argparse.Namespace,
    *,
    repo_root: Path | None = None,
) -> AIPipelineConfig:
    active_repo_root = repo_root if repo_root is not None else Path(args.repo_root).resolve()
    overrides = AIPipelineCLIOverrides(
        provider=getattr(args, "provider", None),
        base_url=getattr(args, "base_url", None),
        model=getattr(args, "model", None),
    )
    return resolve_ai_pipeline_config(
        repo_root=active_repo_root,
        profile_slug=getattr(args, "ai_profile", None),
        cli_overrides=overrides,
    )


def build_ai_provider_config_from_args(
    args: argparse.Namespace,
    *,
    repo_root: Path | None = None,
    stage: AIStageName = "draft",
) -> AIProviderConfig:
    pipeline = build_ai_pipeline_config_from_args(args, repo_root=repo_root)
    base = pipeline.provider_config_for_stage(stage)
    timeout_seconds = _resolve_stage_provider_timeout_seconds(stage)
    if timeout_seconds is None:
        return base
    return AIProviderConfig(
        kind=base.kind,
        model=base.model,
        base_url=base.base_url,
        api_key_env_var=base.api_key_env_var,
        api_key=base.api_key,
        timeout_seconds=timeout_seconds,
    )


def _resolve_stage_provider_timeout_seconds(stage: AIStageName) -> float | None:
    if stage != "emergency_triage":
        return None
    raw = os.getenv("RELEASE_AI_EMERGENCY_TRIAGE_PROVIDER_TIMEOUT_SECONDS", "45").strip()
    if not raw:
        return 45.0
    try:
        value = float(raw)
    except ValueError:
        return 45.0
    if value <= 0:
        return 45.0
    return value


def build_ai_provider_from_config(config: AIProviderConfig) -> StructuredJSONProvider:
    return build_structured_json_provider(config)


def build_ai_provider_from_args(
    args: argparse.Namespace,
    *,
    repo_root: Path | None = None,
    stage: AIStageName = "draft",
) -> StructuredJSONProvider:
    return build_ai_provider_from_config(
        build_ai_provider_config_from_args(args, repo_root=repo_root, stage=stage)
    )
