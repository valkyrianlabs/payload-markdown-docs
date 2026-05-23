from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from tools.release.changelog.context_builder import build_release_context
from tools.release.changelog.git_collect import (
    EMPTY_TREE_SHA,
    get_commits_since_tag,
    get_file_patch,
    get_first_release_tag_for_major,
    get_previous_release_tag_before,
    get_release_file_stats,
)
from tools.release.changelog.models import CommitInfo
from tools.release.version.models import Version


class ContextBuilderTests(unittest.TestCase):
    def test_current_non_patch_release_tag_defaults_to_previous_lower_release(self) -> None:
        commits = [
            CommitInfo(
                sha="6cf9a156eae61fd9ba2c2204ee9c73c2832bd14b",
                subject="update packaging documentation",
                body="",
                files=["tools/release/changelog/render_raw.py"],
                insertions=5,
                deletions=1,
                categories=["tools"],
            )
        ]

        with (
            patch("tools.release.changelog.context_builder.get_latest_tag", return_value="v0.30.0"),
            patch("tools.release.changelog.context_builder.get_previous_release_tag_before", return_value="v0.29.4") as lower_before,
            patch(
                "tools.release.changelog.context_builder.get_head_sha",
                return_value="6cf9a156eae61fd9ba2c2204ee9c73c2832bd14b",
            ),
            patch("tools.release.changelog.context_builder.get_commits_since_tag", return_value=commits),
            patch(
                "tools.release.changelog.context_builder.get_release_file_stats",
                return_value={"tools/release/changelog/render_raw.py": (5, 1)},
            ),
            patch("tools.release.changelog.context_builder.extract_relevant_snippets", return_value={}),
        ):
            context = build_release_context(version="0.30.0", repo_root=".")

        self.assertEqual(context.commit_count, 1)
        self.assertEqual(context.previous_tag, "v0.29.4")
        lower_before.assert_called_once_with(Path(".").resolve(), Version(0, 30, 0))
        self.assertTrue(context.cross_cutting_notes)
        self.assertIn("Current release tag was skipped", context.cross_cutting_notes[0])

    def test_current_non_patch_release_tag_with_no_lower_release_defaults_to_none(self) -> None:
        with (
            patch("tools.release.changelog.context_builder.get_latest_tag", return_value="v1.0.0"),
            patch("tools.release.changelog.context_builder.get_first_release_tag_for_major") as first_major,
            patch("tools.release.changelog.context_builder.get_head_sha", return_value="abc123"),
            patch("tools.release.changelog.context_builder.get_commits_since_tag", return_value=[]),
            patch("tools.release.changelog.context_builder.get_release_file_stats", return_value={}),
            patch("tools.release.changelog.context_builder.extract_relevant_snippets", return_value={}),
        ):
            context = build_release_context(version="1.0.0", repo_root=".")

        self.assertIsNone(context.previous_tag)
        self.assertEqual(context.release_kind, "major")
        self.assertEqual(context.release_focus, ("new features", "breaking changes if any", "general release notes"))
        first_major.assert_not_called()
        self.assertTrue(context.cross_cutting_notes)
        self.assertIn("using previous tag `none`", context.cross_cutting_notes[0])
        self.assertIn("full project history", context.cross_cutting_notes[-1])

    def test_major_release_defaults_to_first_tag_from_previous_major_line(self) -> None:
        with (
            patch("tools.release.changelog.context_builder.get_latest_tag", return_value="v2.0.0"),
            patch(
                "tools.release.changelog.context_builder.get_first_release_tag_for_major",
                return_value="v1.0.0",
            ) as first_major,
            patch("tools.release.changelog.context_builder.get_previous_release_tag_before") as previous_before,
            patch("tools.release.changelog.context_builder.get_head_sha", return_value="abc123"),
            patch("tools.release.changelog.context_builder.get_commits_since_tag", return_value=[]),
            patch("tools.release.changelog.context_builder.get_release_file_stats", return_value={}),
            patch("tools.release.changelog.context_builder.extract_relevant_snippets", return_value={}),
        ):
            context = build_release_context(version="2.0.0", repo_root=".")

        self.assertEqual(context.previous_tag, "v1.0.0")
        self.assertEqual(context.release_kind, "major")
        first_major.assert_called_once_with(Path(".").resolve(), 1)
        previous_before.assert_not_called()
        self.assertTrue(context.cross_cutting_notes)
        self.assertIn("Current release tag was skipped", context.cross_cutting_notes[0])
        self.assertIn("full previous major cycle", context.cross_cutting_notes[-1])

    def test_default_resolution_rejects_current_release_tag_checkpoint(self) -> None:
        with (
            patch("tools.release.changelog.context_builder.get_latest_tag", return_value="v1.4.0"),
            patch("tools.release.changelog.context_builder.get_previous_release_tag_before", return_value="v1.4.0"),
        ):
            with self.assertRaisesRegex(ValueError, "current release tag"):
                _ = build_release_context(version="1.4.0", repo_root=".")

    def test_explicit_current_release_tag_checkpoint_warns_without_default_guard(self) -> None:
        with (
            patch("tools.release.changelog.context_builder.get_latest_tag", return_value="v1.4.0"),
            patch("tools.release.changelog.context_builder.get_head_sha", return_value="abc123"),
            patch("tools.release.changelog.context_builder.get_commits_since_tag", return_value=[]),
            patch("tools.release.changelog.context_builder.get_release_file_stats", return_value={}),
            patch("tools.release.changelog.context_builder.extract_relevant_snippets", return_value={}),
        ):
            context = build_release_context(version="1.4.0", repo_root=".", previous_tag="v1.4.0")

        self.assertEqual(context.previous_tag, "v1.4.0")
        self.assertTrue(context.explicit_previous_tag)
        self.assertTrue(context.cross_cutting_notes)
        self.assertIn("Explicit changelog checkpoint points at the current release tag", context.cross_cutting_notes[0])

    def test_patch_release_defaults_to_previous_release_before_line_base(self) -> None:
        with (
            patch("tools.release.changelog.context_builder.get_latest_tag", return_value="v0.34.1"),
            patch("tools.release.changelog.context_builder.get_previous_release_tag_before", return_value="v0.33.0"),
            patch("tools.release.changelog.context_builder.get_head_sha", return_value="abc123"),
            patch("tools.release.changelog.context_builder.get_commits_since_tag", return_value=[]),
            patch("tools.release.changelog.context_builder.get_release_file_stats", return_value={}),
            patch("tools.release.changelog.context_builder.extract_relevant_snippets", return_value={}),
        ):
            context = build_release_context(version="0.34.4", repo_root=".")
        self.assertEqual(context.previous_tag, "v0.33.0")

    def test_non_patch_release_defaults_to_previous_lower_release_tag(self) -> None:
        with (
            patch("tools.release.changelog.context_builder.get_latest_tag", return_value="v0.33.9"),
            patch("tools.release.changelog.context_builder.get_previous_release_tag_before", return_value="v0.33.9") as lower_before_base,
            patch("tools.release.changelog.context_builder.get_head_sha", return_value="abc123"),
            patch("tools.release.changelog.context_builder.get_commits_since_tag", return_value=[]),
            patch("tools.release.changelog.context_builder.get_release_file_stats", return_value={}),
            patch("tools.release.changelog.context_builder.extract_relevant_snippets", return_value={}),
        ):
            context = build_release_context(version="0.34.0", repo_root=".")
        self.assertEqual(context.previous_tag, "v0.33.9")
        lower_before_base.assert_called_once_with(Path(".").resolve(), Version(0, 34, 0))
        self.assertFalse(context.cross_cutting_notes)

    def test_explicit_since_tag_override_bypasses_default_resolution(self) -> None:
        with (
            patch("tools.release.changelog.context_builder.get_latest_tag") as latest,
            patch("tools.release.changelog.context_builder.get_previous_release_tag_before") as lower_before_base,
            patch("tools.release.changelog.context_builder.get_head_sha", return_value="abc123"),
            patch("tools.release.changelog.context_builder.get_commits_since_tag", return_value=[]),
            patch("tools.release.changelog.context_builder.get_release_file_stats", return_value={}),
            patch("tools.release.changelog.context_builder.extract_relevant_snippets", return_value={}),
        ):
            context = build_release_context(version="0.34.2", repo_root=".", previous_tag="v0.34.1")
        self.assertEqual(context.previous_tag, "v0.34.1")
        latest.assert_not_called()
        lower_before_base.assert_not_called()

    def test_commit_order_is_preserved_for_recency_emphasis(self) -> None:
        commits = [
            CommitInfo(
                sha="newest",
                subject="new patch fix",
                body="",
                files=["tools/release/cli.py"],
                insertions=10,
                deletions=2,
                categories=["tools"],
            ),
            CommitInfo(
                sha="older",
                subject="older minor-line setup",
                body="",
                files=["tools/release/changelog/context_builder.py"],
                insertions=40,
                deletions=5,
                categories=["tools"],
            ),
        ]
        with (
            patch("tools.release.changelog.context_builder.get_latest_tag", return_value="v0.34.1"),
            patch("tools.release.changelog.context_builder.get_previous_release_tag_before", return_value="v0.33.0"),
            patch("tools.release.changelog.context_builder.get_head_sha", return_value="abc123"),
            patch("tools.release.changelog.context_builder.get_commits_since_tag", return_value=commits),
            patch(
                "tools.release.changelog.context_builder.get_release_file_stats",
                return_value={
                    "tools/release/cli.py": (10, 2),
                    "tools/release/changelog/context_builder.py": (40, 5),
                },
            ),
            patch("tools.release.changelog.context_builder.extract_relevant_snippets", return_value={}),
        ):
            context = build_release_context(version="0.34.2", repo_root=".")
        self.assertEqual([commit.sha for commit in context.commits], ["newest", "older"])



class GitCollectTests(unittest.TestCase):
    def test_empty_body_commit_is_not_dropped(self) -> None:
        git_log = "6cf9a156eae61fd9ba2c2204ee9c73c2832bd14b\x1fUpdate docs\x1f\x1e"

        with (
            patch("tools.release.changelog.git_collect._run_git", return_value=git_log),
            patch(
                "tools.release.changelog.git_collect.get_commit_file_summary",
                return_value=(["README.md"], 2, 1),
            ),
        ):
            commits = get_commits_since_tag(".", "v0.30.5")

        self.assertEqual(len(commits), 1)
        self.assertEqual(commits[0].sha, "6cf9a156eae61fd9ba2c2204ee9c73c2832bd14b")
        self.assertEqual(commits[0].subject, "Update docs")

    def test_metadata_only_packaging_release_commit_gets_non_meta_categories(self) -> None:
        git_log = (
            "6cf9a156eae61fd9ba2c2204ee9c73c2832bd14b\x1f"
            "update packaging documentation; clarify Debian build orchestration and release tooling structure"
            "\x1f\x1e"
        )

        with (
            patch("tools.release.changelog.git_collect._run_git", return_value=git_log),
            patch(
                "tools.release.changelog.git_collect.get_commit_file_summary",
                return_value=(["README.md"], 3, 0),
            ),
        ):
            commits = get_commits_since_tag(".", "v0.30.5")

        self.assertEqual(len(commits), 1)
        self.assertIn("meta", commits[0].categories)
        self.assertIn("debian", commits[0].categories)
        self.assertIn("release-tooling", commits[0].categories)

    def test_previous_release_tag_before_base_prefers_nearest_lower_tag(self) -> None:
        tags = "\n".join(["v0.33.0", "v0.32.1", "v0.34.1", "v0.35.0"])
        with patch("tools.release.changelog.git_collect._run_git", return_value=tags):
            resolved = get_previous_release_tag_before(".", Version(0, 34, 0))
        self.assertEqual(resolved, "v0.33.0")

    def test_previous_release_tag_before_handles_sparse_history(self) -> None:
        tags = "\n".join(["v0.33.0", "v0.58.7", "v0.58.8"])
        with patch("tools.release.changelog.git_collect._run_git", return_value=tags):
            resolved = get_previous_release_tag_before(".", Version(0, 58, 0))
        self.assertEqual(resolved, "v0.33.0")

    def test_first_release_tag_for_major_prefers_earliest_in_major_line(self) -> None:
        tags = "\n".join(["v1.2.0", "v1.0.0", "v2.0.0", "v1.1.1", "not-semver"])
        with patch("tools.release.changelog.git_collect._run_git", return_value=tags):
            resolved = get_first_release_tag_for_major(".", 1)
        self.assertEqual(resolved, "v1.0.0")

    def test_release_file_stats_use_empty_tree_diff_for_full_history(self) -> None:
        with patch("tools.release.changelog.git_collect._run_git", return_value="2\t0\tREADME.md\n") as run_git:
            stats = get_release_file_stats(".", None)

        self.assertEqual(stats, {"README.md": (2, 0)})
        run_git.assert_called_once_with(
            ["diff", "--numstat", EMPTY_TREE_SHA, "HEAD"],
            Path(".").resolve(),
        )

    def test_file_patch_uses_empty_tree_diff_for_full_history(self) -> None:
        with patch("tools.release.changelog.git_collect._run_git", return_value="patch") as run_git:
            patch_text = get_file_patch(".", "src/index.ts", None)

        self.assertEqual(patch_text, "patch")
        run_git.assert_called_once_with(
            [
                "diff",
                "--function-context",
                "--unified=120",
                EMPTY_TREE_SHA,
                "HEAD",
                "--",
                "src/index.ts",
            ],
            Path(".").resolve(),
        )

    def test_release_diffs_keep_tag_to_head_range_when_checkpoint_exists(self) -> None:
        with patch("tools.release.changelog.git_collect._run_git", return_value="1\t1\tsrc/index.ts\n") as run_git:
            stats = get_release_file_stats(".", "v0.9.0")

        self.assertEqual(stats, {"src/index.ts": (1, 1)})
        run_git.assert_called_once_with(
            ["diff", "--numstat", "v0.9.0..HEAD"],
            Path(".").resolve(),
        )



if __name__ == "__main__":
    unittest.main()
