from __future__ import annotations

import argparse
import sys
from pathlib import Path

from tools.release.changelog.context_builder import build_release_context
from tools.release.changelog.render_raw import render_debug_context, render_debug_json
from tools.release.version.adapters.version_file import read_version_file


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.release.debug.release_context",
        description="Build and print release context debug output.",
    )
    parser.add_argument(
        "--repo-root",
        default=str(Path(__file__).resolve().parents[3]),
        help="Repository root path.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Also print full JSON payload.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    repo_root = Path(args.repo_root).resolve()

    try:
        version = read_version_file(repo_root / "VERSION")
        context = build_release_context(version=str(version), repo_root=repo_root)
    except Exception as exc:
        print(f"ERROR building release context: {exc}")
        return 1

    print(render_debug_context(context), end="")
    if args.json:
        print("\n=== FULL JSON ===\n")
        print(render_debug_json(context))

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
