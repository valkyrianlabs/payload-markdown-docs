# tools/release/tests/helpers/build_ai_profile.py

from __future__ import annotations


def build_openai_profile(
    *,
    emergency_triage: str | None = None,
    triage: str | None = None,
    draft: str | None = None,
    polish: str | None = None,
    release_notes: str | None = None,
    release_notes_reasoning_effort: str | None = None,
) -> str:
    stages = {
        "emergency_triage": emergency_triage,
        "triage": triage,
        "draft": draft,
        "polish": polish,
        "release_notes": release_notes,
    }

    lines = [
        "profiles:",
        "  openai-balanced:",
        "    provider: openai",
        "    stages:",
    ]

    for stage, model in stages.items():
        if not model:
            continue

        lines.append(f"      {stage}:")
        lines.append(f"        model: {model}")

        if stage == "release_notes" and release_notes_reasoning_effort:
            lines.append(f"        reasoning_effort: {release_notes_reasoning_effort}")

    return "\n".join(lines) + "\n"


def build_openai_profile_with_all_stages(model: str) -> str:
    return build_openai_profile(
        emergency_triage=model,
        triage=model,
        draft=model,
        polish=model,
        release_notes=model,
    )
