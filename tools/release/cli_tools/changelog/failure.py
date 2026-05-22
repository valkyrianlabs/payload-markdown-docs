import argparse
import re
from pathlib import Path

from tools.release.changelog.ai import AIStageName, AIPipelineConfig
from tools.release.changelog.ai.failure_artifacts import collect_provider_failure_evidence, provider_response_observed, \
    write_failure_artifact
from tools.release.changelog.ai.providers import StructuredJSONProvider
from tools.release.cli_tools.print import print_status


def stage_failure(stage: str, exc: Exception) -> ValueError:
    message = str(exc).strip()
    field = _extract_missing_field(message)
    if field is not None:
        return ValueError(f"{stage} stage failed: missing required field `{field}`. {message}")
    return ValueError(f"{stage} stage failed: {message}")


def capture_stage_failure_artifact(
    *,
    repo_root: Path,
    args: argparse.Namespace,
    stage: AIStageName,
    pipeline_config: AIPipelineConfig,
    provider: StructuredJSONProvider,
    exc: Exception,
    stage_settings: dict[str, object],
) -> None:
    provider_evidence = collect_provider_failure_evidence(provider)
    if not provider_response_observed(provider_evidence):
        return
    stage_provider_cfg = pipeline_config.provider_config_for_stage(stage)
    mode_value = stage_settings.get("structured_mode")
    if mode_value is None and isinstance(provider_evidence, dict):
        resolved = provider_evidence.get("resolved_settings")
        if isinstance(resolved, dict):
            mode_value = resolved.get("structured_mode")
    try:
        artifact = write_failure_artifact(
            repo_root=repo_root,
            command=getattr(args, "changelog_command", None),
            stage=stage,
            ai_profile=getattr(args, "ai_profile", None),
            provider_key=stage_provider_cfg.kind,
            model=stage_provider_cfg.model,
            structured_mode=str(mode_value or "unknown-mode"),
            normalized_request_settings={
                "stage": stage,
                "provider_kind": stage_provider_cfg.kind,
                "model": stage_provider_cfg.model,
                **stage_settings,
            },
            error=exc,
            provider_evidence=provider_evidence,
        )
    except Exception:
        return
    print_status(f"Wrote AI failure evidence to {artifact}")


def _extract_missing_field(message: str) -> str | None:
    direct = re.match(r"^`([^`]+)` must be a non-empty string\.$", message)
    if direct:
        return direct.group(1)
    nested = re.match(r"^`([^`]+)\[[0-9]+\]` must be a non-empty string\.$", message)
    if nested:
        return nested.group(1)
    list_field = re.search(r"`([^`]+)` must be a non-empty list of strings\.$", message)
    if list_field:
        return list_field.group(1)
    sections = re.search(r"must include non-empty `([^`]+)` list", message)
    if sections:
        return sections.group(1)
    return None
