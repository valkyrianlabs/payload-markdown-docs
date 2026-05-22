from __future__ import annotations

import shutil
import subprocess
import tarfile
from dataclasses import dataclass, field
from fnmatch import fnmatch
from io import BytesIO
from pathlib import Path
from typing import Iterable

from tools.release.version.adapters.debian import CHANGELOG_HEADER_PATTERN
from tools.release.version.validate import ReleasePaths, require_synced_release_state

DEBIAN_BUILD_COMMAND: tuple[str, ...] = ("dpkg-buildpackage", "-us", "-uc", "-b")
DEBIAN_REQUIRED_FILES: tuple[str, ...] = (
    "debian/changelog",
    "debian/control",
    "debian/rules",
    "debian/source/format",
)
DEFAULT_OUTPUT_DIR_NAME = "release"
SUPPORTED_ARTIFACT_SUFFIXES: tuple[str, ...] = (
    ".deb",
    ".udeb",
    ".changes",
    ".buildinfo",
    ".dsc",
    ".build",
    ".tar.xz",
    ".tar.gz",
    ".debian.tar.xz",
    ".debian.tar.gz",
)
REQUIRED_DEBIAN_PACKAGE_PATHS: tuple[str, ...] = (
    "usr/bin/pmdocs",
    "usr/share/doc/pmdocs/copyright",
    "usr/share/pmdocs/skills/payload-markdown-docs/codex/SKILL.md",
    "usr/share/pmdocs/skills/payload-markdown-docs/claude/SKILL.md",
)
ALTERNATE_DEBIAN_PACKAGE_PATH_GROUPS: tuple[tuple[str, ...], ...] = ()


@dataclass(frozen=True)
class DebianBuildResult:
    repo_root: Path
    output_dir: Path
    command: tuple[str, ...]
    dry_run: bool
    package_name: str
    package_version: str
    artifacts: tuple[Path, ...]
    build_log: Path | None = None
    web_artifact: Path | None = None


@dataclass(frozen=True)
class ReleaseArtifactValidationResult:
    output_dir: Path
    debian_artifacts: tuple[Path, ...]
    web_artifacts: tuple[Path, ...] = ()
    changelog_artifacts: tuple[Path, ...] = ()
    homebrew_artifacts: tuple[Path, ...] = field(default_factory=tuple)


def build_debian_package(
    *,
    repo_root: Path | str = ".",
    output_dir: Path | str | None = None,
    dry_run: bool = False,
) -> DebianBuildResult:
    root = Path(repo_root).resolve()
    state = require_synced_release_state(root)
    _require_debian_prerequisites(state.paths)

    changelog_path = state.paths.debian_changelog_file
    package_name, package_version = _read_debian_changelog_identity(changelog_path)
    destination = _resolve_output_dir(root, output_dir)

    command = DEBIAN_BUILD_COMMAND
    if dry_run:
        return DebianBuildResult(
            repo_root=root,
            output_dir=destination,
            command=command,
            dry_run=True,
            package_name=package_name,
            package_version=package_version,
            artifacts=(),
            build_log=None,
            web_artifact=None,
        )

    _require_build_tool(command[0])
    _ensure_output_dir_writable(destination)

    completed = _run_command(command=command, cwd=root)
    build_log = _write_build_log(
        destination=destination,
        command=command,
        cwd=root,
        debian_build=completed,
    )

    if completed.returncode != 0:
        stderr_tail = _tail_lines(completed.stderr, limit=25)
        raise ValueError(
            f"Debian build failed with exit code {completed.returncode}. "
            f"See log: {build_log}\n{stderr_tail}"
        )

    artifacts = _collect_build_artifacts(
        search_dir=root.parent,
        output_dir=destination,
        package_name=package_name,
        package_version=package_version,
    )
    if not artifacts:
        raise ValueError(
            "Debian build succeeded but no packaging artifacts were found. "
            f"Searched under {root.parent} for {package_name}_{package_version}*"
        )

    return DebianBuildResult(
        repo_root=root,
        output_dir=destination,
        command=command,
        dry_run=False,
        package_name=package_name,
        package_version=package_version,
        artifacts=artifacts,
        build_log=build_log,
        web_artifact=None,
    )


def validate_release_artifacts(
    *,
    output_dir: Path | str,
    require_changelog: bool = True,
    require_homebrew: bool = False,
) -> ReleaseArtifactValidationResult:
    destination = Path(output_dir).resolve()
    if not destination.is_dir():
        raise ValueError(
            "Release artifact validation failed: output directory does not exist: "
            f"{destination}"
        )

    debian_artifacts = tuple(
        sorted(
            path
            for path in destination.iterdir()
            if path.is_file() and path.name.endswith(".deb")
        )
    )
    homebrew_artifacts = _find_homebrew_formula_artifacts(destination)

    changelog_expected = (
        destination / "changelog.release.md",
        destination / "changelog.raw.md",
        destination / "changelog.payload.json",
        destination / "changelog.semantic_payload.json",
        destination / "changelog.context.json",
    )
    changelog_artifacts = tuple(path for path in changelog_expected if path.is_file())

    missing: list[str] = []
    if not debian_artifacts:
        missing.append("Debian package artifact (*.deb)")
    if require_homebrew and not homebrew_artifacts:
        missing.append("Homebrew formula artifact (homebrew/Formula/pmdocs.rb)")
    if require_changelog and len(changelog_artifacts) != len(changelog_expected):
        missing.extend(str(path) for path in changelog_expected if not path.is_file())

    if missing:
        rendered = "\n".join(f"- {item}" for item in missing)
        raise ValueError(
            "Release artifact validation failed. Missing expected outputs:\n"
            f"{rendered}"
        )

    contract_issues: list[str] = []
    for artifact in debian_artifacts:
        contract_issues.extend(_validate_debian_package_contract(artifact))
    if require_homebrew:
        for formula in homebrew_artifacts:
            contract_issues.extend(_validate_homebrew_formula_artifact(formula))
    if contract_issues:
        rendered = "\n".join(f"- {item}" for item in contract_issues)
        raise ValueError(
            "Release artifact validation failed. Artifact completeness checks did not match the "
            "current packaging/deployment contract:\n"
            f"{rendered}"
        )

    return ReleaseArtifactValidationResult(
        output_dir=destination,
        debian_artifacts=debian_artifacts,
        web_artifacts=(),
        changelog_artifacts=changelog_artifacts,
        homebrew_artifacts=homebrew_artifacts,
    )


def _validate_debian_package_contract(deb_path: Path) -> list[str]:
    members = _read_debian_package_members(deb_path)
    issues: list[str] = []

    for required in REQUIRED_DEBIAN_PACKAGE_PATHS:
        if required not in members:
            issues.append(f"[debian package] {deb_path.name}: missing `{required}`")

    for alternatives in ALTERNATE_DEBIAN_PACKAGE_PATH_GROUPS:
        if not any(_member_matches_pattern(members, candidate) for candidate in alternatives):
            rendered = " or ".join(f"`{candidate}`" for candidate in alternatives)
            issues.append(
                f"[debian package] {deb_path.name}: missing expected path ({rendered})"
            )

    return issues


def _read_debian_package_members(deb_path: Path) -> set[str]:
    try:
        completed = subprocess.run(
            ("dpkg-deb", "--fsys-tarfile", str(deb_path)),
            text=False,
            capture_output=True,
            check=False,
        )
    except FileNotFoundError as exc:
        raise ValueError(
            "Cannot validate Debian package contents: `dpkg-deb` is not installed or not on PATH."
        ) from exc
    except Exception as exc:
        raise ValueError(f"Failed to inspect Debian package contents for {deb_path}: {exc}") from exc

    if completed.returncode != 0:
        stderr = completed.stderr.decode("utf-8", errors="replace").strip()
        raise ValueError(
            f"Failed to inspect Debian package contents for {deb_path} "
            f"(exit {completed.returncode}): {stderr or 'no stderr output'}"
        )

    try:
        with tarfile.open(fileobj=BytesIO(completed.stdout), mode="r:*") as data_tar:
            normalized = {
                _normalize_archive_path(member.name)
                for member in data_tar.getmembers()
                if _normalize_archive_path(member.name)
            }
    except Exception as exc:
        raise ValueError(f"Failed to parse Debian data tar stream for {deb_path}: {exc}") from exc

    return normalized


def _normalize_archive_path(raw: str) -> str:
    normalized = raw.strip()
    if normalized in {"", ".", "./"}:
        return ""
    while normalized.startswith("./"):
        normalized = normalized[2:]
    if normalized.endswith("/"):
        normalized = normalized[:-1]
    return normalized


def _member_matches_pattern(members: set[str], pattern: str) -> bool:
    if "*" not in pattern:
        return pattern in members
    return any(fnmatch(member, pattern) for member in members)


def _require_debian_prerequisites(paths: ReleasePaths) -> None:
    missing: list[Path] = []
    for relative in DEBIAN_REQUIRED_FILES:
        path = paths.repo_root / relative
        if not path.is_file():
            missing.append(path)

    if missing:
        rendered = "\n".join(f"- {path}" for path in missing)
        raise ValueError(f"Debian packaging prerequisites are missing:\n{rendered}")


def _read_debian_changelog_identity(changelog_path: Path) -> tuple[str, str]:
    lines = changelog_path.read_text(encoding="utf-8").splitlines()
    if not lines:
        raise ValueError(f"Debian changelog is empty: {changelog_path}")
    first_line = lines[0].strip()
    match = CHANGELOG_HEADER_PATTERN.fullmatch(first_line)
    if not match:
        raise ValueError(f"Could not parse Debian changelog header in {changelog_path}: {first_line}")
    return match.group("package"), match.group("full_version")


def _resolve_output_dir(repo_root: Path, output_dir: Path | str | None) -> Path:
    if output_dir is None:
        return repo_root / DEFAULT_OUTPUT_DIR_NAME

    candidate = Path(output_dir)
    if not candidate.is_absolute():
        return (repo_root / candidate).resolve()
    return candidate


def _require_build_tool(tool_name: str) -> None:
    if shutil.which(tool_name) is None:
        raise ValueError(
            f"Required build tool `{tool_name}` is not installed or not on PATH."
        )


def _ensure_output_dir_writable(output_dir: Path) -> None:
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        raise ValueError(f"Failed to create output directory {output_dir}: {exc}") from exc

    probe = output_dir / ".write-probe"
    try:
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
    except Exception as exc:
        raise ValueError(f"Output directory is not writable: {output_dir} ({exc})") from exc


def _run_command(*, command: Iterable[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            tuple(command),
            cwd=str(cwd),
            text=True,
            capture_output=True,
            check=False,
        )
    except FileNotFoundError as exc:
        raise ValueError(f"Build command not found: {command}") from exc
    except Exception as exc:
        raise ValueError(f"Failed to execute command `{' '.join(command)}`: {exc}") from exc


def _write_build_log(
    destination: Path,
    command: Iterable[str],
    cwd: Path,
    debian_build: subprocess.CompletedProcess[str] | None,
) -> Path:
    log_path = destination / "build-deb.log"
    sections: list[str] = [f"debian_command: {' '.join(command)}", f"cwd: {cwd}", ""]
    sections.extend(_render_completed_process("DEBIAN BUILD", debian_build))
    log_body = "\n".join(sections)
    log_path.write_text(log_body, encoding="utf-8")
    return log_path


def _collect_build_artifacts(
    *,
    search_dir: Path,
    output_dir: Path,
    package_name: str,
    package_version: str,
) -> tuple[Path, ...]:
    copied: list[Path] = []
    for path in sorted(search_dir.glob(f"{package_name}_{package_version}*")):
        if not path.is_file():
            continue
        if not _is_supported_artifact(path):
            continue

        destination = output_dir / path.name
        if path.resolve() != destination.resolve():
            shutil.copy2(path, destination)
        copied.append(destination)

    return tuple(copied)


def _find_homebrew_formula_artifacts(destination: Path) -> tuple[Path, ...]:
    candidates = (
        destination / "homebrew" / "Formula" / "pmdocs.rb",
        destination / "Formula" / "pmdocs.rb",
        destination / "pmdocs.rb",
    )
    return tuple(path for path in candidates if path.is_file())


def _validate_homebrew_formula_artifact(formula_path: Path) -> list[str]:
    content = formula_path.read_text(encoding="utf-8")
    issues: list[str] = []
    if "class Pmdocs < Formula" not in content:
        issues.append(f"[homebrew formula] {formula_path.name}: missing Pmdocs formula class")
    if "TODO_REPLACE_WITH_RELEASE_ARCHIVE_SHA256" in content:
        issues.append(f"[homebrew formula] {formula_path.name}: release sha256 placeholder was not replaced")
    if "/archive/refs/tags/v" not in content:
        issues.append(f"[homebrew formula] {formula_path.name}: missing tagged release archive URL")
    return issues


def _is_supported_artifact(path: Path) -> bool:
    name = path.name
    return any(name.endswith(suffix) for suffix in SUPPORTED_ARTIFACT_SUFFIXES)


def _tail_lines(content: str, *, limit: int) -> str:
    lines = [line for line in content.splitlines() if line.strip()]
    if not lines:
        return "(no stderr output)"
    return "\n".join(lines[-limit:])


def _render_completed_process(
    name: str,
    completed: subprocess.CompletedProcess[str] | None,
) -> list[str]:
    if completed is None:
        return [f"=== {name} ===", "skipped", ""]
    return [
        f"=== {name} ===",
        f"command: {' '.join(map(str, completed.args))}",
        f"exit_code: {completed.returncode}",
        "--- STDOUT ---",
        completed.stdout.rstrip(),
        "--- STDERR ---",
        completed.stderr.rstrip(),
        "",
    ]
