from __future__ import annotations

import unittest
from unittest.mock import patch

from tools.release.changelog.ai.config import (
    AIProviderConfig,
    DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
)
from tools.release.changelog.ai.providers import (
    build_structured_json_provider,
    build_structured_mode_fallback_chain,
    get_provider_capabilities,
    resolve_generation_settings,
    resolve_request_parameter_capabilities,
    run_provider_preflight,
)
from tools.release.changelog.ai.providers.parsing import parse_json_object_from_text


class _FakeDiscoveryProvider:
    def __init__(self, models: list[str]) -> None:
        self._models = models

    def list_models(self) -> list[str]:
        return list(self._models)


class _FailingDiscoveryProvider:
    def __init__(self, error: Exception) -> None:
        self._error = error

    def list_models(self) -> list[str]:
        raise self._error


class AIProviderResolutionTests(unittest.TestCase):
    def test_build_structured_json_provider_constructs_expected_provider(self) -> None:
        cases = (
            (
                "openai",
                "tools.release.changelog.ai.providers.OpenAIProvider",
                AIProviderConfig(kind="openai", model="gpt-5.4-mini"),
                {
                    "model": "gpt-5.4-mini",
                    "provider_kind": "openai",
                    "api_key": None,
                    "api_key_env_var": "OPENAI_API_KEY",
                    "timeout_seconds": None,
                },
            ),
            (
                "openai-compatible",
                "tools.release.changelog.ai.providers.OpenAICompatibleProvider",
                AIProviderConfig(kind="openai-compatible", model="Qwen3.5-122B"),
                {
                    "model": "Qwen3.5-122B",
                    "base_url": DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
                    "api_key": None,
                    "api_key_env_var": "OPENAI_API_KEY",
                    "timeout_seconds": None,
                },
            ),
        )

        for label, target, config, expected_kwargs in cases:
            with self.subTest(label=label):
                sentinel = object()
                with patch(target, return_value=sentinel) as provider_cls:
                    provider = build_structured_json_provider(config)

                self.assertIs(provider, sentinel)
                provider_cls.assert_called_once_with(**expected_kwargs)

    def test_openai_provider_rejects_base_url(self) -> None:
        with self.assertRaisesRegex(ValueError, "base-url"):
            build_structured_json_provider(
                AIProviderConfig(
                    kind="openai",
                    model="gpt-5.4-mini",
                    base_url="http://localhost:8888/v1",
                )
            )

    def test_provider_capabilities_by_kind(self) -> None:
        cases = (
            ("openai", True, True, "strict_json_schema"),
            ("openai-compatible", False, False, "json_object"),
        )

        for provider_kind, supports_reasoning, supports_strict, default_mode in cases:
            with self.subTest(provider_kind=provider_kind):
                caps = get_provider_capabilities(provider_kind)
                self.assertEqual(caps.supports_reasoning_effort, supports_reasoning)
                self.assertEqual(caps.supports_strict_schema, supports_strict)
                self.assertEqual(caps.default_structured_mode, default_mode)

    def test_resolve_generation_settings_preserves_supported_requests(self) -> None:
        resolved = resolve_generation_settings(
            provider_kind="openai",
            requested_structured_mode="strict_json_schema",
            requested_reasoning_effort="high",
        )
        self.assertEqual(resolved.structured_mode, "strict_json_schema")
        self.assertEqual(resolved.reasoning_effort, "high")
        self.assertEqual(resolved.degradations, ())

    def test_resolve_generation_settings_degrades_unsupported_local_requests(self) -> None:
        resolved = resolve_generation_settings(
            provider_kind="openai-compatible",
            requested_structured_mode="strict_json_schema",
            requested_reasoning_effort="medium",
        )
        self.assertEqual(resolved.structured_mode, "strict_json_schema")
        self.assertIsNone(resolved.reasoning_effort)
        self.assertEqual(len(resolved.degradations), 2)

    def test_resolve_generation_settings_defaults_and_validation(self) -> None:
        hosted = resolve_generation_settings(provider_kind="openai")
        local = resolve_generation_settings(provider_kind="openai-compatible")
        self.assertEqual(hosted.structured_mode, "strict_json_schema")
        self.assertEqual(local.structured_mode, "json_object")
        self.assertIsNone(hosted.reasoning_effort)
        self.assertIsNone(local.reasoning_effort)

        with self.assertRaisesRegex(ValueError, "Invalid structured mode"):
            resolve_generation_settings(
                provider_kind="openai",
                requested_structured_mode="xml",  # type: ignore[arg-type]
            )

        with self.assertRaisesRegex(ValueError, "Invalid reasoning effort"):
            resolve_generation_settings(
                provider_kind="openai",
                requested_reasoning_effort="turbo",  # type: ignore[arg-type]
            )

    def test_structured_mode_fallback_chain_is_explicit(self) -> None:
        self.assertEqual(
            build_structured_mode_fallback_chain("strict_json_schema"),
            ("strict_json_schema", "json_object", "prompt_json"),
        )
        self.assertEqual(
            build_structured_mode_fallback_chain("json_object"),
            ("json_object", "prompt_json"),
        )
        self.assertEqual(build_structured_mode_fallback_chain("prompt_json"), ("prompt_json",))

    def test_request_parameter_capabilities_follow_provider_and_model(self) -> None:
        cases = (
            ("openai", "gpt-5-mini", False),
            ("openai", "gpt-4.1-mini", True),
            ("openai-compatible", "gpt-5-mini", True),
        )

        for provider_kind, model, supports_temperature in cases:
            with self.subTest(provider_kind=provider_kind, model=model):
                caps = resolve_request_parameter_capabilities(
                    provider_kind=provider_kind,
                    model=model,
                )
                self.assertEqual(caps.supports_temperature, supports_temperature)

    def test_provider_preflight_success_returns_model_context(self) -> None:
        config = AIProviderConfig(
            kind="openai-compatible",
            base_url="http://localhost:8888/v1",
            model="Qwen3.5-122B",
        )
        result = run_provider_preflight(
            config,
            provider=_FakeDiscoveryProvider(["Qwen3.5-122B", "Gemma-4-31B"]),
        )

        self.assertEqual(result.provider_kind, "openai-compatible")
        self.assertEqual(result.model, "Qwen3.5-122B")
        self.assertTrue(result.model_found)
        self.assertIn("Gemma-4-31B", result.discovered_models)

    def test_provider_preflight_failures_are_clear(self) -> None:
        cases = (
            (
                "endpoint-failure",
                AIProviderConfig(
                    kind="openai-compatible",
                    base_url="http://localhost:8888/v1",
                    model="Qwen3.5-122B",
                ),
                _FailingDiscoveryProvider(RuntimeError("Connection error")),
                "Could not reach OpenAI-compatible endpoint at http://localhost:8888/v1",
            ),
            (
                "model-missing",
                AIProviderConfig(
                    kind="openai-compatible",
                    base_url="http://localhost:8888/v1",
                    model="Qwen3.5-122B",
                ),
                _FakeDiscoveryProvider(["Gemma-4-31B"]),
                "is not listed",
            ),
            (
                "hosted-failure",
                AIProviderConfig(kind="openai", model="gpt-5.4-mini"),
                _FailingDiscoveryProvider(RuntimeError("Connection error")),
                "OpenAI provider preflight failed",
            ),
            (
                "empty-model",
                AIProviderConfig(
                    kind="openai-compatible",
                    base_url="http://localhost:8888/v1",
                    model=" ",
                ),
                _FakeDiscoveryProvider(["Qwen3.5-122B"]),
                "--model",
            ),
        )

        for label, config, provider, message in cases:
            with self.subTest(label=label):
                with self.assertRaisesRegex(ValueError, message):
                    run_provider_preflight(config, provider=provider)

    def test_parse_json_object_from_text_recovers_common_wrappers(self) -> None:
        cases = (
            ('{"ok":true,"value":1}', lambda parsed: parsed["value"] == 1),
            ("Noise\n```json\n{\"ok\":true}\n```\nTail", lambda parsed: parsed["ok"] is True),
            ("prefix {\"ok\": true, \"nested\": {\"x\": 1}} suffix", lambda parsed: parsed["nested"]["x"] == 1),
            (
                '{"result":{"title":"x","summary":"y","sections":[]}}',
                lambda parsed: parsed["title"] == "x" and "sections" in parsed,
            ),
        )

        for text, predicate in cases:
            with self.subTest(text=text[:30]):
                self.assertTrue(predicate(parse_json_object_from_text(text)))

    def test_parse_json_object_from_text_rejects_bad_inputs(self) -> None:
        with self.assertRaisesRegex(ValueError, "JSON root must be object"):
            parse_json_object_from_text("[1,2,3]")

        with self.assertRaisesRegex(ValueError, "could not recover valid JSON object"):
            parse_json_object_from_text("not json {broken")


if __name__ == "__main__":
    unittest.main()
