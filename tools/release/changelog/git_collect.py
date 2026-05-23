from __future__ import annotations

import subprocess
from pathlib import Path

from tools.release.changelog.categorize import categorize_path, infer_categories_from_text, normalize_path
from tools.release.changelog.models import CommitInfo
from tools.release.version.models import Version

FIELD_SEP = "\x1f"
RECORD_SEP = "\x1e"


def get_head_sha(repo_root: Path | str = ".") -> str:
    return _run_git(["rev-parse", "HEAD"], repo_root).strip()


def get_latest_tag(repo_root: Path | str = ".") -> str | None:
    try:
        result = _run_git(["describe", "--tags", "--abbrev=0"], repo_root).strip()
        return result or None
    except RuntimeError:
        return None


def get_previous_release_tag_before(repo_root: Path | str, target: Version) -> str | None:
    """Return nearest lower release tag (< target) merged into HEAD.

    Tags must parse as strict semver (optionally prefixed with `v`).
    """
    try:
        output = _run_git(["tag", "--merged", "HEAD", "--list"], repo_root)
    except RuntimeError:
        return None

    parsed: list[tuple[Version, str]] = []
    for raw_tag in output.splitlines():
        tag = raw_tag.strip()
        if not tag:
            continue
        normalized = tag[1:] if tag.startswith("v") else tag
        try:
            tag_version = Version.parse(normalized)
        except ValueError:
            continue
        if tag_version >= target:
            continue
        parsed.append((tag_version, tag))

    if not parsed:
        return None

    parsed.sort(key=lambda item: item[0], reverse=True)
    return parsed[0][1]


def get_commits_since_tag(
    repo_root: Path | str = ".",
    previous_tag: str | None = None,
) -> list[CommitInfo]:
    repo_root = Path(repo_root).resolve()
    commit_range = _build_commit_range(previous_tag)

    pretty = f"%H{FIELD_SEP}%s{FIELD_SEP}%b{RECORD_SEP}"
    output = _run_git(["log", commit_range, f"--pretty=format:{pretty}"], repo_root)

    raw_records = [record for record in output.split(RECORD_SEP) if record.strip()]
    commits: list[CommitInfo] = []

    for record in raw_records:
        parts = record.split(FIELD_SEP, 2)
        if len(parts) < 2:
            continue

        if len(parts) == 2:
            sha, subject = parts
            body = ""
        else:
            sha, subject, body = parts

        sha = sha.strip()
        subject = subject.strip()
        body = body.strip()

        files, insertions, deletions = get_commit_file_summary(repo_root, sha)
        categories = set(categorize_path(path) for path in files)

        # Metadata-only commits can still be meaningful release/tooling work.
        if not files or categories == {"meta"}:
            categories.update(infer_categories_from_text(subject=subject, body=body))

        commits.append(
            CommitInfo(
                sha=sha,
                subject=subject,
                body=body,
                files=files,
                insertions=insertions,
                deletions=deletions,
                categories=sorted(categories),
            )
        )

    return commits


def get_commit_file_summary(
    repo_root: Path | str,
    sha: str,
) -> tuple[list[str], int, int]:
    sha = sha.strip()
    output = _run_git(["show", "--numstat", "--format=", sha], repo_root)

    files: list[str] = []
    insertions = 0
    deletions = 0

    for line in output.splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue

        added_raw, deleted_raw, path = parts
        normalized_path = normalize_path(path)

        files.append(normalized_path)

        if added_raw.isdigit():
            insertions += int(added_raw)

        if deleted_raw.isdigit():
            deletions += int(deleted_raw)

    return files, insertions, deletions


def get_release_file_stats(
    repo_root: Path | str = ".",
    previous_tag: str | None = None,
) -> dict[str, tuple[int, int]]:
    repo_root = Path(repo_root).resolve()
    commit_range = _build_commit_range(previous_tag)

    output = _run_git(["diff", "--numstat", commit_range], repo_root)
    stats: dict[str, tuple[int, int]] = {}

    for line in output.splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue

        added_raw, deleted_raw, path = parts
        normalized_path = normalize_path(path)

        added = int(added_raw) if added_raw.isdigit() else 0
        deleted = int(deleted_raw) if deleted_raw.isdigit() else 0

        stats[normalized_path] = (added, deleted)

    return stats


def get_file_patch(
    repo_root: Path | str,
    path: str,
    previous_tag: str | None = None,
) -> str:
    repo_root = Path(repo_root).resolve()
    commit_range = _build_commit_range(previous_tag)
    normalized_path = normalize_path(path)
    return _run_git(
        ["diff", "--function-context", "--unified=120", commit_range, "--", normalized_path],
        repo_root,
    )


def _build_commit_range(previous_tag: str | None) -> str:
    return f"{previous_tag}..HEAD" if previous_tag else "HEAD"


def _run_git(args: list[str], repo_root: Path | str = ".") -> str:
    repo_root = Path(repo_root).resolve()

    result = subprocess.run(
        ["git", *args],
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=False,
    )

    if result.returncode != 0:
        stderr = result.stderr.strip()
        raise RuntimeError(f"git {' '.join(args)} failed: {stderr}")

    return result.stdout
