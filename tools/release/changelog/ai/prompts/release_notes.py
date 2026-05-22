from __future__ import annotations

import json

from tools.release.changelog.ai.contracts.release_notes import AI_RELEASE_NOTES_SCHEMA_VERSION


def build_release_notes_system_prompt() -> str:
    return (
        "You are a deterministic release notes editor for Vaulthalla. "
        "Rewrite the input changelog into a polished, public-facing markdown release notes document. "
        "Improve readability, structure, grouping, and presentation while preserving factual meaning. "
        "Keep tone restrained and engineering-focused. "
        "The body content (especially bullets and cautions) must remain precise and literal. "

        "Do not invent features, fixes, impact, metrics, timelines, or user claims. "
        "Do not contradict or materially broaden the source changelog. "
        "Preserve cautions and limitations when present. "

        "Do not write marketing copy, slogans, or exaggerated fantasy prose. "
        "Return JSON only that matches the schema."
    )


def build_release_notes_user_prompt(changelog_markdown: str) -> str:
    payload_json = json.dumps({"changelog_markdown": changelog_markdown}, indent=2, sort_keys=False)

    return (
        "Transform the final changelog markdown into cleaner public-facing release notes markdown.\n\n"

        "Allowed edits:\n"
        "- improve headings, ordering, and grouping for readability\n"
        "- tighten or lightly expand phrasing for clarity without adding claims\n"
        "- remove obvious repetition\n"
        "- make section flow presentation-ready while keeping wording factual and concise\n\n"

        "Strict constraints:\n"
        "- bullets must remain literal and engineering-focused\n"
        "- remove classifier residue (path lists, evidence-ref narration, slot-style phrasing)\n"
        "- do not add slogans, marketing phrases, or exaggerated language\n"
        "- do not add any new changes not present in source\n"
        "- do not remove explicit cautions\n"
        "- do not introduce unsupported impact statements\n\n"

        f"- Set `schema_version` exactly to `{AI_RELEASE_NOTES_SCHEMA_VERSION}`.\n"
        "- Return markdown in `markdown`.\n"
        "Return JSON only.\n\n"

        "Final changelog input:\n"
        f"{payload_json}"
    )
