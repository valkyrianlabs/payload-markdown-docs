import json
from pathlib import Path

from tools.release.version.models import Version


def read_package_json_version(path: Path) -> Version:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    raw_version = data.get("version")
    if not isinstance(raw_version, str):
        raise ValueError(f"Missing or invalid 'version' field in {path}")

    return Version.parse(raw_version)


def write_package_json_version(path: Path, version: Version) -> None:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if "version" not in data:
        raise ValueError(f"Missing 'version' field in {path}")

    data["version"] = str(version)

    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


if __name__ == "__main__":
    path = Path("../../../web/package.json")
    version = read_package_json_version(path)
    print(version)
