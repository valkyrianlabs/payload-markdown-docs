from __future__ import annotations

import json
from typing import Any

from tools.release.changelog.ai.contracts.emergency_triage import AI_EMERGENCY_TRIAGE_SCHEMA_VERSION


def build_emergency_triage_system_prompt() -> str:
    return (
        "You are a deterministic emergency semantic condenser for Vaulthalla release evidence. "
        "Use only explicit evidence from each input unit. "
        "Do not invent behavior, impact, or claims. "
        "Do not merge units together in this stage. "
        "Produce one synthesized output item per input item, preserving the same `id`. "
        "Prefer concrete change statements over file/path narration. "
        "Return JSON only that matches the schema."
    )


def build_emergency_triage_user_prompt(payload: dict[str, Any]) -> str:
    payload_json = json.dumps(payload, indent=2, sort_keys=False)
    return (
        "Condense each contextual evidence unit into a compact concrete change synthesis.\n"
        "Strict requirements:\n"
        "- Output exactly one item per input `items[*].id`; preserve `id` and `category` exactly.\n"
        "- Do not drop input ids, do not add new ids, do not merge ids.\n"
        "- `change_summary` must be concise, concrete, and evidence-bound.\n"
        "- `change_kind` should classify the dominant change nature (e.g. api-contract, command-surface, "
        "config-surface, schema-change, error-handling, filesystem-lifecycle, packaging-script, "
        "prompt-contract, output-artifact, tests-contract, implementation-change).\n"
        "- Set `confidence` to high|medium|low.\n"
        "- If the unit lacks enough context, set low confidence and populate `insufficient_context_reason`.\n"
        "- `evidence_refs` are optional compact anchors (path/symbol), not prose.\n"
        "- No release-level ranking, no category ranking, no final prose.\n"
        "- No speculative language.\n"
        f"- Set `schema_version` exactly to `{AI_EMERGENCY_TRIAGE_SCHEMA_VERSION}`.\n"
        "- Set top-level `version` exactly to the input payload `version`.\n"
        "- Required top-level output fields: `schema_version`, `version`, `items`.\n"
        "- `items` must be a non-empty array and must contain exactly one item per input id.\n"
        "- Return JSON only.\n\n"
        "Emergency triage input payload:\n"
        f"{payload_json}"
    )
