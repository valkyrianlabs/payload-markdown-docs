"""DeepSeek provider support: hosted Responses transport, profile resolution, mixed providers, key gating.

No network: providers are constructed with fake keys and never called.
"""
from __future__ import annotations

import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from tools.release.changelog.ai.config import (
    DEEPSEEK_API_KEY_ENV_VAR,
    DEFAULT_DEEPSEEK_BASE_URL,
    VL_DEEPSEEK_API_KEY_ENV_VAR,
    resolve_api_key_from_env,
    OPENAI_API_KEY_ENV_VAR,
    AIPipelineCLIOverrides,
    AIProviderConfig,
    resolve_ai_pipeline_config,
)
from tools.release.changelog.ai.providers import (
    build_structured_json_provider,
    get_provider_capabilities,
    resolve_generation_settings,
    resolve_request_parameter_capabilities,
)
from tools.release.changelog.release_workflow import (
    DEFAULT_RELEASE_OPENAI_PROFILE,
    _can_attempt_openai,
    parse_release_ai_settings,
)

REPO_ROOT = Path(__file__).resolve().parents[4]

MIXED_PROFILE = """\
profiles:
  mixed:
    provider: deepseek
    model: deepseek-flash
    stages:
      triage:
        reasoning_effort: medium
      draft:
        reasoning_effort: medium
      release_notes:
        provider: openai
        model: gpt-5.5
        reasoning_effort: max
"""


class DeepSeekProviderTests(unittest.TestCase):
    def test_deepseek_uses_hosted_responses_transport_with_its_own_key_and_endpoint(self) -> None:
        with (
            patch.dict(os.environ, {DEEPSEEK_API_KEY_ENV_VAR: "ds-test"}, clear=False),
            patch("tools.release.changelog.ai.providers.openai._build_sdk_client", return_value=object()) as sdk,
        ):
            provider = build_structured_json_provider(AIProviderConfig(kind="deepseek", model="deepseek-flash"))
        self.assertEqual(sdk.call_args.kwargs["api_key"], "ds-test")
        self.assertEqual(sdk.call_args.kwargs["base_url"], DEFAULT_DEEPSEEK_BASE_URL)
        self.assertEqual(provider.provider_kind, "deepseek")
        self.assertEqual(provider.base_url, DEFAULT_DEEPSEEK_BASE_URL)
        caps = get_provider_capabilities("deepseek")
        self.assertTrue(caps.supports_reasoning_effort)
        self.assertTrue(caps.supports_strict_schema)

    def test_deepseek_without_its_key_fails_naming_the_variable(self) -> None:
        env = {
            k: v
            for k, v in os.environ.items()
            if k not in {DEEPSEEK_API_KEY_ENV_VAR, VL_DEEPSEEK_API_KEY_ENV_VAR}
        }
        env[OPENAI_API_KEY_ENV_VAR] = "openai-test"  # must not be used for DeepSeek
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaisesRegex(ValueError, DEEPSEEK_API_KEY_ENV_VAR):
                build_structured_json_provider(AIProviderConfig(kind="deepseek", model="deepseek-flash"))

    def test_max_reasoning_passes_to_deepseek_and_maps_to_xhigh_for_openai(self) -> None:
        self.assertEqual(
            resolve_generation_settings(provider_kind="deepseek", requested_reasoning_effort="max").reasoning_effort,
            "max",
        )
        openai = resolve_generation_settings(provider_kind="openai", requested_reasoning_effort="max")
        self.assertEqual(openai.reasoning_effort, "xhigh")
        self.assertTrue(openai.degradations)

    def test_deepseek_does_not_send_temperature(self) -> None:
        caps = resolve_request_parameter_capabilities(provider_kind="deepseek", model="deepseek-flash")
        self.assertFalse(caps.supports_temperature)


class DeepSeekProfileTests(unittest.TestCase):
    def test_shipped_ds_flash_profile(self) -> None:
        pipeline = resolve_ai_pipeline_config(
            repo_root=REPO_ROOT, profile_slug="ds-flash", cli_overrides=AIPipelineCLIOverrides()
        )
        self.assertEqual(pipeline.enabled_stage_providers(), ("deepseek",))
        self.assertEqual(
            {stage: pipeline.stages[stage].model for stage in pipeline.enabled_stages},
            {stage: "deepseek-flash" for stage in pipeline.enabled_stages},
        )
        self.assertEqual(pipeline.stages["polish"].reasoning_effort, "max")
        self.assertEqual(pipeline.stages["release_notes"].reasoning_effort, "max")
        self.assertEqual(pipeline.stages["triage"].reasoning_effort, "medium")
        self.assertEqual(pipeline.provider_config_for_stage("draft").api_key_env_var, DEEPSEEK_API_KEY_ENV_VAR)

    def test_profile_can_mix_providers_per_stage(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "ai.yml").write_text(MIXED_PROFILE, encoding="utf-8")
            pipeline = resolve_ai_pipeline_config(
                repo_root=root, profile_slug="mixed", cli_overrides=AIPipelineCLIOverrides()
            )
            self.assertEqual(pipeline.stage_provider("draft"), "deepseek")
            self.assertEqual(pipeline.stage_provider("release_notes"), "openai")
            self.assertEqual(pipeline.stages["release_notes"].model, "gpt-5.5")
            notes_cfg = pipeline.provider_config_for_stage("release_notes")
            self.assertEqual((notes_cfg.kind, notes_cfg.api_key_env_var, notes_cfg.base_url),
                             ("openai", OPENAI_API_KEY_ENV_VAR, None))
            self.assertEqual(set(pipeline.enabled_stage_providers()), {"deepseek", "openai"})

            # A CLI provider override still applies to every stage.
            forced = resolve_ai_pipeline_config(
                repo_root=root, profile_slug="mixed", cli_overrides=AIPipelineCLIOverrides(provider="openai")
            )
            self.assertEqual(forced.enabled_stage_providers(), ("openai",))

            # The release gate requires exactly the keys the profile's stages use.
            only_deepseek = parse_release_ai_settings(
                {"RELEASE_AI_PROFILE": "mixed", DEEPSEEK_API_KEY_ENV_VAR: "ds"}
            )
            ok, reason = _can_attempt_openai(only_deepseek, repo_root=root)
            self.assertFalse(ok)
            self.assertIn(OPENAI_API_KEY_ENV_VAR, reason)
            both = parse_release_ai_settings(
                {"RELEASE_AI_PROFILE": "mixed", DEEPSEEK_API_KEY_ENV_VAR: "ds", OPENAI_API_KEY_ENV_VAR: "oa"}
            )
            self.assertEqual(_can_attempt_openai(both, repo_root=root), (True, "ok"))


class ReleaseProfileEnvTests(unittest.TestCase):
    def test_new_profile_variable_wins_and_legacy_still_works(self) -> None:
        self.assertEqual(
            parse_release_ai_settings(
                {"RELEASE_AI_PROFILE": "ds-flash", "RELEASE_AI_PROFILE_OPENAI": "openai-premium-deep-triage"}
            ).openai_profile,
            "ds-flash",
        )
        self.assertEqual(
            parse_release_ai_settings({"RELEASE_AI_PROFILE_OPENAI": "openai-premium-deep-triage"}).openai_profile,
            "openai-premium-deep-triage",
        )

    def test_deepseek_only_profile_needs_only_the_deepseek_key(self) -> None:
        settings = parse_release_ai_settings({"RELEASE_AI_PROFILE": "ds-flash", DEEPSEEK_API_KEY_ENV_VAR: "ds"})
        self.assertTrue(settings.deepseek_api_key_present)
        self.assertFalse(settings.openai_api_key_present)
        self.assertEqual(_can_attempt_openai(settings, repo_root=REPO_ROOT), (True, "ok"))
        missing = parse_release_ai_settings({"RELEASE_AI_PROFILE": "ds-flash", OPENAI_API_KEY_ENV_VAR: "oa"})
        ok, reason = _can_attempt_openai(missing, repo_root=REPO_ROOT)
        self.assertFalse(ok)
        self.assertIn(DEEPSEEK_API_KEY_ENV_VAR, reason)


class OrganizationEnvNameTests(unittest.TestCase):
    """VL_* names come from the valkyrianlabs GitHub organization (secret + variable) and the host shell."""

    def test_vl_key_is_preferred_over_generic_key(self) -> None:
        env = {VL_DEEPSEEK_API_KEY_ENV_VAR: "vl-key", DEEPSEEK_API_KEY_ENV_VAR: "generic-key"}
        self.assertEqual(resolve_api_key_from_env(DEEPSEEK_API_KEY_ENV_VAR, env), "vl-key")
        self.assertEqual(
            resolve_api_key_from_env(DEEPSEEK_API_KEY_ENV_VAR, {DEEPSEEK_API_KEY_ENV_VAR: "generic-key"}),
            "generic-key",
        )
        # Blank org value falls through instead of shadowing a real key.
        self.assertEqual(
            resolve_api_key_from_env(
                DEEPSEEK_API_KEY_ENV_VAR, {VL_DEEPSEEK_API_KEY_ENV_VAR: "  ", DEEPSEEK_API_KEY_ENV_VAR: "generic-key"}
            ),
            "generic-key",
        )
        # The OpenAI key variable has no alias chain.
        self.assertIsNone(resolve_api_key_from_env(OPENAI_API_KEY_ENV_VAR, {VL_DEEPSEEK_API_KEY_ENV_VAR: "vl"}))

    def test_provider_uses_vl_key(self) -> None:
        env = {
            k: v
            for k, v in os.environ.items()
            if k not in {DEEPSEEK_API_KEY_ENV_VAR, VL_DEEPSEEK_API_KEY_ENV_VAR}
        }
        env[VL_DEEPSEEK_API_KEY_ENV_VAR] = "vl-only"
        with (
            patch.dict(os.environ, env, clear=True),
            patch("tools.release.changelog.ai.providers.openai._build_sdk_client") as sdk,
        ):
            build_structured_json_provider(AIProviderConfig(kind="deepseek", model="deepseek-flash"))
        self.assertEqual(sdk.call_args.kwargs["api_key"], "vl-only")

    def test_missing_key_error_names_both_variables_and_never_a_value(self) -> None:
        env = {
            k: v
            for k, v in os.environ.items()
            if k not in {DEEPSEEK_API_KEY_ENV_VAR, VL_DEEPSEEK_API_KEY_ENV_VAR}
        }
        env[OPENAI_API_KEY_ENV_VAR] = "openai-secret-value"
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(ValueError) as ctx:
                build_structured_json_provider(AIProviderConfig(kind="deepseek", model="deepseek-flash"))
        message = str(ctx.exception)
        self.assertIn(VL_DEEPSEEK_API_KEY_ENV_VAR, message)
        self.assertIn(DEEPSEEK_API_KEY_ENV_VAR, message)
        self.assertNotIn("openai-secret-value", message)

    def test_vl_key_satisfies_deepseek_gate(self) -> None:
        settings = parse_release_ai_settings({"VL_AI_RELEASE_PROFILE": "ds-flash", VL_DEEPSEEK_API_KEY_ENV_VAR: "vl"})
        self.assertTrue(settings.deepseek_api_key_present)
        self.assertEqual(_can_attempt_openai(settings, repo_root=REPO_ROOT), (True, "ok"))

    def test_org_profile_variable_has_highest_precedence(self) -> None:
        self.assertEqual(
            parse_release_ai_settings(
                {
                    "VL_AI_RELEASE_PROFILE": "ds-flash",
                    "RELEASE_AI_PROFILE": "openai-premium-deep-triage",
                    "RELEASE_AI_PROFILE_OPENAI": "openai-premium-deep-triage",
                }
            ).openai_profile,
            "ds-flash",
        )
        # A blank org variable (e.g. unset GitHub variable rendered as '') does not shadow lower ones.
        self.assertEqual(
            parse_release_ai_settings({"VL_AI_RELEASE_PROFILE": "", "RELEASE_AI_PROFILE": "ds-flash"}).openai_profile,
            "ds-flash",
        )

    def test_default_profile_exists_in_ai_yml(self) -> None:
        self.assertEqual(parse_release_ai_settings({}).openai_profile, DEFAULT_RELEASE_OPENAI_PROFILE)
        resolved = resolve_ai_pipeline_config(
            repo_root=REPO_ROOT,
            profile_slug=DEFAULT_RELEASE_OPENAI_PROFILE,
            cli_overrides=AIPipelineCLIOverrides(),
        )
        self.assertTrue(resolved.enabled_stage_providers())


if __name__ == "__main__":
    unittest.main()
