from __future__ import annotations

import os
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from tools.release.changelog.release_workflow import (
    _resolve_stage_provider_timeout_seconds,
    validate_manual_changelog_current,
)


def _changelog(version: str, date: str) -> str:
    return (
        f"pmdocs ({version}) unstable; urgency=medium\n\n"
        "  - some entry\n\n"
        f" -- Test User <test@example.com>  {date}\n"
    )


def _git(repo: Path, *args: str, date: str | None = None) -> None:
    env = dict(os.environ)
    env.update(
        {
            "GIT_AUTHOR_NAME": "t",
            "GIT_AUTHOR_EMAIL": "t@example.com",
            "GIT_COMMITTER_NAME": "t",
            "GIT_COMMITTER_EMAIL": "t@example.com",
            "GIT_CONFIG_GLOBAL": "/dev/null",
            "GIT_CONFIG_SYSTEM": "/dev/null",
        }
    )
    if date:
        env["GIT_AUTHOR_DATE"] = date
        env["GIT_COMMITTER_DATE"] = date
    subprocess.run(["git", *args], cwd=repo, env=env, check=True, capture_output=True, text=True)


class ManualChangelogStaleBodyTests(unittest.TestCase):
    def _repo_with_tag(self, root: Path, *, tag: str, tag_date: str) -> None:
        _git(root, "init", "-q", "-b", "main")
        (root / "README").write_text("x\n", encoding="utf-8")
        _git(root, "add", "README")
        _git(root, "commit", "-q", "-m", "base", date=tag_date)
        _git(root, "tag", tag)

    def test_header_only_bump_of_previous_entry_is_rejected(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            self._repo_with_tag(root, tag="v1.2.2", tag_date="2026-06-03T12:00:00+00:00")
            (root / "VERSION").write_text("1.2.3\n", encoding="utf-8")
            changelog = root / "debian" / "changelog"
            changelog.parent.mkdir(parents=True)
            # Body dated before v1.2.2 shipped: only the header was bumped by set-version.
            changelog.write_text(_changelog("1.2.3-1", "Thu, 23 Apr 2026 15:40:45 +0000"), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "stale changelog body.*v1.2.2"):
                _ = validate_manual_changelog_current(
                    repo_root=root, changelog_path="debian/changelog", baseline_tag="v1.2.2"
                )

    def test_entry_written_after_previous_release_passes(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            self._repo_with_tag(root, tag="v1.2.2", tag_date="2026-06-03T12:00:00+00:00")
            (root / "VERSION").write_text("1.2.3\n", encoding="utf-8")
            changelog = root / "debian" / "changelog"
            changelog.parent.mkdir(parents=True)
            changelog.write_text(_changelog("1.2.3-1", "Sat, 06 Jun 2026 09:00:00 +0000"), encoding="utf-8")

            result = validate_manual_changelog_current(
                repo_root=root, changelog_path="debian/changelog", baseline_tag="v1.2.2"
            )
            self.assertEqual(result.version, "1.2.3")

    def test_unknown_baseline_keeps_version_only_check(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "VERSION").write_text("1.2.3\n", encoding="utf-8")
            changelog = root / "debian" / "changelog"
            changelog.parent.mkdir(parents=True)
            changelog.write_text(_changelog("1.2.3-1", "Thu, 23 Apr 2026 15:40:45 +0000"), encoding="utf-8")

            result = validate_manual_changelog_current(
                repo_root=root, changelog_path="debian/changelog", baseline_tag="v9.9.9"
            )
            self.assertEqual(result.detected_target, "1.2.3")


class ProviderTimeoutTests(unittest.TestCase):
    def test_every_stage_has_a_bounded_timeout(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("RELEASE_AI_PROVIDER_TIMEOUT_SECONDS", None)
            os.environ.pop("RELEASE_AI_EMERGENCY_TRIAGE_PROVIDER_TIMEOUT_SECONDS", None)
            for stage in ("triage", "draft", "polish", "release_notes"):
                self.assertEqual(_resolve_stage_provider_timeout_seconds(stage), 180.0)
            self.assertEqual(_resolve_stage_provider_timeout_seconds("emergency_triage"), 45.0)

    def test_timeout_env_override_and_invalid_values(self) -> None:
        with patch.dict(os.environ, {"RELEASE_AI_PROVIDER_TIMEOUT_SECONDS": "60"}):
            self.assertEqual(_resolve_stage_provider_timeout_seconds("draft"), 60.0)
        with patch.dict(os.environ, {"RELEASE_AI_PROVIDER_TIMEOUT_SECONDS": "-1"}):
            self.assertEqual(_resolve_stage_provider_timeout_seconds("draft"), 180.0)


if __name__ == "__main__":
    unittest.main()
