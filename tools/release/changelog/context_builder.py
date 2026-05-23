from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from tools.release.changelog.categorize import (
    CATEGORY_ORDER,
    categorize_path,
    detect_flags,
    detect_themes_for_paths,
    extract_subscopes,
)
from tools.release.changelog.git_collect import (
    get_commits_since_tag,
    get_first_release_tag_for_major,
    get_head_sha,
    get_latest_tag,
    get_previous_release_tag_before,
    get_release_file_stats,
)
from tools.release.changelog.models import CategoryContext, CommitInfo, FileChange, ReleaseContext
from tools.release.changelog.scoring import score_file_change
from tools.release.changelog.snippets import extract_relevant_snippets
from tools.release.version.models import Version


@dataclass(frozen=True)
class _ResolvedPreviousTag:
    previous_tag: str | None
    latest_tag: str | None = None
    skipped_current_release_tag: bool = False


def build_release_context(
    version: str,
    repo_root: Path | str = ".",
    previous_tag: str | None = None,
) -> ReleaseContext:
    repo_root = Path(repo_root).resolve()
    explicit_previous_tag = previous_tag is not None
    latest_tag: str | None = None
    skipped_current_release_tag = False
    parsed_version: Version | None = None
    try:
        parsed_version = Version.parse(version)
    except ValueError:
        parsed_version = None
    release_kind = _release_kind(parsed_version)
    release_focus = _release_focus(release_kind)

    if previous_tag is None:
        resolved_previous_tag = _resolve_default_previous_tag_result(repo_root, version)
        previous_tag = resolved_previous_tag.previous_tag
        latest_tag = resolved_previous_tag.latest_tag
        skipped_current_release_tag = resolved_previous_tag.skipped_current_release_tag
        if parsed_version is not None and _is_current_release_tag(previous_tag, parsed_version):
            raise ValueError(
                "Default changelog checkpoint resolved to the current release tag "
                f"`{previous_tag}` for VERSION {version}; refusing to build an empty post-tag release range."
            )
    head_sha = get_head_sha(repo_root)

    commits = get_commits_since_tag(repo_root, previous_tag)
    file_stats = get_release_file_stats(repo_root, previous_tag)
    file_commit_counts = get_file_commit_counts(commits)
    uncategorized_commits = [commit for commit in commits if not commit.categories]

    categories = build_category_contexts(
        commits=commits,
        file_stats=file_stats,
        file_commit_counts=file_commit_counts,
    )

    snippet_map = extract_relevant_snippets(
        repo_root=repo_root,
        previous_tag=previous_tag,
        category_contexts=categories,
    )

    final_categories: dict[str, CategoryContext] = {}
    for name, context in categories.items():
        final_categories[name] = CategoryContext(
            name=context.name,
            commit_count=context.commit_count,
            insertions=context.insertions,
            deletions=context.deletions,
            commits=context.commits,
            files=context.files,
            snippets=snippet_map.get(name, []),
            detected_themes=context.detected_themes,
        )

    cross_cutting_notes: list[str] = []
    if parsed_version is not None and _is_current_release_tag(previous_tag, parsed_version):
        cross_cutting_notes.append(
            "Explicit changelog checkpoint points at the current release tag; "
            "the release range may be empty or contain only post-tag commits."
        )
    if skipped_current_release_tag:
        resolved_label = previous_tag or "none"
        cross_cutting_notes.append(
            "Current release tag was skipped as the changelog checkpoint; "
            f"using previous tag `{resolved_label}` for release evidence."
        )
    if parsed_version is not None and release_kind == "major" and not explicit_previous_tag:
        if previous_tag:
            cross_cutting_notes.append(
                "Major release context uses the first tag from the previous major line "
                f"(`{previous_tag}`) so evidence covers the full previous major cycle."
            )
        else:
            cross_cutting_notes.append(
                "Major release context found no previous major release tag; "
                "using full project history for release evidence."
            )

    return ReleaseContext(
        version=version,
        previous_tag=previous_tag,
        head_sha=head_sha,
        commit_count=len(commits),
        categories=final_categories,
        commits=commits,
        uncategorized_commits=uncategorized_commits,
        cross_cutting_notes=cross_cutting_notes,
        latest_tag=latest_tag,
        skipped_current_release_tag=skipped_current_release_tag,
        explicit_previous_tag=explicit_previous_tag,
        release_kind=release_kind,
        release_focus=release_focus,
    )


def _resolve_default_previous_tag(repo_root: Path, version: str) -> str | None:
    return _resolve_default_previous_tag_result(repo_root, version).previous_tag


def _resolve_default_previous_tag_result(repo_root: Path, version: str) -> _ResolvedPreviousTag:
    latest_tag = get_latest_tag(repo_root)
    try:
        parsed_version = Version.parse(version)
    except ValueError:
        return _ResolvedPreviousTag(previous_tag=latest_tag, latest_tag=latest_tag)
    skipped_current_release_tag = _is_current_release_tag(latest_tag, parsed_version)
    if _is_major_release(parsed_version):
        previous_major = parsed_version.major - 1
        previous_tag = get_first_release_tag_for_major(repo_root, previous_major) if previous_major > 0 else None
        return _ResolvedPreviousTag(
            previous_tag=previous_tag,
            latest_tag=latest_tag,
            skipped_current_release_tag=skipped_current_release_tag,
        )
    if parsed_version.patch <= 0:
        previous_tag = get_previous_release_tag_before(repo_root, parsed_version)
        return _ResolvedPreviousTag(
            previous_tag=previous_tag,
            latest_tag=latest_tag,
            skipped_current_release_tag=skipped_current_release_tag,
        )
    line_base = Version(parsed_version.major, parsed_version.minor, 0)
    lower_release_tag = get_previous_release_tag_before(repo_root, line_base)
    candidate = lower_release_tag or latest_tag
    if _is_current_release_tag(candidate, parsed_version):
        candidate = get_previous_release_tag_before(repo_root, parsed_version)
    return _ResolvedPreviousTag(
        previous_tag=candidate,
        latest_tag=latest_tag,
        skipped_current_release_tag=skipped_current_release_tag,
    )


def _is_current_release_tag(tag: str | None, version: Version) -> bool:
    if tag is None:
        return False
    normalized = tag.strip()
    if normalized.startswith("v"):
        normalized = normalized[1:]
    return normalized == str(version)


def _is_major_release(version: Version) -> bool:
    return version.major > 0 and version.minor == 0 and version.patch == 0


def _release_kind(version: Version | None) -> str:
    if version is not None and _is_major_release(version):
        return "major"
    return "standard"


def _release_focus(release_kind: str) -> tuple[str, ...]:
    if release_kind == "major":
        return ("new features", "breaking changes if any", "general release notes")
    return ()


def get_file_commit_counts(commits: list[CommitInfo]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for commit in commits:
        seen_in_commit = set(commit.files)
        for path in seen_in_commit:
            counts[path] += 1
    return dict(counts)


def build_category_contexts(
    *,
    commits: list[CommitInfo],
    file_stats: dict[str, tuple[int, int]],
    file_commit_counts: dict[str, int],
) -> dict[str, CategoryContext]:
    commit_map: dict[str, list[CommitInfo]] = defaultdict(list)
    path_map: dict[str, list[str]] = defaultdict(list)

    for commit in commits:
        for category in commit.categories:
            commit_map[category].append(commit)

        for path in commit.files:
            category = categorize_path(path)
            path_map[category].append(path)

    categories: dict[str, CategoryContext] = {}
    for category in CATEGORY_ORDER:
        category_commits = commit_map.get(category, [])
        category_paths = sorted(set(path_map.get(category, [])))

        if not category_commits and not category_paths:
            continue

        file_changes: list[FileChange] = []
        total_insertions = 0
        total_deletions = 0

        for path in category_paths:
            insertions, deletions = file_stats.get(path, (0, 0))
            total_insertions += insertions
            total_deletions += deletions

            flags = detect_flags(path)
            subscopes = extract_subscopes(path, category)
            score = score_file_change(
                path=path,
                category=category,
                insertions=insertions,
                deletions=deletions,
                commit_count=file_commit_counts.get(path, 0),
                flags=flags,
            )

            file_changes.append(
                FileChange(
                    path=path,
                    category=category,
                    subscopes=subscopes,
                    insertions=insertions,
                    deletions=deletions,
                    commit_count=file_commit_counts.get(path, 0),
                    score=score,
                    flags=flags,
                )
            )

        file_changes.sort(key=lambda item: item.score, reverse=True)
        detected_themes = detect_themes_for_paths([file.path for file in file_changes])

        categories[category] = CategoryContext(
            name=category,
            commit_count=len(category_commits),
            insertions=total_insertions,
            deletions=total_deletions,
            commits=category_commits,
            files=file_changes,
            snippets=[],
            detected_themes=detected_themes,
        )

    return categories
