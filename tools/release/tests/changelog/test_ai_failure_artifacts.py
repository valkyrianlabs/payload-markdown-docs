from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from tools.release.changelog.ai.config import AIPipelineConfig, AIPipelineStageConfig
from tools.release.changelog.ai.failure_artifacts import (
    FAILURE_ARTIFACT_VERBOSE_ENV_VAR,
    collect_provider_failure_evidence,
    provider_response_observed,
    write_failure_artifact,
)
from tools.release.cli_tools.changelog.failure import capture_stage_failure_artifact


class _FakeProvider:
    def __init__(self, evidence: dict | None) -> None:
        self._evidence = evidence

    def failure_evidence_snapshot(self):
        return self._evidence


class FailureArtifactTests(unittest.TestCase):
    def test_provider_response_observed_requires_response_marker(self) -> None:
        self.assertFalse(provider_response_observed(None))
        self.assertFalse(provider_response_observed({"attempts": [{"response_received": False}]}))
        self.assertTrue(provider_response_observed({"attempts": [{"response_received": True}]}))

    def test_collect_provider_failure_evidence_uses_snapshot_hook(self) -> None:
        evidence = {"attempts": [{"response_received": True}]}
        provider = _FakeProvider(evidence)
        self.assertEqual(collect_provider_failure_evidence(provider), evidence)

    def test_write_failure_artifact_persists_metadata_and_summaries(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            evidence = {
                "provider_kind": "openai",
                "model": "gpt-5-nano",
                "resolved_settings": {"structured_mode": "json_object"},
                "mode_chain": ["strict_json_schema", "json_object", "prompt_json"],
                "attempts": [
                    {
                        "attempt_index": 2,
                        "mode": "json_object",
                        "transport": "responses",
                        "response_received": True,
                        "request_summary": {"model": "gpt-5-nano"},
                        "response_summary": {"output_item_types": ["reasoning"]},
                        "parse_candidates": ['{"title":"x"}'],
                        "error": "AI parse error",
                        "request_payload_raw": {
                            "model": "gpt-5-nano",
                            "authorization": "Bearer should-not-persist",
                        },
                        "response_payload_raw": {
                            "output": [{"type": "message", "content": [{"type": "output_text", "text": "{}"}]}]
                        },
                        "request_payload_debug": {"api_key": "secret"},
                        "response_payload_debug": {"output_text": "x"},
                    }
                ],
            }
            target = write_failure_artifact(
                repo_root=repo_root,
                command="ai-release",
                stage="triage",
                ai_profile="openai-cheap",
                provider_key="openai",
                model="gpt-5-nano",
                structured_mode="json_object",
                normalized_request_settings={"temperature": 0.0, "max_output_tokens": 600},
                error=ValueError("boom"),
                provider_evidence=evidence,
            )
            self.assertTrue(target.is_dir())
            self.assertIn(".changelog_scratch/failures", str(target))
            context = json.loads((target / "context.json").read_text(encoding="utf-8"))
            request = json.loads((target / "request.json").read_text(encoding="utf-8"))
            response = json.loads((target / "response.json").read_text(encoding="utf-8"))
            self.assertEqual(context["metadata"]["stage"], "triage")
            self.assertEqual(context["metadata"]["provider_key"], "openai")
            self.assertEqual(context["metadata"]["model"], "gpt-5-nano")
            self.assertEqual(context["error"]["message"], "boom")
            self.assertEqual(context["normalized_request_settings"]["max_output_tokens"], 600)
            attempt = context["provider_evidence"]["attempts"][0]
            self.assertEqual(attempt["mode"], "json_object")
            self.assertIn("response_summary", attempt)
            self.assertNotIn("request_payload_debug", attempt)
            self.assertNotIn("response_payload_debug", attempt)
            self.assertEqual(request["authorization"], "<redacted>")
            self.assertEqual(response["output"][0]["type"], "message")
            self.assertEqual(context["raw_payload_capture"]["attempt_index"], 2)
            self.assertTrue(context["raw_payload_capture"]["request_available"])
            self.assertTrue(context["raw_payload_capture"]["response_available"])

    def test_write_failure_artifact_verbose_mode_includes_debug_payloads(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            evidence = {
                "provider_kind": "openai",
                "model": "gpt-5-nano",
                "attempts": [
                    {
                        "attempt_index": 1,
                        "mode": "json_object",
                        "response_received": True,
                        "request_payload_debug": {"authorization": "Bearer x"},
                        "response_payload_debug": {"output": [{"type": "message"}]},
                    }
                ],
            }
            with patch.dict(os.environ, {FAILURE_ARTIFACT_VERBOSE_ENV_VAR: "1"}, clear=False):
                target = write_failure_artifact(
                    repo_root=repo_root,
                    command="ai-draft",
                    stage="draft",
                    ai_profile="openai-cheap",
                    provider_key="openai",
                    model="gpt-5-nano",
                    structured_mode="json_object",
                    normalized_request_settings={},
                    error=ValueError("boom"),
                    provider_evidence=evidence,
                )
            context = json.loads((target / "context.json").read_text(encoding="utf-8"))
            attempt = context["provider_evidence"]["attempts"][0]
            self.assertIn("request_payload_debug", attempt)
            self.assertEqual(attempt["request_payload_debug"]["authorization"], "<redacted>")

    def test_write_failure_artifact_records_missing_payloads_cleanly(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            evidence = {
                "provider_kind": "openai",
                "model": "gpt-5-nano",
                "attempts": [
                    {
                        "attempt_index": 1,
                        "mode": "prompt_json",
                        "response_received": True,
                    }
                ],
            }
            target = write_failure_artifact(
                repo_root=repo_root,
                command="ai-draft",
                stage="draft",
                ai_profile="openai-cheap",
                provider_key="openai",
                model="gpt-5-nano",
                structured_mode="prompt_json",
                normalized_request_settings={},
                error=ValueError("boom"),
                provider_evidence=evidence,
            )
            request = json.loads((target / "request.json").read_text(encoding="utf-8"))
            response = json.loads((target / "response.json").read_text(encoding="utf-8"))
            self.assertFalse(request["available"])
            self.assertFalse(response["available"])

    def test_cli_capture_hook_writes_artifact_only_when_response_was_seen(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            pipeline = AIPipelineConfig(
                provider="openai",
                base_url=None,
                fallback_model="gpt-5.4-mini",
                stages={
                    "triage": AIPipelineStageConfig(model="gpt-5-nano"),
                    "draft": AIPipelineStageConfig(model="gpt-5-mini"),
                    "polish": AIPipelineStageConfig(model="gpt-5.4"),
                },
                enabled_stages=("draft",),
                profile_slug="openai-cheap",
            )
            args = argparse.Namespace(
                changelog_command="ai-release",
                ai_profile="openai-cheap",
            )
            provider = _FakeProvider({"attempts": [{"response_received": True}]})
            capture_stage_failure_artifact(
                repo_root=repo_root,
                args=args,
                stage="draft",
                pipeline_config=pipeline,
                provider=provider,  # type: ignore[arg-type]
                exc=ValueError("draft parse failed"),
                stage_settings={"structured_mode": "json_object"},
            )

            failures_root = repo_root / ".changelog_scratch" / "failures"
            failures = [path for path in failures_root.iterdir() if path.is_dir()]
            self.assertEqual(len(failures), 1)
            self.assertTrue((failures[0] / "context.json").is_file())
            self.assertTrue((failures[0] / "request.json").is_file())
            self.assertTrue((failures[0] / "response.json").is_file())

            no_response_provider = _FakeProvider({"attempts": [{"response_received": False}]})
            capture_stage_failure_artifact(
                repo_root=repo_root,
                args=args,
                stage="draft",
                pipeline_config=pipeline,
                provider=no_response_provider,  # type: ignore[arg-type]
                exc=ValueError("transport failed"),
                stage_settings={"structured_mode": "json_object"},
            )
            failures_after = [path for path in failures_root.iterdir() if path.is_dir()]
            self.assertEqual(len(failures_after), 1)


if __name__ == "__main__":
    unittest.main()
