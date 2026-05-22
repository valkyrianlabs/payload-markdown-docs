from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from tools.release.version.adapters import (
    DebianVersion,
    read_debian_version,
    read_meson_version,
    read_package_json_version,
    read_version_file,
)
from tools.release.version.models import Version


@dataclass(frozen=True)
class ReleasePaths:
    repo_root: Path
    version_file: Path
    meson_file: Path
    package_json_file: Path
    debian_changelog_file: Path

    @classmethod
    def from_repo_root(cls, repo_root: Path | str) -> "ReleasePaths":
        root = Path(repo_root).resolve()
        return cls(
            repo_root=root,
            version_file=root / "VERSION",
            meson_file=root / "meson.build",
            package_json_file=root / "web" / "package.json",
            debian_changelog_file=root / "debian" / "changelog",
        )


@dataclass(frozen=True)
class VersionReadResult:
    canonical: Version | None = None
    meson: Version | None = None
    package_json: Version | None = None
    debian: DebianVersion | None = None


@dataclass(frozen=True)
class ValidationIssue:
    code: str
    message: str


@dataclass(frozen=True)
class ReleaseState:
    paths: ReleasePaths
    versions: VersionReadResult
    issues: tuple[ValidationIssue, ...] = field(default_factory=tuple)

    @property
    def canonical_version(self) -> Version | None:
        return self.versions.canonical

    @property
    def drift_issues(self) -> tuple[ValidationIssue, ...]:
        return tuple(issue for issue in self.issues if issue.code.endswith("_mismatch"))

    @property
    def structural_issues(self) -> tuple[ValidationIssue, ...]:
        return tuple(issue for issue in self.issues if not issue.code.endswith("_mismatch"))

    @property
    def has_drift(self) -> bool:
        return len(self.drift_issues) > 0

    @property
    def has_structural_errors(self) -> bool:
        return len(self.structural_issues) > 0

    @property
    def is_valid(self) -> bool:
        return len(self.issues) == 0


def validate_release_state(paths: ReleasePaths) -> ReleaseState:
    issues: list[ValidationIssue] = []

    _validate_required_paths(paths, issues)

    canonical_version: Version | None = None
    meson_version: Version | None = None
    package_json_version: Version | None = None
    debian_version: DebianVersion | None = None

    if paths.version_file.is_file():
        try:
            canonical_version = read_version_file(paths.version_file)
        except Exception as exc:
            issues.append(
                ValidationIssue(
                    code="version_file_read_failed",
                    message=f"Failed to read canonical version from {paths.version_file}: {exc}",
                )
            )

    if paths.meson_file.is_file():
        try:
            meson_version = read_meson_version(paths.meson_file)
        except Exception as exc:
            issues.append(
                ValidationIssue(
                    code="meson_read_failed",
                    message=f"Failed to read Meson version from {paths.meson_file}: {exc}",
                )
            )

    if paths.package_json_file.is_file():
        try:
            package_json_version = read_package_json_version(paths.package_json_file)
        except Exception as exc:
            issues.append(
                ValidationIssue(
                    code="package_json_read_failed",
                    message=f"Failed to read package.json version from {paths.package_json_file}: {exc}",
                )
            )

    if paths.debian_changelog_file.is_file():
        try:
            debian_version = read_debian_version(paths.debian_changelog_file)
        except Exception as exc:
            issues.append(
                ValidationIssue(
                    code="debian_read_failed",
                    message=f"Failed to read Debian changelog version from {paths.debian_changelog_file}: {exc}",
                )
            )

    versions = VersionReadResult(
        canonical=canonical_version,
        meson=meson_version,
        package_json=package_json_version,
        debian=debian_version,
    )

    _validate_version_consistency(versions, issues)

    return ReleaseState(
        paths=paths,
        versions=versions,
        issues=tuple(issues),
    )


def get_release_state(repo_root: Path | str = ".") -> ReleaseState:
    return validate_release_state(ReleasePaths.from_repo_root(repo_root))


def require_release_files(repo_root: Path | str = ".") -> ReleaseState:
    state = get_release_state(repo_root)

    if state.has_structural_errors:
        rendered = "\n".join(f"- [{issue.code}] {issue.message}" for issue in state.structural_issues)
        raise ValueError(f"Release state has structural errors:\n{rendered}")

    if state.canonical_version is None:
        raise ValueError("Canonical VERSION file could not be resolved")

    return state


def require_synced_release_state(repo_root: Path | str = ".") -> ReleaseState:
    state = require_release_files(repo_root)

    if state.has_drift:
        raise ValueError(build_sync_required_message(state))

    return state


def build_sync_required_message(state: ReleaseState) -> str:
    canonical = state.versions.canonical
    lines = [
        "Managed release files are out of sync with VERSION.",
        "",
        f"VERSION:          {format_value(canonical)}",
        f"meson.build:      {format_value(state.versions.meson)}{mismatch_suffix(state.versions.meson, canonical)}",
        f"package.json:     {format_value(state.versions.package_json)}{mismatch_suffix(state.versions.package_json, canonical)}",
        f"debian/changelog: {format_value(state.versions.debian)}{debian_mismatch_suffix(state.versions.debian, canonical)}",
        "",
        "Run:",
        "  python -m tools.release sync",
        "",
        "Or manually reconcile the managed files to match VERSION before retrying.",
    ]
    return "\n".join(lines)


def _validate_required_paths(paths: ReleasePaths, issues: list[ValidationIssue]) -> None:
    if not paths.repo_root.exists():
        issues.append(
            ValidationIssue(
                code="repo_root_missing",
                message=f"Repository root does not exist: {paths.repo_root}",
            )
        )
        return

    if not paths.repo_root.is_dir():
        issues.append(
            ValidationIssue(
                code="repo_root_not_dir",
                message=f"Repository root is not a directory: {paths.repo_root}",
            )
        )

    required_files = (
        ("version_file_missing", paths.version_file),
        ("meson_missing", paths.meson_file),
        ("package_json_missing", paths.package_json_file),
        ("debian_changelog_missing", paths.debian_changelog_file),
    )

    for code, file_path in required_files:
        if not file_path.is_file():
            issues.append(
                ValidationIssue(
                    code=code,
                    message=f"Required file is missing: {file_path}",
                )
            )


def _validate_version_consistency(
    versions: VersionReadResult,
    issues: list[ValidationIssue],
) -> None:
    canonical = versions.canonical
    if canonical is None:
        return

    if versions.meson is not None and versions.meson != canonical:
        issues.append(
            ValidationIssue(
                code="meson_version_mismatch",
                message=f"meson.build version {versions.meson} does not match VERSION {canonical}",
            )
        )

    if versions.package_json is not None and versions.package_json != canonical:
        issues.append(
            ValidationIssue(
                code="package_json_version_mismatch",
                message=f"package.json version {versions.package_json} does not match VERSION {canonical}",
            )
        )

    if versions.debian is not None and versions.debian.upstream != canonical:
        issues.append(
            ValidationIssue(
                code="debian_version_mismatch",
                message=(
                    f"debian/changelog upstream version {versions.debian.upstream} "
                    f"does not match VERSION {canonical}"
                ),
            )
        )


def format_value(value) -> str:
    return str(value) if value is not None else "<unavailable>"


def mismatch_suffix(value: Version | None, canonical: Version | None) -> str:
    if value is None or canonical is None:
        return ""
    return "   [mismatch]" if value != canonical else ""


def debian_mismatch_suffix(value: DebianVersion | None, canonical: Version | None) -> str:
    if value is None or canonical is None:
        return ""
    return "   [upstream mismatch]" if value.upstream != canonical else ""
