from __future__ import annotations

import json
from typing import Any


def build_draft_system_prompt() -> str:
    return (
        "You are a deterministic release drafter for Vaulthalla. "
        "Use only explicit evidence from the input. "
        "Never invent fixes, features, impacts, or category meaning. "
        "Do not use speculative wording: likely, suggests, appears to, may indicate, could be interpreted as. "
        "If evidence is weak, say so briefly instead of expanding claims. "
        "Return JSON only that matches the schema."
    )


def build_draft_user_prompt(source_data: dict[str, Any], *, source_kind: str = "payload") -> str:
    source_json = json.dumps(source_data, indent=2, sort_keys=False)
    input_name = "Triage IR" if source_kind == "triage" else "Release payload"
    return (
        "Draft a concise release summary from the structured input below.\n"
        "Requirements:\n"
        "- Keep every claim directly attributable to input evidence.\n"
        "- For triage input, use category `theme` and `grounded_claims` as primary drafting substrate, plus `summary_points` when present.\n"
        "- Treat triage `evidence_refs` as support anchors only; do not echo file paths/lists as primary content.\n"
        "- Convert classifier-style phrasing into clean engineering release language while preserving factual meaning.\n"
        "- Avoid slot-by-slot recap language (for example: signal strength labels, rank narration, evidence-ref narration).\n"
        "- Weight coverage by category priority and signal strength.\n"
        "- In `summary`, foreground the 2-3 strongest release themes first.\n"
        "- Do not give weak/low-signal categories equal space with strong categories.\n"
        "- Synthesize related evidence into clear section-level takeaways; do not merely restate triage bullets.\n"
        "- Include only categories with concrete supporting items.\n"
        "- Keep sections short; avoid repeated framing.\n"
        "- Prefer precise statements over narrative language.\n"
        "- Do not add intro/outro filler.\n"
        "- Keep output concise; avoid verbose repetition across `summary` and section overviews.\n"
        "- Required top-level output fields: `title`, `summary`, `sections`.\n"
        "- Required section fields: `category`, `overview`, `bullets`.\n"
        "- `title` must be concise and non-empty.\n"
        "- Return JSON only.\n\n"
        f"{input_name}:\n"
        f"{source_json}"
    )
