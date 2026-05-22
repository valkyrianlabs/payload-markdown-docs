from __future__ import annotations

import unittest
from unittest.mock import patch

from tools.release.changelog.models import CategoryContext, FileChange
from tools.release.changelog.snippets import extract_relevant_snippets


def _file(path: str, *, score: float = 10.0, insertions: int = 20, deletions: int = 4) -> FileChange:
    return FileChange(
        path=path,
        category="tools",
        subscopes=("release",),
        insertions=insertions,
        deletions=deletions,
        commit_count=1,
        score=score,
        flags=("release-tooling",),
    )


def _make_patch(hunks: int) -> str:
    blocks: list[str] = []
    for index in range(1, hunks + 1):
        blocks.append(
            f"@@ -{index},1 +{index},2 @@\n"
            f"-old_line_{index}\n"
            f"+new_line_{index}\n"
            f"+if changed_{index}: handle_update()\n"
        )
    return "\n".join(blocks)


class SnippetHarvestTests(unittest.TestCase):
    def test_extract_relevant_snippets_scales_with_category_heaviness(self) -> None:
        heavy = CategoryContext(
            name="tools",
            commit_count=12,
            insertions=900,
            deletions=220,
            commits=[],
            files=[
                _file("tools/release/cli.py", score=20.0, insertions=260, deletions=60),
                _file("tools/release/changelog/payload.py", score=18.0, insertions=220, deletions=50),
                _file("tools/release/changelog/ai/prompts/triage.py", score=17.5, insertions=210, deletions=48),
                _file("tools/release/changelog/release_workflow.py", score=16.0, insertions=180, deletions=42),
            ],
            snippets=[],
            detected_themes=["release-automation"],
        )
        light = CategoryContext(
            name="tools",
            commit_count=1,
            insertions=20,
            deletions=5,
            commits=[],
            files=[
                _file("tools/release/cli.py", score=12.0, insertions=20, deletions=5),
                _file("tools/release/changelog/payload.py", score=10.0, insertions=16, deletions=4),
            ],
            snippets=[],
            detected_themes=["release-automation"],
        )

        with patch("tools.release.changelog.snippets.get_file_patch", return_value=_make_patch(8)):
            snippets = extract_relevant_snippets(
                repo_root=".",
                previous_tag="v0.1.0",
                category_contexts={"heavy": heavy, "light": light},
                max_files_per_category=2,
                max_hunks_per_file=1,
            )

        self.assertGreater(len(snippets["heavy"]), len(snippets["light"]))

    def test_extract_relevant_snippets_excludes_derived_artifact_paths(self) -> None:
        context = CategoryContext(
            name="tools",
            commit_count=2,
            insertions=42,
            deletions=8,
            commits=[],
            files=[
                _file(".changelog_scratch/changelog.release.md", score=100.0, insertions=40, deletions=6),
                _file("tools/release/cli.py", score=12.0, insertions=12, deletions=2),
            ],
            snippets=[],
            detected_themes=["release-automation"],
        )

        def _patch_for(path_repo, path_file, path_prev):
            _ = (path_repo, path_prev)
            if path_file == ".changelog_scratch/changelog.release.md":
                raise AssertionError("derived artifact path should be excluded from semantic snippet harvest")
            return _make_patch(2)

        with patch("tools.release.changelog.snippets.get_file_patch", side_effect=_patch_for):
            snippets = extract_relevant_snippets(
                repo_root=".",
                previous_tag="v0.1.0",
                category_contexts={"tools": context},
                max_files_per_category=5,
                max_hunks_per_file=2,
            )

        harvested = snippets["tools"]
        self.assertTrue(harvested)
        self.assertTrue(all(item.path == "tools/release/cli.py" for item in harvested))

    def test_extract_relevant_snippets_groups_adjacent_unified_hunks(self) -> None:
        context = CategoryContext(
            name="tools",
            commit_count=2,
            insertions=80,
            deletions=18,
            commits=[],
            files=[_file("tools/release/cli.py", score=20.0, insertions=80, deletions=18)],
            snippets=[],
            detected_themes=["release-automation"],
        )

        patch_text = (
            "diff --git a/tools/release/cli.py b/tools/release/cli.py\n"
            "index 1111111..2222222 100644\n"
            "--- a/tools/release/cli.py\n"
            "+++ b/tools/release/cli.py\n"
            "@@ -40,6 +40,9 @@ def add_compare_command(subparsers):\n"
            "+compare.add_argument(\"--ai-profiles\", required=True)\n"
            "+compare.add_argument(\"--output-name\")\n"
            "@@ -47,5 +50,8 @@ def add_compare_command(subparsers):\n"
            "+compare.add_argument(\"--show-config\", action=\"store_true\")\n"
            "+compare.add_argument(\"--keep-artifacts\", action=\"store_true\")\n"
        )

        with patch("tools.release.changelog.snippets.get_file_patch", return_value=patch_text):
            snippets = extract_relevant_snippets(
                repo_root=".",
                previous_tag="v0.1.0",
                category_contexts={"tools": context},
                max_files_per_category=2,
                max_hunks_per_file=1,
            )

        harvested = snippets["tools"]
        self.assertEqual(len(harvested), 1)
        self.assertIn("--ai-profiles", harvested[0].patch)
        self.assertIn("--keep-artifacts", harvested[0].patch)
        self.assertIn("grouped", harvested[0].reason)

    def test_extract_relevant_snippets_lifts_same_function_hunks_into_single_unit(self) -> None:
        context = CategoryContext(
            name="tools",
            commit_count=3,
            insertions=120,
            deletions=32,
            commits=[],
            files=[_file("tools/release/changelog/release_workflow.py", score=18.0, insertions=120, deletions=32)],
            snippets=[],
            detected_themes=["release-automation"],
        )
        patch_text = (
            "@@ -40,6 +40,10 @@ def run_ai_release_pipeline(config):\n"
            " draft = run_draft_stage(context)\n"
            "+draft = run_draft_stage(context)\n"
            "+emit_artifact(\"changelog.release.md\", draft)\n"
            "@@ -98,6 +108,12 @@ def run_ai_release_pipeline(config):\n"
            " notes = None\n"
            "+if config.release_notes:\n"
            "+    notes = run_release_notes_stage(draft)\n"
            "+    emit_artifact(\"release_notes.md\", notes)\n"
        )
        with patch("tools.release.changelog.snippets.get_file_patch", return_value=patch_text):
            snippets = extract_relevant_snippets(
                repo_root=".",
                previous_tag="v0.1.0",
                category_contexts={"tools": context},
                max_files_per_category=2,
                max_hunks_per_file=1,
            )
        harvested = snippets["tools"]
        self.assertEqual(len(harvested), 1)
        self.assertEqual(harvested[0].region_kind, "function")
        self.assertIn("run_ai_release_pipeline", harvested[0].region_label or "")
        self.assertGreaterEqual(harvested[0].hunk_count, 2)
        self.assertIn(" draft = run_draft_stage(context)", harvested[0].patch)

    def test_extract_relevant_snippets_keeps_trivial_self_contained_hunk_small(self) -> None:
        context = CategoryContext(
            name="tools",
            commit_count=1,
            insertions=4,
            deletions=1,
            commits=[],
            files=[_file("tools/release/cli.py", score=9.0, insertions=4, deletions=1)],
            snippets=[],
            detected_themes=["release-automation"],
        )
        patch_text = (
            "@@ -22,4 +22,5 @@ def build_parser(subparsers):\n"
            "+compare.add_argument(\"--output-name\")\n"
        )
        with patch("tools.release.changelog.snippets.get_file_patch", return_value=patch_text):
            snippets = extract_relevant_snippets(
                repo_root=".",
                previous_tag="v0.1.0",
                category_contexts={"tools": context},
                max_files_per_category=2,
                max_hunks_per_file=2,
            )
        harvested = snippets["tools"]
        self.assertEqual(len(harvested), 1)
        self.assertEqual(harvested[0].hunk_count, 1)
        self.assertLessEqual(harvested[0].changed_lines, 2)
        self.assertIn(harvested[0].region_kind, {"function", "command"})

    def test_extract_relevant_snippets_splits_oversized_single_region(self) -> None:
        context = CategoryContext(
            name="tools",
            commit_count=6,
            insertions=420,
            deletions=130,
            commits=[],
            files=[_file("tools/release/changelog/payload.py", score=24.0, insertions=420, deletions=130)],
            snippets=[],
            detected_themes=["release-automation"],
        )
        body_lines: list[str] = []
        for idx in range(1, 760):
            if idx in {1, 180, 360, 540, 720}:
                body_lines.append(f"+def semantic_block_{idx}(payload):")
            else:
                body_lines.append(f"+    update_field_{idx} = compute_value_{idx}()")
        patch_text = (
            "@@ -1,3 +1,820 @@ def build_semantic_payload(context):\n"
            + "\n".join(body_lines)
        )
        with patch("tools.release.changelog.snippets.get_file_patch", return_value=patch_text):
            snippets = extract_relevant_snippets(
                repo_root=".",
                previous_tag="v0.1.0",
                category_contexts={"tools": context},
                max_files_per_category=2,
                max_hunks_per_file=4,
            )
        harvested = snippets["tools"]
        self.assertGreaterEqual(len(harvested), 2)
        self.assertTrue(all(item.changed_lines <= 220 for item in harvested))
        self.assertTrue(all(item.region_kind in {"function", "block", "command"} for item in harvested))

    def test_extract_relevant_snippets_marks_declaration_region(self) -> None:
        context = CategoryContext(
            name="core",
            commit_count=1,
            insertions=14,
            deletions=2,
            commits=[],
            files=[
                FileChange(
                    path="core/include/command_registry.hpp",
                    category="core",
                    subscopes=("include",),
                    insertions=14,
                    deletions=2,
                    commit_count=1,
                    score=12.0,
                    flags=("api-surface",),
                )
            ],
            snippets=[],
            detected_themes=["core"],
        )
        patch_text = (
            "@@ -10,6 +10,12 @@ class CommandRegistry {\n"
            "+struct CommandUsageEntry {\n"
            "+    std::string name;\n"
            "+    std::string summary;\n"
            "+};\n"
            "+void RegisterUsageEntries(const std::vector<CommandUsageEntry>& entries);\n"
        )
        with patch("tools.release.changelog.snippets.get_file_patch", return_value=patch_text):
            snippets = extract_relevant_snippets(
                repo_root=".",
                previous_tag="v0.1.0",
                category_contexts={"core": context},
                max_files_per_category=2,
                max_hunks_per_file=2,
            )
        harvested = snippets["core"]
        self.assertEqual(len(harvested), 1)
        self.assertEqual(harvested[0].region_kind, "declaration")

    def test_extract_relevant_snippets_marks_usage_region(self) -> None:
        context = CategoryContext(
            name="tools",
            commit_count=1,
            insertions=8,
            deletions=1,
            commits=[],
            files=[_file("tools/release/cli.py", score=11.0, insertions=8, deletions=1)],
            snippets=[],
            detected_themes=["release-automation"],
        )
        patch_text = (
            "@@ -50,4 +50,9 @@ def build_parser(subparsers):\n"
            "+usage_text = \"Usage: vh changelog ai-compare --ai-profiles=<profiles>\"\n"
            "+compare.help = \"Generate side-by-side profile output\"\n"
            "+compare.epilog = usage_text\n"
        )
        with patch("tools.release.changelog.snippets.get_file_patch", return_value=patch_text):
            snippets = extract_relevant_snippets(
                repo_root=".",
                previous_tag="v0.1.0",
                category_contexts={"tools": context},
                max_files_per_category=2,
                max_hunks_per_file=2,
            )
        harvested = snippets["tools"]
        self.assertEqual(len(harvested), 1)
        self.assertEqual(harvested[0].region_kind, "usage")

    def test_extract_relevant_snippets_deletion_heavy_setup_not_test_region(self) -> None:
        context = CategoryContext(
            name="tools",
            commit_count=2,
            insertions=3,
            deletions=20,
            commits=[],
            files=[_file("tools/release/tests/test_cli_changelog.py", score=13.0, insertions=3, deletions=20)],
            snippets=[],
            detected_themes=["release-automation"],
        )
        patch_text = (
            "@@ -40,20 +40,3 @@ def configure_parser_fixture(parser):\n"
            "-subparsers = parser.add_subparsers(dest=\"cmd\")\n"
            "-compare = subparsers.add_parser(\"ai-compare\")\n"
            "-compare.add_argument(\"--ai-profiles\", required=True)\n"
            "-compare.add_argument(\"--output-name\")\n"
            "-compare.add_argument(\"--show-config\", action=\"store_true\")\n"
            "-compare.add_argument(\"--keep-artifacts\", action=\"store_true\")\n"
            "-compare.set_defaults(handler=run_ai_compare)\n"
            "+return parser\n"
        )
        with patch("tools.release.changelog.snippets.get_file_patch", return_value=patch_text):
            snippets = extract_relevant_snippets(
                repo_root=".",
                previous_tag="v0.1.0",
                category_contexts={"tools": context},
                max_files_per_category=2,
                max_hunks_per_file=2,
            )
        harvested = snippets["tools"]
        self.assertEqual(len(harvested), 1)
        self.assertEqual(harvested[0].region_kind, "command")


if __name__ == "__main__":
    unittest.main()
