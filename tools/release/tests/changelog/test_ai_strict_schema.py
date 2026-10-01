"""Strict structured-output schemas: every property required, optionals nullable via anyOf (no type lists)."""
from __future__ import annotations

import unittest

from tools.release.changelog.ai.contracts.draft import AI_DRAFT_RESPONSE_JSON_SCHEMA
from tools.release.changelog.ai.contracts.emergency_triage import AI_EMERGENCY_TRIAGE_RESPONSE_JSON_SCHEMA
from tools.release.changelog.ai.contracts.polish import AI_POLISH_RESPONSE_JSON_SCHEMA
from tools.release.changelog.ai.contracts.release_notes import AI_RELEASE_NOTES_RESPONSE_JSON_SCHEMA
from tools.release.changelog.ai.contracts.triage import (
    AI_TRIAGE_HOSTED_COMPACT_RESPONSE_JSON_SCHEMA,
    AI_TRIAGE_RESPONSE_JSON_SCHEMA,
)
from tools.release.changelog.ai.providers.strict_schema import drop_null_optionals, to_strict_schema

ALL_STAGE_SCHEMAS = {
    "emergency_triage": AI_EMERGENCY_TRIAGE_RESPONSE_JSON_SCHEMA,
    "triage": AI_TRIAGE_RESPONSE_JSON_SCHEMA,
    "triage_hosted_compact": AI_TRIAGE_HOSTED_COMPACT_RESPONSE_JSON_SCHEMA,
    "draft": AI_DRAFT_RESPONSE_JSON_SCHEMA,
    "polish": AI_POLISH_RESPONSE_JSON_SCHEMA,
    "release_notes": AI_RELEASE_NOTES_RESPONSE_JSON_SCHEMA,
}


def _strict_violations(node, path="$"):
    found = []
    if isinstance(node, dict):
        if isinstance(node.get("type"), list) and not set(node["type"]) <= {"string", "number", "integer", "boolean", "null"}:
            found.append(f"{path}: non-scalar type list {node['type']} (DeepSeek rejects these)")
        if "properties" in node:
            if set(node["properties"]) != set(node.get("required") or []):
                found.append(f"{path}: not every property is required")
            if node.get("additionalProperties") is not False:
                found.append(f"{path}: additionalProperties is not false")
        for key, value in node.items():
            if isinstance(value, (dict, list)):
                found.extend(_strict_violations(value, f"{path}.{key}"))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            found.extend(_strict_violations(value, f"{path}[{index}]"))
    return found


class StrictSchemaTests(unittest.TestCase):
    def test_every_stage_schema_converts_to_a_strict_valid_schema(self) -> None:
        for stage, schema in ALL_STAGE_SCHEMAS.items():
            with self.subTest(stage=stage):
                self.assertEqual(_strict_violations(to_strict_schema(schema)), [])

    def test_conversion_does_not_mutate_contract_schemas(self) -> None:
        self.assertNotIn("operator_note", AI_TRIAGE_RESPONSE_JSON_SCHEMA.get("required", []))
        to_strict_schema(AI_TRIAGE_RESPONSE_JSON_SCHEMA)
        self.assertNotIn("operator_note", AI_TRIAGE_RESPONSE_JSON_SCHEMA.get("required", []))

    def test_null_placeholders_for_optionals_are_dropped_but_required_nulls_kept(self) -> None:
        schema = {
            "type": "object",
            "properties": {
                "keep": {"type": ["string", "null"]},
                "note": {"type": "string"},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {"name": {"type": "string"}, "ref": {"type": "string"}},
                        "required": ["name"],
                    },
                },
            },
            "required": ["keep", "items"],
        }
        result = drop_null_optionals(
            {"keep": None, "note": None, "items": [{"name": "a", "ref": None}, {"name": "b", "ref": "r"}]}, schema
        )
        self.assertEqual(result, {"keep": None, "items": [{"name": "a"}, {"name": "b", "ref": "r"}]})


if __name__ == "__main__":
    unittest.main()
