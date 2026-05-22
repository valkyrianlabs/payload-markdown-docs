from __future__ import annotations

import argparse
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from tools.release.changelog.ai.config import (
    AIDynamicRatioTokenBudget,
    AIPipelineCLIOverrides,
    compute_max_output_tokens,
    resolve_ai_pipeline_config,
)
from tools.release.cli_tools.commands.changelog.build import (
    build_ai_pipeline_config_from_args,
    build_ai_provider_config_from_args,
)


def _write_profile(repo_root: Path, content: str) -> None:
    (repo_root / "ai.yml").write_text(content, encoding="utf-8")


def _resolve_profile(
    profile: str,
    *,
    slug: str,
    overrides: AIPipelineCLIOverrides | None = None,
):
    with TemporaryDirectory() as temp_dir:
        repo_root = Path(temp_dir)
        _write_profile(repo_root, profile)
        return resolve_ai_pipeline_config(
            repo_root=repo_root,
            profile_slug=slug,
            cli_overrides=overrides or AIPipelineCLIOverrides(),
        )


def _assert_config_error(
    case: unittest.TestCase,
    profile: str,
    *,
    slug: str,
    message: str,
    overrides: AIPipelineCLIOverrides | None = None,
) -> None:
    with TemporaryDirectory() as temp_dir:
        repo_root = Path(temp_dir)
        _write_profile(repo_root, profile)
        with case.assertRaises(ValueError) as ctx:
            resolve_ai_pipeline_config(
                repo_root=repo_root,
                profile_slug=slug,
                cli_overrides=overrides or AIPipelineCLIOverrides(),
            )
    case.assertIn(message, str(ctx.exception))


class AIConfigResolutionTests(unittest.TestCase):
    def _args(
        self,
        *,
        repo_root: str,
        ai_profile: str | None = None,
        provider: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
    ) -> argparse.Namespace:
        return argparse.Namespace(
            repo_root=repo_root,
            ai_profile=ai_profile,
            provider=provider,
            model=model,
            base_url=base_url,
        )

    def test_profile_config_loads_with_and_without_schema_version(self) -> None:
        cases = (
            (
                "implicit",
                """
profiles:
  local-gemma:
    provider: openai-compatible
    base_url: http://127.0.0.1:8888/v1
    stages:
      draft:
        model: Gemma-4-31B
""",
            ),
            (
                "explicit",
                """
schema_version: vaulthalla.release.ai_profile.v1
profiles:
  local-gemma:
    provider: openai-compatible
    base_url: http://127.0.0.1:8888/v1
    stages:
      draft:
        model: Gemma-4-31B
""",
            ),
        )

        for label, profile in cases:
            with self.subTest(label=label):
                resolved = _resolve_profile(profile, slug="local-gemma")
                self.assertEqual(resolved.provider, "openai-compatible")

    def test_profile_config_rejects_invalid_schema_version_values(self) -> None:
        cases = (
            (
                "empty",
                """
schema_version: "   "
profiles:
  local-gemma:
    provider: openai-compatible
    stages:
      draft:
        model: Gemma-4-31B
""",
                "`schema_version` must be a non-empty string.",
            ),
            (
                "unsupported",
                """
schema_version: vaulthalla.release.ai_profile.v99
profiles:
  local-gemma:
    provider: openai-compatible
    stages:
      draft:
        model: Gemma-4-31B
""",
                "Unsupported AI profile schema_version",
            ),
        )

        for label, profile, message in cases:
            with self.subTest(label=label):
                _assert_config_error(self, profile, slug="local-gemma", message=message)

    def test_invalid_yaml_and_unknown_profile_surface_clear_errors(self) -> None:
        cases = (
            ("profiles: [broken", "x", "Invalid AI profile config YAML"),
            (
                """
profiles:
  one:
    provider: openai
""",
                "missing",
                "Unknown AI profile `missing`",
            ),
        )

        for profile, slug, message in cases:
            with self.subTest(slug=slug):
                _assert_config_error(self, profile, slug=slug, message=message)

    def test_profile_shape_and_required_stage_validation_errors(self) -> None:
        cases = (
            (
                "bad-stage-shape",
                """
profiles:
  bad:
    provider: openai
    stages:
      draft:
        model: gpt-test
      triage: nope
""",
                "profiles.bad.stages.triage",
            ),
            (
                "missing-draft",
                """
profiles:
  bad:
    provider: openai
    stages:
      triage:
        model: gpt-test
""",
                "required stage `draft` is missing",
            ),
            (
                "empty-stages",
                """
profiles:
  bad:
    provider: openai
    stages: {}
""",
                "required stage `draft` is missing",
            ),
        )

        for label, profile, message in cases:
            with self.subTest(label=label):
                _assert_config_error(self, profile, slug="bad", message=message)

    def test_pipeline_profile_values_apply_without_cli_overrides(self) -> None:
        resolved = _resolve_profile(
            """
profiles:
  balanced:
    provider: openai-compatible
    base_url: http://127.0.0.1:9999/v1
    model: shared-model
    reasoning_effort: low
    structured_mode: json_object
    stages:
      draft:
        model: draft-model
        reasoning_effort: high
        structured_mode: prompt_json
""",
            slug="balanced",
        )

        self.assertEqual(resolved.provider, "openai-compatible")
        self.assertEqual(resolved.base_url, "http://127.0.0.1:9999/v1")
        self.assertEqual(resolved.stage_model("triage"), "shared-model")
        self.assertEqual(resolved.stage_model("draft"), "draft-model")
        self.assertEqual(resolved.stage_model("polish"), "shared-model")
        self.assertEqual(resolved.stages["triage"].reasoning_effort, "low")
        self.assertEqual(resolved.stages["triage"].structured_mode, "json_object")
        self.assertEqual(resolved.stages["draft"].reasoning_effort, "high")
        self.assertEqual(resolved.stages["draft"].structured_mode, "prompt_json")

    def test_cli_build_helpers_resolve_profile_values_and_stage_defaults(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write_profile(
                repo_root,
                """
profiles:
  openai-balanced:
    provider: openai
    default_temperature:
      draft: 0.4
    default_max_output_tokens:
      draft: 1200
    stages:
      emergency_triage:
        model: gpt-5-nano
        reasoning_effort: low
        structured_mode: strict_json_schema
      triage:
        model: gpt-5-nano
        reasoning_effort: low
        structured_mode: json_object
      draft:
        model: gpt-5-mini
        reasoning_effort: medium
        structured_mode: strict_json_schema
        temperature: 0.1
      polish:
        model: gpt-5.4
        reasoning_effort: high
        structured_mode: prompt_json
      release_notes:
        model: gpt-5.4
        reasoning_effort: high
""",
            )
            args = self._args(repo_root=str(repo_root), ai_profile="openai-balanced")

            emergency_cfg = build_ai_provider_config_from_args(args, stage="emergency_triage")
            triage_cfg = build_ai_provider_config_from_args(args, stage="triage")
            draft_cfg = build_ai_provider_config_from_args(args, stage="draft")
            polish_cfg = build_ai_provider_config_from_args(args, stage="polish")
            release_notes_cfg = build_ai_provider_config_from_args(args, stage="release_notes")
            pipeline = build_ai_pipeline_config_from_args(args)

        self.assertEqual(emergency_cfg.model, "gpt-5-nano")
        self.assertEqual(triage_cfg.model, "gpt-5-nano")
        self.assertEqual(draft_cfg.model, "gpt-5-mini")
        self.assertEqual(polish_cfg.model, "gpt-5.4")
        self.assertEqual(release_notes_cfg.model, "gpt-5.4")
        self.assertEqual(draft_cfg.kind, "openai")
        self.assertEqual(pipeline.stages["emergency_triage"].structured_mode, "strict_json_schema")
        self.assertEqual(pipeline.stages["triage"].structured_mode, "json_object")
        self.assertEqual(pipeline.stages["draft"].reasoning_effort, "medium")
        self.assertEqual(pipeline.stages["draft"].temperature, 0.1)
        self.assertEqual(pipeline.stages["draft"].max_output_tokens, 1200)
        self.assertEqual(pipeline.stages["polish"].structured_mode, "prompt_json")
        self.assertEqual(pipeline.stages["release_notes"].reasoning_effort, "high")

    def test_cli_model_override_beats_profile_stage_models(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write_profile(
                repo_root,
                """
profiles:
  local-gemma:
    provider: openai-compatible
    base_url: http://127.0.0.1:8888/v1
    stages:
      triage:
        model: Gemma-4-31B
      draft:
        model: Gemma-4-31B
      polish:
        model: Gemma-4-31B
""",
            )
            args = self._args(
                repo_root=str(repo_root),
                ai_profile="local-gemma",
                model="Qwen3.5-122B",
            )

            triage_cfg = build_ai_provider_config_from_args(args, stage="triage")
            draft_cfg = build_ai_provider_config_from_args(args, stage="draft")
            polish_cfg = build_ai_provider_config_from_args(args, stage="polish")

        self.assertEqual(triage_cfg.model, "Qwen3.5-122B")
        self.assertEqual(draft_cfg.model, "Qwen3.5-122B")
        self.assertEqual(polish_cfg.model, "Qwen3.5-122B")
        self.assertEqual(draft_cfg.base_url, "http://127.0.0.1:8888/v1")

    def test_global_fallback_model_applies_when_stage_missing(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write_profile(
                repo_root,
                """
profiles:
  custom:
    provider: openai
    model: gpt-fallback
    stages:
      draft:
        model: gpt-draft
""",
            )
            args = self._args(repo_root=str(repo_root), ai_profile="custom")

            triage_cfg = build_ai_provider_config_from_args(args, stage="triage")
            draft_cfg = build_ai_provider_config_from_args(args, stage="draft")
            polish_cfg = build_ai_provider_config_from_args(args, stage="polish")

        self.assertEqual(triage_cfg.model, "gpt-fallback")
        self.assertEqual(draft_cfg.model, "gpt-draft")
        self.assertEqual(polish_cfg.model, "gpt-fallback")

    def test_backward_compatible_non_profile_cli_usage_still_works(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            args = self._args(
                repo_root=str(repo_root),
                provider="openai-compatible",
                base_url="http://localhost:8888/v1",
                model="Qwen3.5-122B",
            )

            cfg = build_ai_provider_config_from_args(args, stage="draft")

        self.assertEqual(cfg.kind, "openai-compatible")
        self.assertEqual(cfg.base_url, "http://localhost:8888/v1")
        self.assertEqual(cfg.model, "Qwen3.5-122B")

    def test_profile_requested_but_missing_file_surfaces_clear_error(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)

            with self.assertRaises(ValueError) as pipeline_ctx:
                resolve_ai_pipeline_config(
                    repo_root=repo_root,
                    profile_slug="missing",
                    cli_overrides=AIPipelineCLIOverrides(),
                )

            args = self._args(repo_root=str(repo_root), ai_profile="missing")
            with self.assertRaises(ValueError) as provider_ctx:
                _ = build_ai_provider_config_from_args(args, stage="draft")

        self.assertIn("config file is missing", str(pipeline_ctx.exception))
        self.assertIn("config file is missing", str(provider_ctx.exception))

    def test_provider_base_url_resolution_stable_per_stage(self) -> None:
        resolved = _resolve_profile(
            """
profiles:
  local:
    provider: openai-compatible
    base_url: http://127.0.0.1:8888/v1
    model: local-model
""",
            slug="local",
        )

        for stage in ("triage", "draft", "polish"):
            with self.subTest(stage=stage):
                cfg = resolved.provider_config_for_stage(stage)
                self.assertEqual(cfg.kind, "openai-compatible")
                self.assertEqual(cfg.base_url, "http://127.0.0.1:8888/v1")

    def test_invalid_provider_and_stage_setting_fields_are_rejected(self) -> None:
        cases = (
            (
                "provider",
                """
profiles:
  bad:
    provider: not-a-provider
""",
                "unsupported provider",
            ),
            (
                "reasoning",
                """
profiles:
  bad:
    provider: openai
    stages:
      draft:
        model: gpt-test
        reasoning_effort: turbo
""",
                "reasoning_effort",
            ),
            (
                "structured-mode",
                """
profiles:
  bad:
    provider: openai
    stages:
      draft:
        model: gpt-test
        structured_mode: xml
""",
                "structured_mode",
            ),
            (
                "temperature",
                """
profiles:
  bad:
    provider: openai
    stages:
      draft:
        model: gpt-test
        temperature: 3
""",
                "temperature",
            ),
        )

        for label, profile, message in cases:
            with self.subTest(label=label):
                _assert_config_error(self, profile, slug="bad", message=message)

    def test_enabled_stages_use_fixed_contract_order(self) -> None:
        resolved = _resolve_profile(
            """
profiles:
  ordered:
    provider: openai
    stages:
      polish:
        model: polish-x
      draft:
        model: draft-x
      triage:
        model: triage-x
""",
            slug="ordered",
        )

        self.assertEqual(resolved.enabled_stages, ("triage", "draft", "polish"))

    def test_optional_stage_ordering_and_dependencies_are_enforced(self) -> None:
        cases = (
            (
                "release-notes",
                """
profiles:
  ordered:
    provider: openai
    stages:
      release_notes:
        model: notes-x
        reasoning_effort: high
      draft:
        model: draft-x
""",
                ("draft", "release_notes"),
                None,
            ),
            (
                "emergency-before-triage",
                """
profiles:
  ordered:
    provider: openai
    stages:
      triage:
        model: triage-x
      emergency_triage:
        model: emergency-x
      draft:
        model: draft-x
""",
                ("emergency_triage", "triage", "draft"),
                None,
            ),
            (
                "emergency-requires-triage",
                """
profiles:
  bad:
    provider: openai
    stages:
      emergency_triage:
        model: emergency-x
      draft:
        model: draft-x
""",
                None,
                "`emergency_triage` requires stage `triage`",
            ),
        )

        for label, profile, expected_stages, error in cases:
            with self.subTest(label=label):
                slug = "bad" if "bad:" in profile else "ordered"
                if error is not None:
                    _assert_config_error(self, profile, slug=slug, message=error)
                else:
                    resolved = _resolve_profile(profile, slug=slug)
                    self.assertEqual(resolved.enabled_stages, expected_stages)

    def test_temperature_defaults_and_stage_override(self) -> None:
        resolved = _resolve_profile(
            """
profiles:
  tuned:
    provider: openai
    default_temperature:
      triage: 0.1
      draft: 0.3
    stages:
      draft:
        model: gpt-draft
      triage:
        model: gpt-triage
        temperature: 0.05
""",
            slug="tuned",
        )

        self.assertEqual(resolved.stages["triage"].temperature, 0.05)
        self.assertEqual(resolved.stages["draft"].temperature, 0.3)
        self.assertEqual(resolved.stages["polish"].temperature, 0.0)

    def test_max_output_tokens_defaults_and_stage_override(self) -> None:
        resolved = _resolve_profile(
            """
profiles:
  tuned:
    provider: openai
    default_max_output_tokens:
      triage: 200
      draft:
        mode: dynamic_ratio
        ratio: 0.25
        min: 700
        max: 2100
    stages:
      draft:
        model: gpt-draft
      polish:
        model: gpt-polish
        max_output_tokens: 900
""",
            slug="tuned",
        )

        self.assertEqual(resolved.stages["triage"].max_output_tokens, 200)
        self.assertEqual(resolved.stages["polish"].max_output_tokens, 900)
        self.assertIsInstance(resolved.stages["draft"].max_output_tokens, AIDynamicRatioTokenBudget)

    def test_invalid_dynamic_ratio_shape_rejected(self) -> None:
        _assert_config_error(
            self,
            """
profiles:
  bad:
    provider: openai
    stages:
      draft:
        model: gpt-test
        max_output_tokens:
          mode: dynamic_ratio
          ratio: 0.2
          min: 800
""",
            slug="bad",
            message="dynamic_ratio requires",
        )

    def test_dynamic_ratio_budget_clamps_min_and_max(self) -> None:
        policy = AIDynamicRatioTokenBudget(mode="dynamic_ratio", ratio=0.5, min=100, max=400)
        self.assertEqual(compute_max_output_tokens(policy, input_size=20), 100)
        self.assertEqual(compute_max_output_tokens(policy, input_size=500), 250)
        self.assertEqual(compute_max_output_tokens(policy, input_size=2000), 400)


if __name__ == "__main__":
    unittest.main()
