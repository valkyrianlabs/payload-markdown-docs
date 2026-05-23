from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from tools.release.changelog.ai.providers.openai import LOCAL_NO_AUTH_API_KEY_PLACEHOLDER
from tools.release.changelog.ai.providers.openai_compatible import OpenAICompatibleProvider


class _FakeMessage:
    def __init__(self, content):
        self.content = content
        self.refusal = None


class _FakeChoice:
    def __init__(self, content):
        self.message = _FakeMessage(content)


class _FakeResponse:
    def __init__(self, content):
        self.choices = [_FakeChoice(content)]


class _FakeCompletions:
    def __init__(self, response):
        self._response = response
        self.calls: list[dict] = []
        self.error: Exception | None = None

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return self._response


class _FakeChat:
    def __init__(self, completions):
        self.completions = completions


class _FakeSDKClient:
    def __init__(self, response):
        self.chat = _FakeChat(_FakeCompletions(response))


class _CompatFallbackCompletions:
    def __init__(self, final_response):
        self._final_response = final_response
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        response_format = kwargs.get("response_format")
        if isinstance(response_format, dict) and response_format.get("type") == "json_object":
            raise RuntimeError("response_format json_object unsupported")
        return self._final_response


class OpenAICompatibleProviderTests(unittest.TestCase):
    def test_missing_api_key_is_allowed_for_local_compatible_provider(self) -> None:
        fake_sdk = _FakeSDKClient(
            _FakeResponse(
                '{"title":"x","summary":"y","sections":[{"category":"core","overview":"z","bullets":["a"]}]}'
            )
        )
        with (
            patch.dict(os.environ, {}, clear=True),
            patch(
                "tools.release.changelog.ai.providers.openai._build_sdk_client",
                return_value=fake_sdk,
            ) as build_sdk,
        ):
            _ = OpenAICompatibleProvider(model="Qwen3.5-122B", base_url="http://localhost:8888/v1")

        build_sdk.assert_called_once_with(
            api_key=LOCAL_NO_AUTH_API_KEY_PLACEHOLDER,
            base_url="http://localhost:8888/v1",
            timeout_seconds=None,
        )

    def test_structured_request_defaults_to_json_object_response_format(self) -> None:
        sdk = _FakeSDKClient(
            _FakeResponse(
                '{"title":"x","summary":"y","sections":[{"category":"core","overview":"z","bullets":["a"]}]}'
            )
        )
        client = OpenAICompatibleProvider(
            sdk_client=sdk,
            model="Qwen3.5-122B",
            base_url="http://localhost:8888/v1",
        )

        result = client.generate_structured_json(
            system_prompt="sys",
            user_prompt="usr",
            json_schema={"type": "object"},
        )

        self.assertEqual(result["title"], "x")
        call = sdk.chat.completions.calls[0]
        self.assertEqual(call["model"], "Qwen3.5-122B")
        self.assertEqual(call["response_format"]["type"], "json_object")

    def test_temperature_is_forwarded_for_openai_compatible(self) -> None:
        sdk = _FakeSDKClient(
            _FakeResponse(
                '{"title":"x","summary":"y","sections":[{"category":"core","overview":"z","bullets":["a"]}]}'
            )
        )
        client = OpenAICompatibleProvider(
            sdk_client=sdk,
            model="Qwen3.5-122B",
            base_url="http://localhost:8888/v1",
        )

        _ = client.generate_structured_json(
            system_prompt="sys",
            user_prompt="usr",
            json_schema={"type": "object"},
            temperature=0.42,
        )

        call = sdk.chat.completions.calls[0]
        self.assertEqual(call["temperature"], 0.42)

    def test_strict_schema_request_attempts_strict_and_omits_unsupported_reasoning(self) -> None:
        sdk = _FakeSDKClient(
            _FakeResponse(
                '{"title":"x","summary":"y","sections":[{"category":"core","overview":"z","bullets":["a"]}]}'
            )
        )
        client = OpenAICompatibleProvider(
            sdk_client=sdk,
            model="Qwen3.5-122B",
            base_url="http://localhost:8888/v1",
        )

        _ = client.generate_structured_json(
            system_prompt="sys",
            user_prompt="usr",
            json_schema={"type": "object"},
            structured_mode="strict_json_schema",
            reasoning_effort="high",
        )

        call = sdk.chat.completions.calls[0]
        self.assertEqual(call["response_format"]["type"], "json_schema")
        self.assertTrue(call["response_format"]["json_schema"]["strict"])
        self.assertNotIn("reasoning", call)

    def test_missing_base_url_fails_clearly(self) -> None:
        with self.assertRaisesRegex(ValueError, "base_url"):
            OpenAICompatibleProvider(model="Qwen3.5-122B", base_url="")

    def test_malformed_base_url_fails_clearly(self) -> None:
        with self.assertRaisesRegex(ValueError, "http"):
            OpenAICompatibleProvider(model="Qwen3.5-122B", base_url="localhost:8888/v1")

    def test_provider_exposes_limited_capabilities(self) -> None:
        sdk = _FakeSDKClient(_FakeResponse("{}"))
        client = OpenAICompatibleProvider(
            sdk_client=sdk,
            model="Qwen3.5-122B",
            base_url="http://localhost:8888/v1",
        )
        caps = client.capabilities()
        self.assertFalse(caps.supports_reasoning_effort)
        self.assertFalse(caps.supports_strict_schema)

    def test_openai_compatible_falls_back_to_prompt_json_when_json_object_fails(self) -> None:
        final = _FakeResponse(
            '{"title":"x","summary":"y","sections":[{"category":"core","overview":"z","bullets":["a"]}]}'
        )
        completions = _CompatFallbackCompletions(final)
        sdk = type("SDK", (), {})()
        sdk.chat = _FakeChat(completions)
        client = OpenAICompatibleProvider(
            sdk_client=sdk,
            model="Qwen3.5-122B",
            base_url="http://localhost:8888/v1",
        )

        _ = client.generate_structured_json(
            system_prompt="sys",
            user_prompt="usr",
            json_schema={"type": "object"},
        )

        self.assertEqual(len(completions.calls), 2)
        self.assertEqual(completions.calls[0]["response_format"]["type"], "json_object")
        self.assertNotIn("response_format", completions.calls[1])

    def test_openai_compatible_explicit_strict_attempts_strict_first_then_falls_back(self) -> None:
        final = _FakeResponse(
            '{"title":"x","summary":"y","sections":[{"category":"core","overview":"z","bullets":["a"]}]}'
        )
        calls: list[dict] = []

        class _StrictCompatFallbackCompletions:
            def create(self, **kwargs):
                calls.append(kwargs)
                response_format = kwargs.get("response_format")
                if isinstance(response_format, dict):
                    fmt = response_format.get("type")
                    if fmt in {"json_schema", "json_object"}:
                        raise RuntimeError(f"{fmt} unsupported")
                return final

        sdk = type("SDK", (), {})()
        sdk.chat = _FakeChat(_StrictCompatFallbackCompletions())
        client = OpenAICompatibleProvider(
            sdk_client=sdk,
            model="Qwen3.5-122B",
            base_url="http://localhost:8888/v1",
        )

        _ = client.generate_structured_json(
            system_prompt="sys",
            user_prompt="usr",
            json_schema={"type": "object"},
            structured_mode="strict_json_schema",
        )

        self.assertEqual(len(calls), 3)
        self.assertEqual(calls[0]["response_format"]["type"], "json_schema")
        self.assertEqual(calls[1]["response_format"]["type"], "json_object")
        self.assertNotIn("response_format", calls[2])


if __name__ == "__main__":
    unittest.main()
