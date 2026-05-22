import re
from pathlib import Path

from tools.release.version.models import Version


HOMEBREW_TAGGED_URL_PATTERN = re.compile(
    r"""(?P<prefix>\burl\s+["'][^"']*/archive/refs/tags/v)"""
    r"""(?P<version>\d+\.\d+\.\d+)"""
    r"""(?P<suffix>\.tar\.gz["'])"""
)
HOMEBREW_SHA256_PATTERN = re.compile(
    r"""(?P<prefix>\bsha256\s+["'])(?P<sha256>[^"']+)(?P<suffix>["'])"""
)
UNKNOWN_RELEASE_SHA256 = "TODO_REPLACE_WITH_RELEASE_ARCHIVE_SHA256"


def read_homebrew_formula_version(path: Path) -> Version:
    content = path.read_text(encoding="utf-8")
    match = HOMEBREW_TAGGED_URL_PATTERN.search(content)
    if not match:
        raise ValueError(f"Could not find Homebrew formula release URL version in {path}")

    return Version.parse(match.group("version"))


def write_homebrew_formula_version(path: Path, version: Version) -> None:
    content = path.read_text(encoding="utf-8")
    match = HOMEBREW_TAGGED_URL_PATTERN.search(content)
    if not match:
        raise ValueError(f"Could not find Homebrew formula release URL version in {path}")

    current_version = Version.parse(match.group("version"))
    updated = HOMEBREW_TAGGED_URL_PATTERN.sub(
        lambda m: f"{m.group('prefix')}{version}{m.group('suffix')}",
        content,
        count=1,
    )

    if current_version != version:
        updated = HOMEBREW_SHA256_PATTERN.sub(
            lambda m: (
                f"{m.group('prefix')}{UNKNOWN_RELEASE_SHA256}{m.group('suffix')}"
            ),
            updated,
            count=1,
        )

    path.write_text(updated, encoding="utf-8")
