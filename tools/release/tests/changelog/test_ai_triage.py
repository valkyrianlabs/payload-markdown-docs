from __future__ import annotations

import json
import unittest

from tools.release.changelog.ai.contracts.triage import (
    AI_TRIAGE_HOSTED_COMPACT_RESPONSE_JSON_SCHEMA,
    AITriageResult,
    AI_TRIAGE_RESPONSE_JSON_SCHEMA,
    AI_TRIAGE_SCHEMA_VERSION,
    ai_triage_result_to_dict,
    build_triage_ir_payload,
    parse_ai_triage_response,
    resolve_triage_response_json_schema,
)
from tools.release.changelog.ai.providers.parsing import parse_json_object_from_text
from tools.release.changelog.ai.stages.triage import render_triage_result_json, run_triage_stage
from tools.release.tests.changelog._support import RecordingStructuredProvider, load_json_fixture


class AITriageContractsTests(unittest.TestCase):
    maxDiff = None

    def test_schema_has_required_top_level_fields(self) -> None:
        self.assertEqual(AI_TRIAGE_RESPONSE_JSON_SCHEMA["type"], "object")
        self.assertEqual(
            AI_TRIAGE_RESPONSE_JSON_SCHEMA["required"],
            [
                "schema_version",
                "version",
                "categories",
            ],
        )

    def test_hosted_compact_schema_is_smaller_for_triage(self) -> None:
        default_categories_max = AI_TRIAGE_RESPONSE_JSON_SCHEMA["properties"]["categories"]["maxItems"]
        hosted_categories_max = AI_TRIAGE_HOSTED_COMPACT_RESPONSE_JSON_SCHEMA["properties"]["categories"]["maxItems"]
        default_summary_max = AI_TRIAGE_RESPONSE_JSON_SCHEMA["properties"]["summary_points"]["maxItems"]
        hosted_summary_max = AI_TRIAGE_HOSTED_COMPACT_RESPONSE_JSON_SCHEMA["properties"]["summary_points"]["maxItems"]
        self.assertLess(hosted_categories_max, default_categories_max)
        self.assertLess(hosted_summary_max, default_summary_max)

    def test_schema_resolver_uses_hosted_compact_for_hosted_gpt5(self) -> None:
        resolved = resolve_triage_response_json_schema(provider_kind="openai", model="gpt-5-nano")
        self.assertEqual(
            resolved["properties"]["categories"]["maxItems"],
            AI_TRIAGE_HOSTED_COMPACT_RESPONSE_JSON_SCHEMA["properties"]["categories"]["maxItems"],
        )

    def test_schema_resolver_keeps_default_for_local_compatible(self) -> None:
        resolved = resolve_triage_response_json_schema(
            provider_kind="openai-compatible",
            model="gpt-5-nano",
        )
        self.assertEqual(
            resolved["properties"]["categories"]["maxItems"],
            AI_TRIAGE_RESPONSE_JSON_SCHEMA["properties"]["categories"]["maxItems"],
        )

    def test_parse_valid_response_fixture(self) -> None:
        raw = load_json_fixture(__file__, "ai_triage_valid.json")
        parsed = parse_ai_triage_response(raw)

        self.assertIsInstance(parsed, AITriageResult)
        self.assertEqual(parsed.schema_version, AI_TRIAGE_SCHEMA_VERSION)
        self.assertEqual(parsed.version, "2.4.0")
        self.assertEqual(parsed.categories[0].name, "core")
        self.assertEqual(parsed.categories[0].priority_rank, 1)
        self.assertEqual(parsed.categories[0].theme, "Core reliability and lifecycle hardening")
        self.assertEqual(parsed.categories[1].priority_rank, 2)

    def test_parse_rejects_invalid_signal_strength(self) -> None:
        invalid = load_json_fixture(__file__, "ai_triage_valid.json")
        invalid["categories"][0]["signal_strength"] = "high"

        with self.assertRaisesRegex(ValueError, "signal_strength"):
            parse_ai_triage_response(invalid)

    def test_parse_rejects_missing_schema_version(self) -> None:
        invalid = load_json_fixture(__file__, "ai_triage_valid.json")
        invalid.pop("schema_version", None)
        with self.assertRaisesRegex(ValueError, "schema_version"):
            parse_ai_triage_response(invalid)

    def test_optional_evidence_refs_drops_empty_like_entries(self) -> None:
        raw = load_json_fixture(__file__, "ai_triage_valid.json")
        raw["categories"][0]["evidence_refs"] = ["", "  ", None, 1, "core/path#kind"]
        parsed = parse_ai_triage_response(raw)
        self.assertEqual(parsed.categories[0].evidence_refs, ("core/path#kind",))

    def test_parse_allows_missing_summary_points(self) -> None:
        raw = load_json_fixture(__file__, "ai_triage_valid.json")
        raw.pop("summary_points", None)
        parsed = parse_ai_triage_response(raw)
        self.assertEqual(parsed.summary_points, ())

    def test_required_grounded_claims_still_rejects_non_string(self) -> None:
        raw = load_json_fixture(__file__, "ai_triage_valid.json")
        raw["categories"][0]["grounded_claims"] = [1]
        with self.assertRaisesRegex(ValueError, "grounded_claims\\[0\\]"):
            parse_ai_triage_response(raw)

    def test_qwen_like_optional_noise_is_normalized(self) -> None:
        content = json.dumps(
            {
                "result": {
                    "schema_version": AI_TRIAGE_SCHEMA_VERSION,
                    "version": "2.4.0",
                    "summary_points": ["Core work dominates."],
                    "categories": [
                        {
                            "name": "core",
                            "signal_strength": "strong",
                            "priority_rank": 1,
                            "theme": "Core runtime hardening",
                            "grounded_claims": ["Service hardening work."],
                            "evidence_refs": [" service.py#error-handling ", None, ""],
                            "operator_note": 1,
                        }
                    ],
                    "operator_note": None,
                }
            }
        )
        parsed_text = parse_json_object_from_text(content)
        parsed = parse_ai_triage_response(parsed_text)
        category = parsed.categories[0]
        self.assertEqual(category.evidence_refs, ("service.py#error-handling",))
        self.assertIsNone(category.operator_note)
        self.assertIsNone(parsed.operator_note)

    def test_parse_rejects_duplicate_priority_rank(self) -> None:
        invalid = load_json_fixture(__file__, "ai_triage_valid.json")
        invalid["categories"][1]["priority_rank"] = 1

        with self.assertRaisesRegex(ValueError, "Duplicate triage priority rank"):
            parse_ai_triage_response(invalid)

    def test_result_to_dict_roundtrip_and_ir_payload(self) -> None:
        raw = load_json_fixture(__file__, "ai_triage_valid.json")
        parsed = parse_ai_triage_response(raw)
        as_dict = ai_triage_result_to_dict(parsed)
        triage_ir = build_triage_ir_payload(parsed)

        self.assertEqual(as_dict["schema_version"], AI_TRIAGE_SCHEMA_VERSION)
        self.assertEqual(triage_ir["schema_version"], AI_TRIAGE_SCHEMA_VERSION)
        self.assertEqual(triage_ir["categories"][0]["name"], "core")
        self.assertEqual(triage_ir["categories"][0]["priority_rank"], 1)
        self.assertIn("theme", triage_ir["categories"][0])
        self.assertIn("grounded_claims", triage_ir["categories"][0])
        self.assertNotIn("important_files", triage_ir["categories"][0])
        self.assertNotIn("retained_snippets", triage_ir["categories"][0])



class AITriageStageTests(unittest.TestCase):
    def test_run_triage_stage_uses_schema_and_payload_in_prompt(self) -> None:
        payload = {
            "schema_version": "vaulthalla.release.semantic_payload.v1",
            "version": "2.4.0",
            "categories": [],
        }
        fake = RecordingStructuredProvider(load_json_fixture(__file__, "ai_triage_valid.json"))

        triage = run_triage_stage(payload, provider=fake)

        self.assertEqual(triage.version, "2.4.0")
        self.assertEqual(len(fake.calls), 1)
        call = fake.calls[0]
        self.assertEqual(call["stage"], "triage")
        self.assertIn("json_schema", call)
        self.assertIn("Semantic payload (compact projection)", call["user_prompt"])
        self.assertIn("vaulthalla.release.semantic_payload.v1", call["user_prompt"])

    def test_run_triage_stage_rejects_invalid_response(self) -> None:
        invalid = load_json_fixture(__file__, "ai_triage_valid.json")
        invalid["categories"] = []

        with self.assertRaisesRegex(ValueError, "categories"):
            run_triage_stage(
                {"schema_version": "x", "metadata": {}, "categories": []},
                provider=RecordingStructuredProvider(invalid),
            )

    def test_run_triage_stage_passes_reasoning_and_structured_mode(self) -> None:
        payload = {
            "schema_version": "vaulthalla.release.semantic_payload.v1",
            "version": "2.4.0",
            "categories": [],
        }
        fake = RecordingStructuredProvider(load_json_fixture(__file__, "ai_triage_valid.json"))

        _ = run_triage_stage(
            payload,
            provider=fake,
            reasoning_effort="low",
            structured_mode="prompt_json",
            temperature=0.0,
            max_output_tokens_policy=123,
        )
        call = fake.calls[0]
        self.assertEqual(call["stage"], "triage")
        self.assertEqual(call["reasoning_effort"], "low")
        self.assertEqual(call["structured_mode"], "prompt_json")
        self.assertEqual(call["temperature"], 0.0)
        self.assertEqual(call["max_output_tokens"], 123)

    def test_run_triage_stage_hosted_gpt5_uses_compact_schema_and_prompt(self) -> None:
        payload = {
            "schema_version": "vaulthalla.release.semantic_payload.v1",
            "version": "2.4.0",
            "categories": [],
        }
        fake = RecordingStructuredProvider(load_json_fixture(__file__, "ai_triage_valid.json"))

        _ = run_triage_stage(
            payload,
            provider=fake,
            provider_kind="openai",
            model="gpt-5-nano",
        )
        call = fake.calls[0]
        self.assertEqual(call["json_schema"]["properties"]["categories"]["maxItems"], 5)
        self.assertIn("Compression mode (hosted)", call["user_prompt"])

    def test_run_triage_stage_local_provider_keeps_default_schema_limits(self) -> None:
        payload = {
            "schema_version": "vaulthalla.release.semantic_payload.v1",
            "version": "2.4.0",
            "categories": [],
        }
        fake = RecordingStructuredProvider(load_json_fixture(__file__, "ai_triage_valid.json"))

        _ = run_triage_stage(
            payload,
            provider=fake,
            provider_kind="openai-compatible",
            model="gpt-5-nano",
        )
        call = fake.calls[0]
        self.assertEqual(call["json_schema"]["properties"]["categories"]["maxItems"], 10)
        self.assertNotIn("Compression mode (hosted)", call["user_prompt"])

    def test_render_triage_json_is_stable(self) -> None:
        triage = run_triage_stage(
            {"schema_version": "x", "metadata": {}, "categories": []},
            provider=RecordingStructuredProvider(load_json_fixture(__file__, "ai_triage_valid.json")),
        )
        first = render_triage_result_json(triage)
        second = render_triage_result_json(triage)
        self.assertEqual(first, second)
        self.assertIn('"schema_version": "vaulthalla.release.ai_triage.v2"', first)

    def test_run_triage_stage_normalizes_qwen_like_optional_array_noise(self) -> None:
        payload = {
            "schema_version": "vaulthalla.release.semantic_payload.v1",
            "version": "2.4.0",
            "categories": [],
        }
        response = {
            "schema_version": AI_TRIAGE_SCHEMA_VERSION,
            "version": "2.4.0",
            "summary_points": ["Core work dominates."],
            "categories": [
                {
                    "name": "core",
                    "signal_strength": "strong",
                    "priority_rank": 1,
                    "theme": "Core runtime hardening",
                    "grounded_claims": ["Service hardening work."],
                    "evidence_refs": [" service.py#error-handling ", None, ""],
                    "operator_note": 1,
                }
            ],
            "operator_note": None,
        }
        triage = run_triage_stage(payload, provider=RecordingStructuredProvider(response))
        category = triage.categories[0]
        self.assertEqual(category.evidence_refs, ("service.py#error-handling",))
        self.assertIsNone(category.operator_note)
        self.assertIsNone(triage.operator_note)

    def test_run_triage_stage_allows_missing_summary_points(self) -> None:
        payload = {
            "schema_version": "vaulthalla.release.semantic_payload.v1",
            "version": "2.4.0",
            "categories": [],
        }
        response = load_json_fixture(__file__, "ai_triage_valid.json")
        response.pop("summary_points", None)

        triage = run_triage_stage(payload, provider=RecordingStructuredProvider(response))
        self.assertEqual(triage.summary_points, ())

    def test_run_triage_stage_compact_projection_accepts_tuple_payload_arrays(self) -> None:
        payload = {
            "schema_version": "vaulthalla.release.semantic_payload.v1",
            "version": "2.4.0",
            "categories": (
                {
                    "name": "tools",
                    "signal_strength": "strong",
                    "summary_hint": "Release tooling contract updates",
                    "key_commits": ("Switch triage to semantic payload",),
                    "semantic_hunks": (
                        {
                            "kind": "prompt-contract",
                            "why_selected": "changed triage prompt contract text",
                            "excerpt": "@@ -1,2 +1,3 @@\n+required categories",
                            "path": "tools/release/changelog/ai/prompts/triage.py",
                        },
                    ),
                    "supporting_files": ("tools/release/changelog/ai/prompts/triage.py",),
                },
            ),
            "notes": ("note a",),
        }
        fake = RecordingStructuredProvider(load_json_fixture(__file__, "ai_triage_valid.json"))

        _ = run_triage_stage(payload, provider=fake)
        call = fake.calls[0]
        marker = "Semantic payload (compact projection):\n"
        projection_text = call["user_prompt"].split(marker, 1)[1]
        projection = json.loads(projection_text)

        self.assertEqual(len(projection["categories"]), 1)
        tools = projection["categories"][0]
        self.assertEqual(tools["name"], "tools")
        self.assertEqual(tools["key_commits"], ["Switch triage to semantic payload"])
        self.assertEqual(len(tools["semantic_hunks"]), 1)
        self.assertEqual(tools["semantic_hunks"][0]["kind"], "prompt-contract")
        self.assertEqual(tools["supporting_files"], ["tools/release/changelog/ai/prompts/triage.py"])

    def test_run_triage_stage_supports_synthesized_input_mode(self) -> None:
        payload = {
            "schema_version": "vaulthalla.release.triage_input.synthesized.v1",
            "version": "2.4.0",
            "categories": [
                {
                    "name": "tools",
                    "signal_strength": "strong",
                    "summary_hint": "Release tooling changes",
                    "key_commits": ["Improve ai-compare output"],
                    "synthesized_units": [
                        {
                            "id": "tools:1",
                            "change_kind": "output-artifact",
                            "change_summary": "Added profile comparison artifact generation.",
                            "confidence": "high",
                            "source_path": "tools/release/cli.py",
                            "source_kind": "output-artifact",
                        }
                    ],
                }
            ],
        }
        fake = RecordingStructuredProvider(load_json_fixture(__file__, "ai_triage_valid.json"))

        _ = run_triage_stage(payload, provider=fake, input_mode="synthesized_semantic")
        call = fake.calls[0]
        marker = "Synthesized semantic payload (compact projection):\n"
        projection_text = call["user_prompt"].split(marker, 1)[1]
        projection = json.loads(projection_text)

        self.assertIn("pre-synthesized unit summaries", call["system_prompt"])
        self.assertEqual(len(projection["categories"]), 1)
        units = projection["categories"][0]["synthesized_units"]
        self.assertEqual(units[0]["id"], "tools:1")
        self.assertEqual(units[0]["change_kind"], "output-artifact")



if __name__ == "__main__":
    unittest.main()
