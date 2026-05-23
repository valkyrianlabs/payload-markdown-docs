from pathlib import Path

from tools.release.version.models import Version


def read_version_file(path: Path) -> Version:
    if not path.is_file():
        raise ValueError(f"VERSION file does not exist: {path}")

    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        raise ValueError(f"VERSION file is empty: {path}")

    return Version.parse(raw)


def write_version_file(path: Path, version: Version) -> None:
    path.write_text(f"{version}\n", encoding="utf-8")


if __name__ == "__main__":
    path = Path("../../../VERSION")
    version = read_version_file(path)
    print(version)
