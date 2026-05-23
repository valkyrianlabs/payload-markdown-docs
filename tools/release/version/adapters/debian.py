import re
from dataclasses import dataclass
from pathlib import Path

from tools.release.version.models import Version

CHANGELOG_HEADER_PATTERN = re.compile(
    r"^(?P<package>[^\s]+)\s+\((?P<full_version>\d+\.\d+\.\d+(?:-\d+)?)\)\s+(?P<distribution>[^\s;]+);\s+urgency=(?P<urgency>[^\s]+)$"
)

FULL_DEBIAN_VERSION_PATTERN = re.compile(
    r"^(?P<version>\d+\.\d+\.\d+)(?:-(?P<revision>\d+))?$"
)


@dataclass(frozen=True)
class DebianVersion:
    upstream: Version
    revision: int = 1

    def __str__(self) -> str:
        return format_debian_version(self.upstream, self.revision)


def format_debian_version(version: Version, revision: int = 1) -> str:
    if revision < 1:
        raise ValueError(f"Debian revision must be >= 1, got {revision}")
    return f"{version}-{revision}"


def parse_debian_version(raw: str) -> DebianVersion:
    match = FULL_DEBIAN_VERSION_PATTERN.fullmatch(raw.strip())
    if not match:
        raise ValueError(f"Invalid Debian version string: {raw}")

    upstream = Version.parse(match.group("version"))
    revision_raw = match.group("revision")
    revision = int(revision_raw) if revision_raw is not None else 1

    return DebianVersion(upstream=upstream, revision=revision)


def read_debian_version(path: Path) -> DebianVersion:
    with path.open("r", encoding="utf-8") as f:
        first_line = f.readline().strip()

    match = CHANGELOG_HEADER_PATTERN.fullmatch(first_line)
    if not match:
        raise ValueError(f"Could not parse Debian changelog header in {path}: {first_line}")

    return parse_debian_version(match.group("full_version"))


def write_debian_version(path: Path, version: Version, revision: int = 1) -> None:
    content = path.read_text(encoding="utf-8")
    lines = content.splitlines()

    if not lines:
        raise ValueError(f"Debian changelog is empty: {path}")

    header = lines[0]
    match = CHANGELOG_HEADER_PATTERN.fullmatch(header.strip())
    if not match:
        raise ValueError(f"Could not parse Debian changelog header in {path}: {header}")

    new_header = (
        f"{match.group('package')} "
        f"({format_debian_version(version, revision)}) "
        f"{match.group('distribution')}; "
        f"urgency={match.group('urgency')}"
    )

    lines[0] = new_header
    updated = "\n".join(lines) + ("\n" if content.endswith("\n") else "")

    path.write_text(updated, encoding="utf-8")


if "__main__" == __name__:
    path = Path("../../../debian/changelog")
    version = read_debian_version(path)
    print(version)
