from __future__ import annotations

import re
from pathlib import PurePosixPath


CATEGORY_ORDER: tuple[str, ...] = (
    "debian",
    "tools",
    "deploy",
    "web",
    "core",
    "meta",
)

META_FILES: set[str] = {
    "VERSION",
    "README.md",
    "DISTRIBUTION.md",
    "LICENSE",
    "NOTICE",
    "TRADEMARKS.md",
    "Makefile",
    "requirements.txt",
}


def categorize_path(path: str) -> str:
    normalized = normalize_path(path)

    if normalized.startswith("debian/") or normalized.startswith("web/debian/"):
        return "debian"

    if normalized.startswith("tools/"):
        return "tools"

    if (
        normalized.startswith("deploy/")
        or normalized.startswith("core/deploy/")
        or normalized.startswith("web/deploy/")
        or normalized in {
            "bin/doctor.sh",
            "bin/install.sh",
            "bin/install_deb.sh",
            "bin/setup",
            "bin/teardown",
            "bin/uninstall.sh",
        }
    ):
        return "deploy"

    if normalized.startswith("web/"):
        return "web"

    if normalized.startswith("core/"):
        return "core"

    if normalized in META_FILES:
        return "meta"

    return "meta"


_DEBIAN_HINT_RE = re.compile(r"\b(debian|packaging|package|apt|dpkg|nexus)\b", re.IGNORECASE)
_TOOLS_HINT_RE = re.compile(r"\b(changelog|release(?:\s+tooling)?|tooling|ci|github actions)\b", re.IGNORECASE)


def infer_categories_from_text(subject: str, body: str = "") -> tuple[str, ...]:
    """Infer likely release categories from commit text for metadata-only file changes."""
    text = f"{subject}\n{body}"
    categories: set[str] = set()

    if _DEBIAN_HINT_RE.search(text):
        categories.add("debian")
    if _TOOLS_HINT_RE.search(text):
        categories.add("tools")

    return tuple(sorted(categories))


def extract_subscopes(path: str, category: str) -> tuple[str, ...]:
    normalized = normalize_path(path)
    parts = PurePosixPath(normalized).parts

    if not parts:
        return ()

    if category == "core":
        return tuple(parts[1:3])

    if category == "web":
        return tuple(parts[1:4])

    if category == "tools":
        return tuple(parts[1:3])

    if category == "debian":
        if parts[0] == "web" and len(parts) >= 3 and parts[1] == "debian":
            return tuple(parts[1:3])
        return tuple(parts[1:3])

    if category == "deploy":
        if parts[0] == "bin":
            return ("bin",)
        return tuple(parts[1:3])

    return tuple(parts[:2])


def detect_flags(path: str) -> tuple[str, ...]:
    normalized = normalize_path(path)
    lower = normalized.lower()

    flags: set[str] = set()

    if "/psql/" in f"/{lower}" or lower.endswith(".sql"):
        flags.add("database")

    if "config" in lower or lower.endswith(".env") or ".env." in lower:
        flags.add("config")

    if "systemd" in lower:
        flags.add("systemd")

    if lower.startswith("debian/") or lower.startswith("web/debian/"):
        flags.add("packaging")

    if lower.startswith("tools/release/"):
        flags.add("release-tooling")

    if lower.startswith("bin/") and lower.endswith(".sh"):
        flags.add("install-script")

    if lower.startswith("web/src/app/"):
        flags.add("frontend-routing")

    if lower.startswith("web/src/components/"):
        flags.add("ui-surface")

    if lower.startswith("web/src") or lower.endswith((".ts", ".tsx", ".js", ".jsx")):
        flags.add("frontend")

    if lower.startswith("core/include/"):
        flags.add("api-surface")

    if lower.startswith("core/src/"):
        flags.add("implementation")

    if "fuse" in lower:
        flags.add("filesystem")

    if "auth" in lower:
        flags.add("auth")

    if "schema" in lower or "migration" in lower:
        flags.add("schema")

    if lower.endswith(("meson.build", "meson.options")) or lower in {
        "package.json",
        "web/package.json",
    }:
        flags.add("build-system")

    return tuple(sorted(flags))


def detect_themes_for_paths(paths: list[str]) -> list[str]:
    themes: set[str] = set()

    for path in paths:
        normalized = normalize_path(path).lower()

        if "/psql/" in f"/{normalized}" or normalized.endswith(".sql"):
            themes.add("database")

        if "config" in normalized or normalized.endswith(".env") or ".env." in normalized:
            themes.add("configuration")

        if "systemd" in normalized:
            themes.add("service-management")

        if normalized.startswith("debian/") or normalized.startswith("web/debian/"):
            themes.add("packaging")

        if normalized.startswith("tools/release/"):
            themes.add("release-automation")

        if normalized.startswith("web/"):
            themes.add("web")

        if normalized.startswith("core/"):
            themes.add("core")

    return sorted(themes)


def normalize_path(path: str) -> str:
    return path.strip().replace("\\", "/")
