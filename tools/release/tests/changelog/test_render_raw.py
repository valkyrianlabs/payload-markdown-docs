from __future__ import annotations

from pathlib import Path
import unittest

from tools.release.changelog.models import CategoryContext, CommitInfo, DiffSnippet, FileChange, ReleaseContext
from tools.release.changelog.render_raw import render_debug_context, render_release_changelog


FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _load_fixture(name: str) -> str:
    return (FIXTURES_DIR / name).read_text(encoding="utf-8")


def _normal_context() -> ReleaseContext:
    category = CategoryContext(
        name="core",
        commit_count=2,
        insertions=34,
        deletions=12,
        commits=[
            CommitInfo(
                sha="aaaaaaaa11111111",
                subject="Refactor runtime manager startup",
                body="",
                files=["core/src/runtime/Manager.cpp"],
                insertions=20,
                deletions=5,
                categories=["core"],
            ),
            CommitInfo(
                sha="bbbbbbbb22222222",
                subject="Improve fuse mount safety path handling",
                body="",
                files=["core/src/fuse/Service.cpp"],
                insertions=14,
                deletions=7,
                categories=["core"],
            ),
        ],
        files=[
            FileChange(
                path="core/src/runtime/Manager.cpp",
                category="core",
                subscopes=("src", "runtime"),
                insertions=20,
                deletions=5,
                commit_count=2,
                score=18.5,
                flags=("implementation",),
            ),
            FileChange(
                path="core/src/fuse/Service.cpp",
                category="core",
                subscopes=("src", "fuse"),
                insertions=14,
                deletions=7,
                commit_count=1,
                score=17.2,
                flags=("filesystem",),
            ),
        ],
        snippets=[
            DiffSnippet(
                path="core/src/fuse/Service.cpp",
                category="core",
                subscopes=("src", "fuse"),
                score=9.5,
                reason="Selected from high-scoring core file; flags: filesystem",
                patch="@@ ... @@",
                flags=("filesystem",),
            )
        ],
        detected_themes=["core", "filesystem"],
    )
    return ReleaseContext(
        version="1.2.3",
        previous_tag="v1.2.2",
        head_sha="abcdef1234567890",
        commit_count=3,
        categories={"core": category},
        cross_cutting_notes=[],
    )


def _files_no_snippets_context() -> ReleaseContext:
    category = CategoryContext(
        name="web",
        commit_count=1,
        insertions=10,
        deletions=2,
        commits=[
            CommitInfo(
                sha="cccccccc33333333",
                subject="Adjust admin dashboard layout spacing",
                body="",
                files=["web/src/app/(app)/(admin)/dashboard/page.tsx"],
                insertions=10,
                deletions=2,
                categories=["web"],
            ),
        ],
        files=[
            FileChange(
                path="web/src/app/(app)/(admin)/dashboard/page.tsx",
                category="web",
                subscopes=("src", "app", "(app)"),
                insertions=10,
                deletions=2,
                commit_count=1,
                score=8.0,
                flags=("frontend", "frontend-routing"),
            )
        ],
        snippets=[],
        detected_themes=["web"],
    )
    return ReleaseContext(
        version="1.2.4",
        previous_tag="v1.2.3",
        head_sha="1234567fffffff99",
        commit_count=1,
        categories={"web": category},
        cross_cutting_notes=[],
    )


def _weak_meta_context() -> ReleaseContext:
    category = CategoryContext(
        name="meta",
        commit_count=1,
        insertions=0,
        deletions=0,
        commits=[
            CommitInfo(
                sha="dddddddd44444444",
                subject="Touch README wording",
                body="",
                files=["README.md"],
                insertions=0,
                deletions=0,
                categories=["meta"],
            ),
        ],
        files=[
            FileChange(
                path="README.md",
                category="meta",
                subscopes=("README.md",),
                insertions=0,
                deletions=0,
                commit_count=1,
                score=1.5,
                flags=(),
            )
        ],
        snippets=[],
        detected_themes=[],
    )
    return ReleaseContext(
        version="1.2.5",
        previous_tag="v1.2.4",
        head_sha="4444444eeeeeeee1",
        commit_count=1,
        categories={"meta": category},
        cross_cutting_notes=[],
    )


def _multi_category_context() -> ReleaseContext:
    core = CategoryContext(
        name="core",
        commit_count=1,
        insertions=9,
        deletions=3,
        commits=[
            CommitInfo(
                sha="99999999aaaaaaa1",
                subject="Tune sync task retry behavior",
                body="",
                files=["core/src/sync/tasks/Runner.cpp"],
                insertions=9,
                deletions=3,
                categories=["core"],
            ),
        ],
        files=[
            FileChange(
                path="core/src/sync/tasks/Runner.cpp",
                category="core",
                subscopes=("src", "sync"),
                insertions=9,
                deletions=3,
                commit_count=1,
                score=7.1,
                flags=("implementation",),
            )
        ],
        snippets=[],
        detected_themes=["core"],
    )
    debian = CategoryContext(
        name="debian",
        commit_count=1,
        insertions=2,
        deletions=1,
        commits=[
            CommitInfo(
                sha="11111111bbbbbbb2",
                subject="Update package install paths",
                body="",
                files=["debian/install"],
                insertions=2,
                deletions=1,
                categories=["debian"],
            ),
        ],
        files=[
            FileChange(
                path="debian/install",
                category="debian",
                subscopes=("install",),
                insertions=2,
                deletions=1,
                commit_count=1,
                score=6.2,
                flags=("packaging",),
            )
        ],
        snippets=[],
        detected_themes=["packaging"],
    )
    tools = CategoryContext(
        name="tools",
        commit_count=1,
        insertions=8,
        deletions=4,
        commits=[
            CommitInfo(
                sha="22222222ccccccc3",
                subject="Refine release snippet scoring",
                body="",
                files=["tools/release/changelog/scoring.py"],
                insertions=8,
                deletions=4,
                categories=["tools"],
            ),
        ],
        files=[
            FileChange(
                path="tools/release/changelog/scoring.py",
                category="tools",
                subscopes=("release", "changelog"),
                insertions=8,
                deletions=4,
                commit_count=1,
                score=8.6,
                flags=("release-tooling",),
            )
        ],
        snippets=[],
        detected_themes=["release-automation"],
    )
    return ReleaseContext(
        version="1.3.0",
        previous_tag="v1.2.5",
        head_sha="abcabcabcabcabc1",
        commit_count=3,
        categories={"core": core, "tools": tools, "debian": debian},
        cross_cutting_notes=[],
    )


def _minimal_context() -> ReleaseContext:
    return ReleaseContext(
        version="1.3.1",
        previous_tag=None,
        head_sha="0000000fffffff00",
        commit_count=0,
        categories={},
        cross_cutting_notes=[],
    )


def _uncategorized_only_context() -> ReleaseContext:
    return ReleaseContext(
        version="1.3.2",
        previous_tag="v1.3.1",
        head_sha="1111111aaaaaaa11",
        commit_count=1,
        categories={},
        uncategorized_commits=[
            CommitInfo(
                sha="eeeeeeee55555555",
                subject="Merge branch 'main' into release-train",
                body="",
                files=[],
                insertions=0,
                deletions=0,
                categories=[],
            )
        ],
        cross_cutting_notes=[],
    )


def _metadata_snippet_context() -> ReleaseContext:
    category = CategoryContext(
        name="tools",
        commit_count=1,
        insertions=24,
        deletions=6,
        commits=[],
        files=[
            FileChange(
                path="tools/release/changelog/snippets.py",
                category="tools",
                subscopes=("release", "changelog"),
                insertions=24,
                deletions=6,
                commit_count=1,
                score=10.4,
                flags=("release-tooling",),
            )
        ],
        snippets=[
            DiffSnippet(
                path="tools/release/changelog/snippets.py",
                category="tools",
                subscopes=("release", "changelog"),
                score=12.1,
                reason="Selected from high-scoring tools file; function region `extract_relevant_snippets`",
                patch=(
                    "@@ -40,6 +42,12 @@ def extract_relevant_snippets(...):\n"
                    "+evidence_units = _extract_evidence_units(file_change.path, patch)\n"
                    "+ranked_units = sorted(evidence_units, key=...)"
                ),
                flags=("release-tooling",),
                region_kind="function",
                region_label="def extract_relevant_snippets",
                hunk_count=2,
                changed_lines=10,
                meaningful_lines=10,
            )
        ],
        detected_themes=["release-automation"],
    )
    return ReleaseContext(
        version="1.3.3",
        previous_tag="v1.3.2",
        head_sha="2222222bbbbbbb22",
        commit_count=1,
        categories={"tools": category},
        cross_cutting_notes=[],
    )


class RenderRawContractTests(unittest.TestCase):
    maxDiff = None

    def test_normal_category_with_snippets_fixture(self) -> None:
        rendered = render_release_changelog(_normal_context())
        self.assertEqual(rendered, _load_fixture("normal_category.md"))

    def test_category_with_files_but_no_snippets_fixture(self) -> None:
        rendered = render_release_changelog(_files_no_snippets_context())
        self.assertEqual(rendered, _load_fixture("files_no_snippets.md"))

    def test_weak_meta_category_fixture(self) -> None:
        rendered = render_release_changelog(_weak_meta_context())
        self.assertEqual(rendered, _load_fixture("weak_meta.md"))

    def test_multi_category_is_stably_ordered_fixture(self) -> None:
        rendered = render_release_changelog(_multi_category_context())
        self.assertEqual(rendered, _load_fixture("multi_category.md"))

        # Stable ordering contract: debian -> tools -> core (from CATEGORY_ORDER)
        self.assertLess(rendered.find("## Debian"), rendered.find("## Tools"))
        self.assertLess(rendered.find("## Tools"), rendered.find("## Core"))

    def test_minimal_release_fallback_fixture(self) -> None:
        rendered = render_release_changelog(_minimal_context())
        self.assertEqual(rendered, _load_fixture("minimal_release.md"))

    def test_uncategorized_commits_are_rendered(self) -> None:
        rendered = render_release_changelog(_uncategorized_only_context())
        self.assertIn("- Commits in range: 1", rendered)
        self.assertIn("- Release-note entries: 0", rendered)
        self.assertIn("## Uncategorized", rendered)
        self.assertIn("Merge branch 'main' into release-train", rendered)

    def test_renderer_output_is_byte_stable(self) -> None:
        context = _multi_category_context()
        first = render_release_changelog(context)
        second = render_release_changelog(context)
        self.assertEqual(first, second)

    def test_debug_renderer_explicit_none_markers(self) -> None:
        rendered = render_debug_context(_minimal_context())
        self.assertIn("No categories collected.", rendered)

        rendered_with_empty_lists = render_debug_context(_files_no_snippets_context())
        self.assertIn("Top Snippets:", rendered_with_empty_lists)
        self.assertIn("  - none", rendered_with_empty_lists)

    def test_debug_renderer_surfaces_snippet_region_metadata(self) -> None:
        rendered = render_debug_context(_metadata_snippet_context())
        self.assertIn("region=function", rendered)
        self.assertIn("label=def extract_relevant_snippets", rendered)
        self.assertIn("preview:", rendered)


if __name__ == "__main__":
    unittest.main()
