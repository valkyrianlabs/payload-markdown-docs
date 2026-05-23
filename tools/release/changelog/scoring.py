from __future__ import annotations


def score_file_change(
    *,
    path: str,
    category: str,
    insertions: int,
    deletions: int,
    commit_count: int,
    flags: tuple[str, ...],
) -> float:
    score = 0.0
    change_volume = insertions + deletions

    score += min(change_volume, 400) / 20.0
    score += commit_count * 1.5

    lower = path.lower()

    if category == "core":
        if lower.startswith("core/include/"):
            score += 3.0
        if lower.startswith("core/src/"):
            score += 2.5
        if "fuse" in lower:
            score += 2.0

    elif category == "web":
        if lower.startswith("web/src/app/"):
            score += 3.0
        if lower.startswith("web/src/components/"):
            score += 2.0
        if "auth" in lower or "middleware" in lower:
            score += 2.0

    elif category == "tools":
        if lower.startswith("tools/release/"):
            score += 3.0
        if lower.endswith("cli.py") or lower.endswith("validate.py"):
            score += 2.0

    elif category == "debian":
        if lower in {"debian/control", "debian/rules", "debian/install"}:
            score += 3.0
        if lower.endswith(("postinst", "postrm", "preinst.ex", "prerm.ex")):
            score += 2.0

    elif category == "deploy":
        if "/psql/" in f"/{lower}":
            score += 3.5
        if "config" in lower:
            score += 2.5
        if "systemd" in lower:
            score += 2.5
        if lower.startswith("bin/"):
            score += 2.0

    if "database" in flags:
        score += 2.5
    if "config" in flags:
        score += 2.0
    if "systemd" in flags:
        score += 2.0
    if "packaging" in flags:
        score += 2.0
    if "release-tooling" in flags:
        score += 2.0
    if "api-surface" in flags:
        score += 1.5
    if "frontend-routing" in flags:
        score += 1.5

    if _is_noise_path(lower):
        score -= 10.0

    return round(score, 2)


def score_patch_hunk(hunk: str, category: str, path: str) -> float:
    score = 0.0
    lower = hunk.lower()

    added_lines = sum(
        1 for line in hunk.splitlines() if line.startswith("+") and not line.startswith("+++")
    )
    removed_lines = sum(
        1 for line in hunk.splitlines() if line.startswith("-") and not line.startswith("---")
    )

    score += min(added_lines + removed_lines, 120) / 8.0

    symbol_keywords = (
        "class ",
        "struct ",
        "interface ",
        "enum ",
        "def ",
        "function ",
        "export ",
        "public ",
        "private ",
        "static ",
        "async ",
        "await ",
        "argparse",
        "subparsers",
        "rrule",
        "systemd",
        "postgres",
        "sql",
        "permission",
        "role",
        "auth",
        "fuse",
        "vault",
        "sync",
    )
    for keyword in symbol_keywords:
        if keyword in lower:
            score += 1.2

    if category == "deploy":
        for keyword in ("sql", "postgres", "psql", "systemd", "environment", "config"):
            if keyword in lower:
                score += 1.5

    elif category == "debian":
        for keyword in ("depends", "install", "postinst", "rules", "package", "dh_"):
            if keyword in lower:
                score += 1.5

    elif category == "tools":
        for keyword in ("version", "release", "changelog", "sync", "validate", "bump"):
            if keyword in lower:
                score += 1.5

    elif category == "web":
        for keyword in ("export", "useeffect", "router", "auth", "component", "props"):
            if keyword in lower:
                score += 1.2

    elif category == "core":
        for keyword in ("fuse", "storage", "vault", "permission", "protocol", "postgres"):
            if keyword in lower:
                score += 1.2

    if path.endswith(("pnpm-lock.yaml", "package-lock.json", "yarn.lock")):
        score -= 20.0

    return round(score, 2)


def _is_noise_path(path: str) -> bool:
    if path.startswith("build/"):
        return True

    noisy_suffixes = (
        ".lock",
        ".min.js",
        ".map",
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".svg",
        ".webp",
    )
    if path.endswith(noisy_suffixes):
        return True

    noisy_parts = (
        "/node_modules/",
        "/dist/",
        "/vendor/",
        "/coverage/",
        "/test-assets/",
    )
    if any(part in f"/{path}" for part in noisy_parts):
        return True

    return is_semantic_noise_path(path)


def is_semantic_noise_path(path: str) -> bool:
    normalized = path.strip().replace("\\", "/").lower()
    while normalized.startswith("./"):
        normalized = normalized[2:]
    if not normalized:
        return True
    normalized = normalized.lstrip("/")
    basename = normalized.rsplit("/", 1)[-1]

    derived_exact_paths = {
        "debian/changelog",
        "changelog.release.md",
        "release_notes.md",
        "changelog.raw.md",
        "changelog.payload.json",
        "changelog.semantic_payload.json",
        "changelog.draft.md",
    }
    if normalized in derived_exact_paths:
        return True

    derived_basenames = {
        "changelog.release.md",
        "release_notes.md",
        "changelog.raw.md",
        "changelog.payload.json",
        "changelog.semantic_payload.json",
        "changelog.draft.md",
    }
    if basename in derived_basenames:
        return True

    derived_exact_dirs = {
        ".changelog_scratch",
        ".codex/context",
        ".codex/scratch",
    }
    if normalized in derived_exact_dirs:
        return True

    derived_prefixes = (
        ".changelog_scratch/",
        ".codex/context/",
        ".codex/scratch/",
    )
    return any(normalized.startswith(prefix) for prefix in derived_prefixes)
