from __future__ import annotations

import hashlib
import shutil
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from tools.release.version.adapters import (
    UNKNOWN_RELEASE_SHA256,
    read_homebrew_formula_sha256,
    write_homebrew_formula_release,
)
from tools.release.version.models import Version
from tools.release.version.validate import require_synced_release_state

DEFAULT_HOMEBREW_REPOSITORY = "valkyrianlabs/payload-markdown-docs"


@dataclass(frozen=True)
class HomebrewFormulaResult:
    repo_root: Path
    formula_path: Path
    output_dir: Path
    staged_formula: Path | None
    version: Version
    archive_url: str
    sha256: str
    dry_run: bool


def default_release_archive_url(*, repository: str, version: Version) -> str:
    return f"https://github.com/{repository}/archive/refs/tags/v{version}.tar.gz"


def prepare_homebrew_formula(
    *,
    repo_root: Path | str = ".",
    output_dir: Path | str = "release",
    archive_url: str | None = None,
    repository: str = DEFAULT_HOMEBREW_REPOSITORY,
    sha256: str | None = None,
    fetch_sha256: bool = False,
    dry_run: bool = False,
) -> HomebrewFormulaResult:
    root = Path(repo_root).resolve()
    state = require_synced_release_state(root)
    version = state.versions.canonical
    if version is None:
        raise ValueError("Canonical VERSION could not be resolved")

    resolved_url = archive_url or default_release_archive_url(
        repository=repository,
        version=version,
    )
    resolved_sha256 = sha256
    if resolved_sha256 is None and fetch_sha256:
        resolved_sha256 = fetch_url_sha256(resolved_url)
    if resolved_sha256 is None:
        resolved_sha256 = read_homebrew_formula_sha256(state.paths.homebrew_formula_file)

    if not dry_run:
        _require_release_sha256(resolved_sha256)
        resolved_sha256 = resolved_sha256.strip().lower()

    destination = _resolve_output_dir(root, output_dir)
    staged_formula = destination / "homebrew" / "Formula" / "pmdocs.rb"

    if dry_run:
        return HomebrewFormulaResult(
            repo_root=root,
            formula_path=state.paths.homebrew_formula_file,
            output_dir=destination,
            staged_formula=staged_formula,
            version=version,
            archive_url=resolved_url,
            sha256=resolved_sha256,
            dry_run=True,
        )

    destination.mkdir(parents=True, exist_ok=True)
    write_homebrew_formula_release(
        state.paths.homebrew_formula_file,
        archive_url=resolved_url,
        sha256=resolved_sha256,
    )
    staged_formula.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(state.paths.homebrew_formula_file, staged_formula)

    return HomebrewFormulaResult(
        repo_root=root,
        formula_path=state.paths.homebrew_formula_file,
        output_dir=destination,
        staged_formula=staged_formula,
        version=version,
        archive_url=resolved_url,
        sha256=resolved_sha256,
        dry_run=False,
    )


def fetch_url_sha256(url: str) -> str:
    digest = hashlib.sha256()
    with urllib.request.urlopen(url, timeout=60) as response:  # nosec B310 - release URL is caller-controlled.
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _require_release_sha256(value: str) -> None:
    normalized = value.strip().lower()
    if normalized == UNKNOWN_RELEASE_SHA256.lower():
        raise ValueError(
            "Homebrew formula sha256 is still a placeholder. Pass --sha256 or --fetch-sha256."
        )
    if len(normalized) != 64 or any(ch not in "0123456789abcdef" for ch in normalized):
        raise ValueError(f"Homebrew formula sha256 must be a 64-character hex digest, got {value!r}.")


def _resolve_output_dir(repo_root: Path, output_dir: Path | str) -> Path:
    candidate = Path(output_dir)
    if not candidate.is_absolute():
        return (repo_root / candidate).resolve()
    return candidate
