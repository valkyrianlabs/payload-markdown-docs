from __future__ import annotations

import json
from dataclasses import asdict

from tools.release.changelog.categorize import CATEGORY_ORDER
from tools.release.changelog.models import ReleaseContext

TOP_COMMITS_PER_CATEGORY = 3
TOP_FILES_PER_CATEGORY = 3
TOP_SNIPPETS_PER_CATEGORY = 4


def render_release_changelog(context: ReleaseContext) -> str:
    """Render a deterministic, human-reviewable markdown changelog draft.

    Rendering contract:
    - Stable category ordering:
      1) categories in CATEGORY_ORDER, 2) remaining categories alphabetical.
    - Stable bullet ordering:
      themes alphabetical (already normalized upstream), then commits/files/snippets
      in list order as provided by ReleaseContext, truncated by fixed TOP_* limits.
    - Explicit empty-state fallbacks for categories and release-wide no-content cases.
    - Pure presentation only; this renderer never reaches back into git.
    """
    lines = [f"# Release Draft: {context.version}", ""]
    lines.extend(_render_metadata(context))
    lines.append("")

    ordered_categories = _ordered_categories(context)
    if not ordered_categories and not context.uncategorized_commits:
        lines.extend(
            [
                "## Highlights",
                "- No categorized release content is available for this range.",
                "- This release may contain only merge/version metadata updates.",
                "",
            ]
        )
        return "\n".join(lines).rstrip() + "\n"

    for name, category in ordered_categories:
        lines.extend(_render_category_section(name, category))
        lines.append("")

    if context.uncategorized_commits:
        lines.extend(_render_uncategorized_section(context))
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def render_debug_context(context: ReleaseContext) -> str:
    lines = [
        "=== RELEASE CONTEXT DEBUG ===",
        "",
        f"Version:        {context.version}",
        f"Previous tag:   {context.previous_tag}",
        f"HEAD:           {context.head_sha}",
        f"Commit count:   {context.commit_count}",
        "",
    ]

    ordered_categories = _ordered_categories(context)
    if not ordered_categories:
        lines.extend(["No categories collected.", ""])
        return "\n".join(lines).rstrip() + "\n"

    for name, category in ordered_categories:
        lines.extend(
            [
                f"--- CATEGORY: {name} ---",
                f"Commits:      {category.commit_count}",
                f"Insertions:   {category.insertions}",
                f"Deletions:    {category.deletions}",
                f"Themes:       {', '.join(category.detected_themes) or 'none'}",
                "",
                "Top Files:",
            ]
        )

        if category.files:
            for file_change in category.files[:TOP_FILES_PER_CATEGORY]:
                lines.append(
                    f"  - {file_change.path} "
                    f"(score={file_change.score}, +{file_change.insertions}/-{file_change.deletions}, "
                    f"commits={file_change.commit_count}, flags={list(file_change.flags)})"
                )
        else:
            lines.append("  - none")

        lines.append("")
        lines.append("Recent Commits:")
        if category.commits:
            for commit in category.commits[:TOP_COMMITS_PER_CATEGORY]:
                lines.append(f"  - {commit.subject} ({commit.sha[:7]})")
        else:
            lines.append("  - none")

        lines.append("")
        lines.append("Top Snippets:")
        if category.snippets:
            for snippet in category.snippets[:TOP_SNIPPETS_PER_CATEGORY]:
                details = []
                if snippet.region_kind:
                    details.append(f"region={snippet.region_kind}")
                if snippet.region_label:
                    details.append(f"label={snippet.region_label}")
                if snippet.hunk_count > 1:
                    details.append(f"hunks={snippet.hunk_count}")
                if snippet.changed_lines > 0:
                    details.append(f"changed={snippet.changed_lines}")
                metadata = f", {'; '.join(details)}" if details else ""
                lines.append(f"  - {snippet.path} (score={snippet.score}, reason={snippet.reason}{metadata})")
                preview = _snippet_preview_line(snippet.patch)
                if preview:
                    lines.append(f"    preview: {preview}")
        else:
            lines.append("  - none")

        lines.extend(["", ""])

    return "\n".join(lines).rstrip() + "\n"


def render_debug_json(context: ReleaseContext) -> str:
    return json.dumps(asdict(context), indent=2)


def _render_metadata(context: ReleaseContext) -> list[str]:
    previous_tag = context.previous_tag if context.previous_tag is not None else "none"
    lines = [
        f"- Previous tag: `{previous_tag}`",
        f"- HEAD: `{context.head_sha[:7]}`",
        f"- Commits in range: {context.commit_count}",
        f"- Release-note entries: {_release_note_entry_count(context)}",
    ]

    if context.commit_count > 0 and _release_note_entry_count(context) == 0:
        lines.append(
            "- Note: commits are outside primary app-facing buckets; see `Meta`/`Uncategorized` sections."
        )

    for note in context.cross_cutting_notes:
        lines.append(f"- Warning: {note}")

    return lines


def _ordered_categories(context: ReleaseContext):
    category_rank = {name: index for index, name in enumerate(CATEGORY_ORDER)}
    return sorted(
        context.categories.items(),
        key=lambda item: (category_rank.get(item[0], len(CATEGORY_ORDER)), item[0]),
    )


def _render_category_section(name, category):
    files_count = len(category.files)
    snippets_count = len(category.snippets)
    change_total = category.insertions + category.deletions
    evidence_tier = _evidence_tier(category.commit_count, files_count, snippets_count, change_total)

    lines = [
        f"## {name.title()}",
        (
            f"- Evidence: {evidence_tier} "
            f"(commits: {category.commit_count}, files: {files_count}, snippets: {snippets_count}, "
            f"delta: +{category.insertions}/-{category.deletions})"
        ),
    ]

    if category.detected_themes:
        themes = ", ".join(f"`{theme}`" for theme in category.detected_themes)
        lines.append(f"- Themes: {themes}")
    else:
        lines.append("- Themes: none detected")

    if _is_weak_signal(name, category, evidence_tier):
        lines.append("- Signal: low-confidence category; changes appear metadata-only or sparse.")

    lines.append("- Key commits:")
    if category.commits:
        for commit in category.commits[:TOP_COMMITS_PER_CATEGORY]:
            lines.append(f"  - {commit.subject} (`{commit.sha[:7]}`)")
    else:
        lines.append("  - none collected")

    lines.append("- Top files:")
    if category.files:
        for file_change in category.files[:TOP_FILES_PER_CATEGORY]:
            lines.append(
                f"  - `{file_change.path}` (+{file_change.insertions}/-{file_change.deletions}, "
                f"score {file_change.score})"
            )
    else:
        lines.append("  - none collected")

    if category.snippets:
        lines.append("- Snippets:")
        for snippet in category.snippets[:TOP_SNIPPETS_PER_CATEGORY]:
            details = []
            if snippet.region_kind:
                details.append(snippet.region_kind)
            if snippet.region_label:
                details.append(snippet.region_label)
            if snippet.hunk_count > 1:
                details.append(f"{snippet.hunk_count} hunks")
            detail_suffix = f" [{'; '.join(details)}]" if details else ""
            lines.append(
                f"  - `{snippet.path}` — {snippet.reason}{detail_suffix} (score {snippet.score})"
            )
    elif category.files:
        lines.append("- Snippets: none extracted; file-level evidence only.")
    else:
        lines.append("- Snippets: none available.")

    return lines


def _evidence_tier(
    commit_count: int,
    files_count: int,
    snippets_count: int,
    change_total: int,
) -> str:
    if snippets_count >= 2 or change_total >= 80 or commit_count >= 4:
        return "strong"
    if snippets_count >= 1 or change_total >= 20 or commit_count >= 2 or files_count >= 3:
        return "moderate"
    return "weak"


def _is_weak_signal(name: str, category, evidence_tier: str) -> bool:
    if evidence_tier != "weak":
        return False

    change_total = category.insertions + category.deletions
    if not category.files and not category.commits:
        return True

    if name == "meta" and category.snippets == [] and change_total <= 10:
        return True

    return change_total <= 12 and len(category.snippets) == 0


def _release_note_entry_count(context: ReleaseContext) -> int:
    primary_commit_ids: set[str] = set()
    for category_name, category in context.categories.items():
        if category_name == "meta":
            continue
        primary_commit_ids.update(commit.sha for commit in category.commits)
    return len(primary_commit_ids)


def _snippet_preview_line(patch: str) -> str | None:
    for line in patch.splitlines():
        if line.startswith(("+++", "---", "@@")):
            continue
        if not line.startswith(("+", "-")):
            continue
        payload = line[1:].strip()
        if not payload:
            continue
        if len(payload) > 120:
            payload = payload[:120].rstrip() + "..."
        return payload
    return None


def _render_uncategorized_section(context: ReleaseContext) -> list[str]:
    lines = [
        "## Uncategorized",
        (
            f"- Evidence: weak (commits: {len(context.uncategorized_commits)}, files: 0, snippets: 0, "
            "delta: +0/-0)"
        ),
        "- Themes: none detected",
        "- Key commits:",
    ]
    for commit in context.uncategorized_commits[:TOP_COMMITS_PER_CATEGORY]:
        lines.append(f"  - {commit.subject} (`{commit.sha[:7]}`)")
    lines.extend(
        [
            "- Top files:",
            "  - none collected",
            "- Snippets: none available.",
        ]
    )
    return lines
