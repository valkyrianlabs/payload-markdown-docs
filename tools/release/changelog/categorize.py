from __future__ import annotations

import re
from pathlib import PurePosixPath


CATEGORY_ORDER: tuple[str, ...] = (
    "plugin",
    "npm-cli",
    "native-cli",
    "sync",
    "frontend",
    "admin",
    "docs-assets",
    "docs",
    "debian",
    "homebrew",
    "release-tooling",
    "tests",
    # Legacy category names can still appear in cached/manual release context
    # tests; the path categorizer below no longer emits them for this repo.
    "tools",
    "deploy",
    "web",
    "core",
    "meta",
)

META_FILES: set[str] = {
    "AGENTS.md",
    "CHANGELOG.md",
    "DISTRIBUTION.md",
    "VERSION",
    "README.md",
    "LICENSE",
    "NOTICE",
    "TRADEMARKS.md",
    "Makefile",
    "pnpm-workspace.yaml",
}

NPM_CLI_FILES: set[str] = {
    ".swcrc",
    "eslint.config.js",
    "package.json",
    "playwright.config.js",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "tsconfig.build.json",
    "vitest.config.js",
}

RELEASE_TOOLING_FILES: set[str] = {
    "ai.yml",
    "requirements.txt",
}

PLUGIN_ROOT_FILES: set[str] = {
    "src/constants.ts",
    "src/index.ts",
    "src/plugin.ts",
    "src/types.ts",
}


def categorize_path(path: str) -> str:
    normalized = normalize_path(path)
    lower = normalized.lower()

    if is_test_path(lower):
        return "tests"

    if lower.startswith("debian/"):
        return "debian"

    if lower.startswith("homebrew/"):
        return "homebrew"

    if lower.startswith("tools/release/") or lower.startswith(".github/workflows/") or normalized in RELEASE_TOOLING_FILES:
        return "release-tooling"

    if lower.startswith("cli/") or lower in {"meson.build", "meson.options"}:
        return "native-cli"

    if lower.startswith("src/cli/") or normalized in NPM_CLI_FILES:
        return "npm-cli"

    if lower.startswith(("src/sync/", "src/security/", "src/endpoints/", "src/payload/")):
        return "sync"

    if lower.startswith("src/admin/"):
        return "admin"

    if lower.startswith(("src/next/", "dev/app/")):
        return "frontend"

    if (
        lower.startswith(("skills/", "src/skillbundles", "examples/docs/", "examples/github-actions/"))
        or "assets" in lower and lower.startswith("src/cli/")
    ):
        return "docs-assets"

    if lower.startswith("docs/"):
        return "docs"

    if normalized in PLUGIN_ROOT_FILES or lower.startswith((
        "src/blocks/",
        "src/collections/",
        "src/fields/",
        "src/install/",
        "src/routing/",
    )):
        return "plugin"

    if normalized in META_FILES:
        return "meta"

    return "meta"


_DEBIAN_HINT_RE = re.compile(r"\b(debian|packaging|package|apt|dpkg|nexus)\b", re.IGNORECASE)
_HOMEBREW_HINT_RE = re.compile(r"\b(homebrew|brew|tap|formula)\b", re.IGNORECASE)
_RELEASE_TOOLING_HINT_RE = re.compile(r"\b(changelog|release(?:\s+tooling)?|tooling|ci|github actions)\b", re.IGNORECASE)
_NATIVE_CLI_HINT_RE = re.compile(r"\b(native|cpp|c\+\+|meson|debian cli|apt cli)\b", re.IGNORECASE)
_NPM_CLI_HINT_RE = re.compile(r"\b(npm|typescript cli|node cli|pnpm)\b", re.IGNORECASE)
_SYNC_HINT_RE = re.compile(r"\b(sync|oidc|ed25519|docs push|payload endpoint|protected endpoint)\b", re.IGNORECASE)


def infer_categories_from_text(subject: str, body: str = "") -> tuple[str, ...]:
    """Infer likely release categories from commit text for metadata-only file changes."""
    text = f"{subject}\n{body}"
    categories: set[str] = set()

    if _DEBIAN_HINT_RE.search(text):
        categories.add("debian")
    if _HOMEBREW_HINT_RE.search(text):
        categories.add("homebrew")
    if _RELEASE_TOOLING_HINT_RE.search(text):
        categories.add("release-tooling")
    if _NATIVE_CLI_HINT_RE.search(text):
        categories.add("native-cli")
    if _NPM_CLI_HINT_RE.search(text):
        categories.add("npm-cli")
    if _SYNC_HINT_RE.search(text):
        categories.add("sync")

    return tuple(sorted(categories))


def extract_subscopes(path: str, category: str) -> tuple[str, ...]:
    normalized = normalize_path(path)
    parts = PurePosixPath(normalized).parts

    if not parts:
        return ()

    if category in {"plugin", "npm-cli", "native-cli", "sync", "frontend", "admin", "docs-assets", "docs", "debian", "homebrew", "release-tooling", "tests"}:
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

    if lower.startswith("debian/") or lower.startswith("homebrew/"):
        flags.add("packaging")

    if lower.startswith("tools/release/") or lower.startswith(".github/workflows/"):
        flags.add("release-tooling")

    if lower.startswith("debian/") or lower.startswith("homebrew/"):
        flags.add("install-script")

    if lower.startswith("dev/app/") or lower.startswith("src/next/"):
        flags.add("frontend-routing")

    if lower.startswith("src/admin/") or lower.startswith("src/components/"):
        flags.add("ui-surface")

    if lower.startswith(("src/next/", "dev/app/")) or lower.endswith((".tsx", ".jsx")):
        flags.add("frontend")

    if lower.startswith(("src/endpoints/", "src/types")):
        flags.add("api-surface")

    if lower.startswith("src/") or lower.startswith("cli/src/"):
        flags.add("implementation")

    if lower.startswith("cli/") or lower.endswith(("meson.build", "meson.options")):
        flags.add("native-cli")

    if lower.startswith("src/cli/") or lower in {item.lower() for item in NPM_CLI_FILES}:
        flags.add("npm-cli")

    if lower.startswith(("src/sync/", "src/security/", "src/endpoints/", "src/payload/")):
        flags.add("docs-sync")

    if "auth" in lower or "oidc" in lower or "security" in lower:
        flags.add("auth")

    if "schema" in lower or "migration" in lower or "collection" in lower or "field" in lower:
        flags.add("schema")

    if lower.endswith(("meson.build", "meson.options")) or lower in {
        "package.json",
        "pnpm-lock.yaml",
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

        if normalized.startswith("debian/"):
            themes.add("packaging")

        if normalized.startswith("homebrew/"):
            themes.add("homebrew-packaging")

        if normalized.startswith("tools/release/") or normalized.startswith(".github/workflows/"):
            themes.add("release-automation")

        if normalized.startswith("cli/") or normalized.endswith(("meson.build", "meson.options")):
            themes.add("native-cli")

        if normalized.startswith("src/cli/") or normalized in {item.lower() for item in NPM_CLI_FILES}:
            themes.add("npm-cli")

        if normalized.startswith(("src/sync/", "src/security/", "src/endpoints/", "src/payload/")):
            themes.add("docs-sync")

        if normalized.startswith(("src/next/", "dev/app/")):
            themes.add("frontend")

        if normalized.startswith("src/admin/"):
            themes.add("admin")

        if normalized.startswith(("skills/", "examples/docs/", "examples/github-actions/")):
            themes.add("docs-assets")

        if normalized.startswith("docs/"):
            themes.add("documentation")

        if normalized.startswith(("src/blocks/", "src/collections/", "src/fields/", "src/routing/")) or normalized in {
            "src/index.ts",
            "src/plugin.ts",
            "src/types.ts",
            "src/constants.ts",
        }:
            themes.add("plugin")

    return sorted(themes)


def normalize_path(path: str) -> str:
    return path.strip().replace("\\", "/")


def is_test_path(lower_path: str) -> bool:
    test_suffixes = (
        ".spec.ts",
        ".spec.tsx",
        ".test.ts",
        ".test.tsx",
        ".spec.js",
        ".test.js",
        ".spec.cpp",
        ".test.cpp",
    )
    return (
        "/tests/" in f"/{lower_path}"
        or lower_path.startswith("tools/release/tests/")
        or lower_path.startswith("cli/tests/")
        or lower_path.startswith("dev/") and lower_path.endswith(test_suffixes)
        or lower_path.endswith(test_suffixes)
    )
