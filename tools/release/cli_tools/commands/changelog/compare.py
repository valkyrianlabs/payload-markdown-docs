import argparse
import os
import re
from pathlib import Path
from tempfile import TemporaryDirectory

from tools.release.changelog.ai import AIPipelineConfig
from tools.release.changelog.release_workflow import refresh_debian_changelog_entry
from tools.release.cli_tools.commands.changelog.build import build_ai_pipeline_config_from_args
from tools.release.cli_tools.commands.changelog.draft import cmd_changelog_ai_draft
from tools.release.cli_tools.changelog.output import write_output
from tools.release.cli_tools.path import DEFAULT_CHANGELOG_COMPARISON_DIR
from tools.release.version.adapters import read_version_file


def cmd_changelog_ai_compare(args: argparse.Namespace) -> int:
    repo_root = Path(args.repo_root).resolve()
    profiles = _parse_ai_compare_profiles(args.ai_profiles)
    version = str(read_version_file(repo_root / "VERSION"))
    output_name = _resolve_ai_compare_output_name(args.output_name, version=version)

    comparisons_dir = (repo_root / DEFAULT_CHANGELOG_COMPARISON_DIR).resolve()
    comparisons_dir.mkdir(parents=True, exist_ok=True)
    output_path = (comparisons_dir / output_name).resolve()

    manual_changelog_path = (repo_root / "debian" / "changelog").resolve()
    if not manual_changelog_path.is_file():
        raise ValueError(f"Debian changelog file not found: {manual_changelog_path}")
    original_debian_changelog = manual_changelog_path.read_text(encoding="utf-8")

    sections: list[str] = [f"# AI Changelog Comparison — {version}"]
    with TemporaryDirectory(prefix="ai-compare-") as temp_dir:
        temp_root = Path(temp_dir)
        for profile in profiles:
            compare_args = argparse.Namespace(
                repo_root=str(repo_root),
                changelog_command="ai-compare",
                since_tag=args.since_tag,
                output=str(temp_root / f"{profile}.draft.md"),
                save_json=None,
                ai_profile=profile,
                model=None,
                provider=None,
                base_url=None,
                use_triage=False,
                save_triage_json=None,
                polish=False,
                save_polish_json=None,
                release_notes_output=str(temp_root / f"{profile}.release_notes.md"),
            )
            pipeline_config = build_ai_pipeline_config_from_args(compare_args, repo_root=repo_root)
            run_rc = cmd_changelog_ai_draft(compare_args)
            if run_rc != 0:
                raise ValueError(f"AI compare run failed for profile `{profile}` (exit code {run_rc}).")

            cached_draft = Path(compare_args.output).read_text(encoding="utf-8")
            release_markdown = _strip_cached_draft_marker(cached_draft)
            if not release_markdown.strip():
                raise ValueError(f"AI compare produced empty markdown for profile `{profile}`.")

            profile_debian = temp_root / f"{profile}.debian.changelog"
            profile_debian.write_text(original_debian_changelog, encoding="utf-8")
            _ = refresh_debian_changelog_entry(
                changelog_path=profile_debian,
                release_markdown=release_markdown,
                environ=os.environ,
            )
            debian_output = profile_debian.read_text(encoding="utf-8")

            sections.extend(
                [
                    "",
                    f"## Profile: {profile}",
                    "",
                    "### Effective profile config",
                    "```yaml",
                    _render_ai_compare_profile_config_yaml(pipeline_config).rstrip(),
                    "```",
                    "",
                    "### changelog.release.md",
                    "```markdown",
                    release_markdown.rstrip(),
                    "```",
                    "",
                    "### release_notes.md",
                    "```markdown",
                    _read_release_notes_for_compare(compare_args.release_notes_output),
                    "```",
                    "",
                    "### debian/changelog",
                    "```text",
                    debian_output.rstrip(),
                    "```",
                    "",
                    "---",
                ]
            )

    rendered = "\n".join(sections).rstrip() + "\n"
    write_output(rendered, str(output_path))
    print(f"Wrote AI comparison artifact to {output_path}")
    return 0


def _parse_ai_compare_profiles(raw: str | None) -> list[str]:
    if raw is None:
        raise ValueError("--ai-profiles is required.")
    parsed = [value.strip() for value in raw.split(",") if value.strip()]
    if not parsed:
        raise ValueError("--ai-profiles must include at least one profile slug.")
    ordered_unique: list[str] = []
    seen: set[str] = set()
    for profile in parsed:
        if profile in seen:
            continue
        seen.add(profile)
        ordered_unique.append(profile)
    return ordered_unique

def _render_ai_compare_profile_config_yaml(pipeline: AIPipelineConfig) -> str:
    lines: list[str] = [
        f"provider: {pipeline.provider}",
        f"profile_slug: {pipeline.profile_slug or '<none>'}",
    ]
    if pipeline.base_url:
        lines.append(f"base_url: {pipeline.base_url}")
    lines.append("enabled_stages:")
    for stage in pipeline.enabled_stages:
        lines.append(f"  - {stage}")

    lines.append("default_max_output_tokens:")
    for stage in ("emergency_triage", "triage", "draft", "polish", "release_notes"):
        token_policy = pipeline.stages[stage].max_output_tokens
        lines.extend(_render_ai_compare_token_policy(stage, token_policy))

    lines.append("stages:")
    for stage in ("emergency_triage", "triage", "draft", "polish", "release_notes"):
        stage_cfg = pipeline.stages[stage]
        lines.append(f"  {stage}:")
        lines.append(f"    model: {stage_cfg.model}")
        lines.append(f"    reasoning_effort: {stage_cfg.reasoning_effort or '<none>'}")
        lines.append(f"    structured_mode: {stage_cfg.structured_mode or '<none>'}")

    return "\n".join(lines) + "\n"


def _render_ai_compare_token_policy(stage: str, policy: object) -> list[str]:
    if isinstance(policy, int):
        return [f"  {stage}: {policy}"]
    mode = getattr(policy, "mode", None)
    ratio = getattr(policy, "ratio", None)
    minimum = getattr(policy, "min", None)
    maximum = getattr(policy, "max", None)
    if mode == "dynamic_ratio" and isinstance(ratio, (int, float)) and isinstance(minimum, int) and isinstance(maximum, int):
        return [
            f"  {stage}:",
            "    mode: dynamic_ratio",
            f"    ratio: {ratio}",
            f"    min: {minimum}",
            f"    max: {maximum}",
        ]
    return [f"  {stage}: {policy!r}"]


def _read_release_notes_for_compare(path: str | None) -> str:
    if not path:
        return "_not generated_"
    candidate = Path(path)
    if not candidate.is_file():
        return "_not generated_"
    content = candidate.read_text(encoding="utf-8").strip()
    if not content:
        return "_not generated_"
    return content


def _resolve_ai_compare_output_name(raw: str | None, *, version: str) -> str:
    candidate = raw.strip() if isinstance(raw, str) else ""
    if not candidate:
        return f"ai-comparison-{version}.md"
    if candidate in {".", ".."}:
        raise ValueError("--output-name must be a file name, not a directory marker.")
    if "/" in candidate or "\\" in candidate:
        raise ValueError("--output-name must be a file name without path separators.")
    if Path(candidate).name != candidate:
        raise ValueError("--output-name must be a plain file name.")
    return candidate


def _strip_cached_draft_marker(content: str) -> str:
    lines = content.splitlines()
    if not lines:
        return ""
    if re.fullmatch(r"\s*<!--\s*vaulthalla-release-version:\s*[0-9]+\.[0-9]+\.[0-9]+\s*-->\s*", lines[0]):
        return ("\n".join(lines[1:])).lstrip("\n")
    return content
