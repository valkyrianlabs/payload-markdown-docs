import re
from pathlib import Path

from tools.release.version.models import Version

PROJECT_VERSION_PATTERN = re.compile(
    r"""(?P<prefix>\bproject\s*\(.*?\bversion\s*:\s*['"])(?P<version>\d+\.\d+\.\d+)(?P<suffix>['"])""",
    re.DOTALL,
)

def read_meson_version(path: Path) -> Version:
    content = path.read_text(encoding="utf-8")
    match = PROJECT_VERSION_PATTERN.search(content)
    if not match:
        raise ValueError(f"Could not find Meson project version in {path}")
    return Version.parse(match.group("version"))


def write_meson_version(path: Path, version: Version) -> None:
    content = path.read_text(encoding="utf-8")
    match = PROJECT_VERSION_PATTERN.search(content)
    if not match:
        raise ValueError(f"Could not find Meson project version in {path}")

    updated = PROJECT_VERSION_PATTERN.sub(
        lambda m: f"{m.group('prefix')}{version}{m.group('suffix')}",
        content,
        count=1,
    )

    path.write_text(updated, encoding="utf-8")


if __name__ == "__main__":
    path = Path("../../../meson.build")
    version = read_meson_version(path)
    print(version)
