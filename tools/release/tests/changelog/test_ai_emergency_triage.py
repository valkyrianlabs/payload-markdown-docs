from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from tools.release.changelog.ai.contracts.emergency_triage import (
    AI_EMERGENCY_TRIAGE_RESPONSE_JSON_SCHEMA,
    AI_EMERGENCY_TRIAGE_SCHEMA_VERSION,
    AIEmergencyTriageItem,
    AIEmergencyTriageResult,
    ai_emergency_triage_result_to_dict,
    parse_ai_emergency_triage_response,
)
from tools.release.changelog.ai.stages.emergency_triage import (
    AI_TRIAGE_SYNTHESIZED_INPUT_SCHEMA_VERSION,
    build_semantic_evidence_unit_id,
    build_triage_input_from_emergency_result,
    run_emergency_triage_stage,
)


class AIEmergencyTriageContractsTests(unittest.TestCase):
    def test_parse_valid_response_with_expected_ids(self) -> None:
        raw = {
            "schema_version": AI_EMERGENCY_TRIAGE_SCHEMA_VERSION,
            "version": "0.34.1",
            "items": [
                {
                    "id": "tools:1",
                    "category": "tools",
                    "change_kind": "api-contract",
                    "change_summary": "Updated request/response payload shaping and parsing.",
                    "confidence": "high",
                    "evidence_refs": ["tools/release/changelog/ai/providers/openai.py"],
                },
                {
                    "id": "tools:2",
                    "category": "tools",
                    "change_kind": "output-artifact",
                    "change_summary": "Added comparison artifact writing for profile runs.",
                    "confidence": "medium",
                },
            ],
        }
        parsed = parse_ai_emergency_triage_response(
            raw,
            expected_item_ids=("tools:1", "tools:2"),
        )
        self.assertIsInstance(parsed, AIEmergencyTriageResult)
        self.assertEqual(parsed.version, "0.34.1")
        self.assertEqual(parsed.items[0].id, "tools:1")
        self.assertEqual(parsed.items[1].change_kind, "output-artifact")

    def test_parse_rejects_identity_drift(self) -> None:
        raw = {
            "schema_version": AI_EMERGENCY_TRIAGE_SCHEMA_VERSION,
            "version": "0.34.1",
            "items": [
                {
                    "id": "tools:1",
                    "category": "tools",
                    "change_kind": "api-contract",
                    "change_summary": "Updated request/response payload shaping and parsing.",
                    "confidence": "high",
                }
            ],
        }
        with self.assertRaisesRegex(ValueError, "preserve 1:1 item identity"):
            parse_ai_emergency_triage_response(raw, expected_item_ids=("tools:1", "tools:2"))

    def test_to_dict_omits_optional_fields_when_empty(self) -> None:
        parsed = parse_ai_emergency_triage_response(
            {
                "schema_version": AI_EMERGENCY_TRIAGE_SCHEMA_VERSION,
                "version": "0.34.1",
                "items": [
                    {
                        "id": "tools:1",
                        "category": "tools",
                        "change_kind": "api-contract",
                        "change_summary": "Updated request/response payload shaping and parsing.",
                        "confidence": "high",
                    }
                ],
            }
        )
        rendered = ai_emergency_triage_result_to_dict(parsed)
        self.assertNotIn("insufficient_context_reason", rendered["items"][0])
        self.assertNotIn("evidence_refs", rendered["items"][0])

    def test_strict_schema_item_required_matches_item_properties(self) -> None:
        item_schema = AI_EMERGENCY_TRIAGE_RESPONSE_JSON_SCHEMA["properties"]["items"]["items"]
        required = set(item_schema["required"])
        properties = set(item_schema["properties"].keys())
        self.assertSetEqual(required, properties)



class _FakeProvider:
    def __init__(self, response: dict) -> None:
        self._response = response
        self.calls: list[dict] = []

    def generate_structured_json(self, **kwargs):
        self.calls.append(kwargs)
        return self._response


class _BatchEchoProvider:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def generate_structured_json(self, **kwargs):
        self.calls.append(kwargs)
        marker = "Emergency triage input payload:\n"
        payload = json.loads(kwargs["user_prompt"].split(marker, 1)[1])
        items = payload.get("items", [])
        return {
            "schema_version": AI_EMERGENCY_TRIAGE_SCHEMA_VERSION,
            "version": payload.get("version", "unknown"),
            "items": [
                {
                    "id": item["id"],
                    "category": item["category"],
                    "change_kind": item.get("kind") or "implementation-change",
                    "change_summary": f"Summarized {item['id']}.",
                    "confidence": "medium",
                    "insufficient_context_reason": None,
                    "evidence_refs": [],
                }
                for item in items
            ],
        }


class _BatchDriftProvider:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def generate_structured_json(self, **kwargs):
        self.calls.append(kwargs)
        marker = "Emergency triage input payload:\n"
        payload = json.loads(kwargs["user_prompt"].split(marker, 1)[1])
        items = payload.get("items", [])
        if len(self.calls) == 1:
            return {
                "schema_version": AI_EMERGENCY_TRIAGE_SCHEMA_VERSION,
                "version": payload.get("version", "unknown"),
                "items": [
                    {
                        "id": item["id"],
                        "category": item["category"],
                        "change_kind": "implementation-change",
                        "change_summary": f"Summarized {item['id']}.",
                        "confidence": "high",
                        "insufficient_context_reason": None,
                        "evidence_refs": [],
                    }
                    for item in items
                ],
            }
        # Deliberate second-batch identity drift.
        kept = items[0]
        return {
            "schema_version": AI_EMERGENCY_TRIAGE_SCHEMA_VERSION,
            "version": payload.get("version", "unknown"),
            "items": [
                {
                    "id": kept["id"],
                    "category": kept["category"],
                    "change_kind": "implementation-change",
                    "change_summary": f"Summarized {kept['id']}.",
                    "confidence": "high",
                    "insufficient_context_reason": None,
                    "evidence_refs": [],
                },
                {
                    "id": "bogus:1",
                    "category": kept["category"],
                    "change_kind": "implementation-change",
                    "change_summary": "wrong id",
                    "confidence": "low",
                    "insufficient_context_reason": "bad mapping",
                    "evidence_refs": [],
                },
            ],
        }


class _MonotonicFeeder:
    def __init__(self, values: list[float]) -> None:
        self._values = values
        self._index = 0

    def __call__(self) -> float:
        if not self._values:
            return 0.0
        if self._index >= len(self._values):
            return self._values[-1]
        value = self._values[self._index]
        self._index += 1
        return value


def _sample_semantic_payload() -> dict:
    return {
        "schema_version": "vaulthalla.release.semantic_payload.v1",
        "version": "0.34.1",
        "previous_tag": "v0.34.0",
        "head_sha": "abc123",
        "commit_count": 2,
        "categories": [
            {
                "name": "tools",
                "signal_strength": "strong",
                "summary_hint": "Release tooling and OpenAI integration changes.",
                "key_commits": ["Improve AI compare output provenance"],
                "candidate_commits": [
                    {
                        "sha": "abcd1234",
                        "subject": "Improve AI compare output provenance",
                        "body": "Include more config and output context.",
                        "categories": ["tools"],
                        "weight": "medium",
                        "weight_score": 160,
                        "changed_files": 4,
                        "insertions": 80,
                        "deletions": 10,
                        "sample_paths": ["tools/release/cli.py"],
                    }
                ],
                "supporting_files": ["tools/release/cli.py"],
                "semantic_hunks": [
                    {
                        "path": "tools/release/cli.py",
                        "kind": "output-artifact",
                        "why_selected": "captures comparison artifact generation flow",
                        "excerpt": "@@ ...",
                        "region_type": "function",
                        "context_label": "cmd_changelog_ai_compare",
                    },
                    {
                        "path": "tools/release/changelog/ai/prompts/triage.py",
                        "kind": "prompt-contract",
                        "why_selected": "captures claim-centric contract changes",
                        "excerpt": "@@ ...",
                        "region_type": "function",
                        "context_label": "build_triage_user_prompt",
                    },
                ],
            }
        ],
        "all_commits": [],
        "notes": [],
    }


def _sample_semantic_payload_with_hunks(count: int) -> dict:
    payload = _sample_semantic_payload()
    hunks: list[dict[str, str]] = []
    for index in range(count):
        hunks.append(
            {
                "path": "tools/release/cli.py",
                "kind": "output-artifact",
                "why_selected": f"captures flow {index}",
                "excerpt": f"@@ hunk {index}",
                "region_type": "function",
                "context_label": f"ctx_{index}",
            }
        )
    payload["categories"][0]["semantic_hunks"] = hunks
    return payload


class AIEmergencyTriageStageTests(unittest.TestCase):
    def test_run_stage_enforces_one_item_per_input_unit_id(self) -> None:
        payload = _sample_semantic_payload()
        unit_one = build_semantic_evidence_unit_id("tools", 0)
        unit_two = build_semantic_evidence_unit_id("tools", 1)
        fake = _FakeProvider(
            {
                "schema_version": AI_EMERGENCY_TRIAGE_SCHEMA_VERSION,
                "version": "0.34.1",
                "items": [
                    {
                        "id": unit_one,
                        "category": "tools",
                        "change_kind": "output-artifact",
                        "change_summary": "Added profile comparison artifact generation and wiring.",
                        "confidence": "high",
                    },
                    {
                        "id": unit_two,
                        "category": "tools",
                        "change_kind": "prompt-contract",
                        "change_summary": "Refined triage instructions for claim-centric output.",
                        "confidence": "medium",
                    },
                ],
            }
        )
        with patch("tools.release.changelog.ai.stages.emergency_triage._EMERGENCY_TRIAGE_BATCH_SIZE", 2):
            result = run_emergency_triage_stage(payload, provider=fake)
        self.assertEqual(result.schema_version, AI_EMERGENCY_TRIAGE_SCHEMA_VERSION)
        self.assertEqual(len(result.items), 2)
        call = fake.calls[0]
        self.assertEqual(call["stage"], "emergency_triage")
        self.assertIn("one item per input", call["user_prompt"])

    def test_run_stage_batches_requests_and_preserves_per_batch_identity(self) -> None:
        payload = _sample_semantic_payload_with_hunks(5)
        provider = _BatchEchoProvider()
        with patch("tools.release.changelog.ai.stages.emergency_triage._EMERGENCY_TRIAGE_BATCH_SIZE", 2):
            result = run_emergency_triage_stage(payload, provider=provider)

        self.assertEqual(result.version, "0.34.1")
        self.assertEqual(len(result.items), 5)
        self.assertEqual(len(provider.calls), 3)
        self.assertEqual([item.id for item in result.items], ["tools:1", "tools:2", "tools:3", "tools:4", "tools:5"])
        marker = "Emergency triage input payload:\n"
        call_scopes = [
            [entry["id"] for entry in json.loads(call["user_prompt"].split(marker, 1)[1])["items"]]
            for call in provider.calls
        ]
        self.assertEqual(call_scopes, [["tools:1", "tools:2"], ["tools:3", "tools:4"], ["tools:5"]])
        for call, expected_ids in zip(provider.calls, call_scopes, strict=True):
            schema = call["json_schema"]
            items_schema = schema["properties"]["items"]
            self.assertEqual(items_schema["minItems"], len(expected_ids))
            self.assertEqual(items_schema["maxItems"], len(expected_ids))
            self.assertEqual(
                items_schema["items"]["properties"]["id"]["enum"],
                expected_ids,
            )

    def test_run_stage_fails_when_single_batch_has_identity_drift(self) -> None:
        payload = _sample_semantic_payload_with_hunks(4)
        provider = _BatchDriftProvider()
        with patch("tools.release.changelog.ai.stages.emergency_triage._EMERGENCY_TRIAGE_BATCH_SIZE", 2):
            with self.assertRaisesRegex(
                ValueError,
                r"preserve 1:1 item identity.*missing ids: tools:4.*unexpected ids: bogus:1",
            ):
                _ = run_emergency_triage_stage(payload, provider=provider)

    def test_run_stage_defaults_to_bounded_request_scope(self) -> None:
        payload = _sample_semantic_payload_with_hunks(3)
        provider = _BatchEchoProvider()
        result = run_emergency_triage_stage(payload, provider=provider)

        self.assertEqual(len(result.items), 3)
        self.assertEqual(len(provider.calls), 1)
        marker = "Emergency triage input payload:\n"
        scoped_ids = [
            [entry["id"] for entry in json.loads(call["user_prompt"].split(marker, 1)[1])["items"]]
            for call in provider.calls
        ]
        self.assertEqual(scoped_ids, [["tools:1", "tools:2", "tools:3"]])

    def test_no_progress_timeout_resets_after_successful_batch_completion(self) -> None:
        payload = _sample_semantic_payload_with_hunks(3)
        provider = _BatchEchoProvider()
        # Call pattern with batch_size=1:
        # init, check, provider_start, provider_end, progress_update (per batch).
        monotonic = _MonotonicFeeder(
            [
                0.0,
                5.0, 5.0, 15.0, 16.0,
                45.0, 45.0, 55.0, 56.0,
                85.0, 85.0, 95.0, 96.0,
            ]
        )
        with (
            patch("tools.release.changelog.ai.stages.emergency_triage._EMERGENCY_TRIAGE_BATCH_SIZE", 1),
            patch("tools.release.changelog.ai.stages.emergency_triage._EMERGENCY_TRIAGE_NO_PROGRESS_TIMEOUT_SECONDS", 30.0),
            patch("tools.release.changelog.ai.stages.emergency_triage.time.monotonic", new=monotonic),
        ):
            result = run_emergency_triage_stage(payload, provider=provider)

        self.assertEqual(len(result.items), 3)
        self.assertEqual(len(provider.calls), 3)

    def test_no_progress_timeout_still_fails_true_stall(self) -> None:
        payload = _sample_semantic_payload_with_hunks(3)
        provider = _BatchEchoProvider()
        # First batch completes, then no progress for too long before next dispatch check.
        monotonic = _MonotonicFeeder(
            [
                0.0,
                5.0, 5.0, 10.0, 11.0,
                50.0,
            ]
        )
        with (
            patch("tools.release.changelog.ai.stages.emergency_triage._EMERGENCY_TRIAGE_BATCH_SIZE", 1),
            patch("tools.release.changelog.ai.stages.emergency_triage._EMERGENCY_TRIAGE_NO_PROGRESS_TIMEOUT_SECONDS", 30.0),
            patch("tools.release.changelog.ai.stages.emergency_triage.time.monotonic", new=monotonic),
        ):
            with self.assertRaisesRegex(TimeoutError, r"no forward progress.*batch=2/3"):
                _ = run_emergency_triage_stage(payload, provider=provider)

    def test_build_synthesized_triage_input_payload(self) -> None:
        payload = _sample_semantic_payload()
        result = AIEmergencyTriageResult(
            schema_version=AI_EMERGENCY_TRIAGE_SCHEMA_VERSION,
            version="0.34.1",
            items=(
                AIEmergencyTriageItem(
                    id=build_semantic_evidence_unit_id("tools", 0),
                    category="tools",
                    change_kind="output-artifact",
                    change_summary="Added profile comparison artifact generation and wiring.",
                    confidence="high",
                    evidence_refs=("tools/release/cli.py#cmd_changelog_ai_compare",),
                ),
                AIEmergencyTriageItem(
                    id=build_semantic_evidence_unit_id("tools", 1),
                    category="tools",
                    change_kind="prompt-contract",
                    change_summary="Refined triage instructions for claim-centric output.",
                    confidence="medium",
                ),
            ),
        )
        triage_payload = build_triage_input_from_emergency_result(payload, result)
        self.assertEqual(triage_payload["schema_version"], AI_TRIAGE_SYNTHESIZED_INPUT_SCHEMA_VERSION)
        self.assertEqual(triage_payload["version"], "0.34.1")
        self.assertEqual(len(triage_payload["categories"]), 1)
        units = triage_payload["categories"][0]["synthesized_units"]
        self.assertEqual(len(units), 2)
        self.assertEqual(units[0]["source_kind"], "output-artifact")
        self.assertEqual(units[0]["source_path"], "tools/release/cli.py")



if __name__ == "__main__":
    unittest.main()
