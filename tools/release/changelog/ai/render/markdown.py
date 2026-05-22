from __future__ import annotations

from tools.release.changelog.ai.contracts.draft import AIDraftResult
from tools.release.changelog.ai.contracts.polish import AIPolishResult


def render_draft_markdown(draft: AIDraftResult) -> str:
    return _render_markdown(
        title=draft.title,
        summary=draft.summary,
        sections=[
            {
                "category": section.category,
                "overview": section.overview,
                "bullets": section.bullets,
            }
            for section in draft.sections
        ],
        notes=draft.notes,
    )


def render_polish_markdown(polish: AIPolishResult) -> str:
    return _render_markdown(
        title=polish.title,
        summary=polish.summary,
        sections=[
            {
                "category": section.category,
                "overview": section.overview,
                "bullets": section.bullets,
            }
            for section in polish.sections
        ],
        notes=polish.notes,
    )


def _render_markdown(*, title: str, summary: str, sections: list[dict], notes: tuple[str, ...]) -> str:
    lines = [f"# {title}", "", summary, ""]
    for section in sections:
        lines.append(f"## {section['category'].title()}")
        lines.append(section["overview"])
        lines.append("")
        for bullet in section["bullets"]:
            lines.append(f"- {bullet}")
        lines.append("")

    if notes:
        lines.append("## Notes")
        for note in notes:
            lines.append(f"- {note}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"
