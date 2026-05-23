from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from tools.release.changelog.release_workflow import (
    parse_release_ai_settings,
    refresh_debian_changelog_entry,
    release_notes_context_matches,
    render_cached_draft_markdown,
    resolve_local_release_pipeline_config,
    resolve_release_changelog,
    validate_cached_draft_current,
    validate_manual_changelog_current,
    write_release_notes_context_metadata,
)


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _make_debian_changelog(path: Path, full_version: str) -> None:
    _write(
        path,
        (
            f"pmdocs ({full_version}) unstable; urgency=medium\n\n"
            "  * test entry\n\n"
            " -- Test User <test@example.com>  Sun, 19 Apr 2026 00:00:00 +0000\n"
        ),
    )


class ReleaseWorkflowSelectionTests(unittest.TestCase):
    @staticmethod
    def _context(
        *,
        version: str = "2.0.0",
        previous_tag: str | None = "v1.9.0",
        head_sha: str = "abc123def456",
        commit_count: int = 4,
    ):
        return type(
            "_Context",
            (),
            {
                "version": version,
                "previous_tag": previous_tag,
                "head_sha": head_sha,
                "commit_count": commit_count,
                "categories": {},
                "commits": [],
                "cross_cutting_notes": [],
                "latest_tag": f"v{version}",
                "skipped_current_release_tag": True,
                "explicit_previous_tag": False,
            },
        )()

    def test_auto_mode_prefers_openai_before_local(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write(repo_root / "VERSION", "1.2.3\n")
            _make_debian_changelog(repo_root / "debian" / "changelog", "1.2.3-1")
            settings = parse_release_ai_settings(
                {
                    "RELEASE_AI_MODE": "auto",
                    "OPENAI_API_KEY": "secret",
                    "RELEASE_AI_PROFILE_OPENAI": "openai-balanced",
                    "RELEASE_LOCAL_LLM_ENABLED": "true",
                    "RELEASE_LOCAL_LLM_PROFILE": "local-gemma",
                }
            )

            with (
                patch(
                    "tools.release.changelog.release_workflow._generate_openai_release_changelog",
                    return_value=("# OpenAI Draft\n", "# OpenAI Release Notes\n"),
                ) as openai_path,
                patch("tools.release.changelog.release_workflow._generate_local_release_changelog") as local_path,
                patch("tools.release.changelog.release_workflow.validate_manual_changelog_current") as manual_path,
            ):
                result = resolve_release_changelog(
                    repo_root=repo_root,
                    payload={"schema_version": "x"},
                    settings=settings,
                    logger=lambda _line: None,
                )

            self.assertEqual(result.path, "openai")
            self.assertEqual(result.content, "# OpenAI Draft\n")
            self.assertEqual(result.release_notes_content, "# OpenAI Release Notes\n")
            openai_path.assert_called_once()
            local_path.assert_not_called()
            manual_path.assert_not_called()

    def test_local_path_requires_explicit_enable_flag(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write(repo_root / "VERSION", "1.2.3\n")
            _make_debian_changelog(repo_root / "debian" / "changelog", "1.2.3-1")
            settings = parse_release_ai_settings(
                {
                    "RELEASE_AI_MODE": "auto",
                    "RELEASE_LOCAL_LLM_ENABLED": "false",
                    "RELEASE_LOCAL_LLM_PROFILE": "local-gemma",
                    "RELEASE_LOCAL_LLM_BASE_URL": "http://127.0.0.1:8888/v1",
                }
            )

            with (
                patch("tools.release.changelog.release_workflow._generate_openai_release_changelog") as openai_path,
                patch("tools.release.changelog.release_workflow._generate_local_release_changelog") as local_path,
            ):
                result = resolve_release_changelog(
                    repo_root=repo_root,
                    payload={"schema_version": "x"},
                    settings=settings,
                    logger=lambda _line: None,
                )

            self.assertEqual(result.path, "manual")
            self.assertIn("pmdocs (1.2.3-1)", result.content)
            openai_path.assert_not_called()
            local_path.assert_not_called()

    def test_manual_mode_passes_when_changelog_current(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write(repo_root / "VERSION", "2.0.0\n")
            _make_debian_changelog(repo_root / "debian" / "changelog", "2.0.0-3")
            settings = parse_release_ai_settings({"RELEASE_AI_MODE": "disabled"})

            result = resolve_release_changelog(
                repo_root=repo_root,
                payload={"schema_version": "x"},
                settings=settings,
                logger=lambda _line: None,
            )

            self.assertEqual(result.path, "manual")
            self.assertIn("2.0.0-3", result.content)

    def test_manual_mode_fails_when_changelog_missing(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write(repo_root / "VERSION", "2.0.0\n")
            settings = parse_release_ai_settings({"RELEASE_AI_MODE": "disabled"})

            with self.assertRaisesRegex(ValueError, "required file is missing"):
                _ = resolve_release_changelog(
                    repo_root=repo_root,
                    payload={"schema_version": "x"},
                    settings=settings,
                    logger=lambda _line: None,
                )

    def test_auto_mode_uses_cached_draft_before_manual_fallback(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write(repo_root / "VERSION", "2.0.0\n")
            _make_debian_changelog(repo_root / "debian" / "changelog", "2.0.0-3")
            cached = render_cached_draft_markdown(version="2.0.0", content="# AI Draft\n- from cache\n")
            _write(repo_root / ".changelog_scratch" / "changelog.draft.md", cached)
            settings = parse_release_ai_settings({"RELEASE_AI_MODE": "disabled"})

            result = resolve_release_changelog(
                repo_root=repo_root,
                payload={"schema_version": "x"},
                settings=settings,
                logger=lambda _line: None,
            )

            self.assertEqual(result.path, "cached-draft")
            self.assertIn("- from cache", result.content)
            self.assertIsNotNone(result.source_path)

    def test_auto_mode_skips_stale_cached_draft_and_falls_back_to_manual(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write(repo_root / "VERSION", "2.0.0\n")
            _make_debian_changelog(repo_root / "debian" / "changelog", "2.0.0-3")
            cached = render_cached_draft_markdown(version="1.9.9", content="# AI Draft\n- stale cache\n")
            _write(repo_root / ".changelog_scratch" / "changelog.draft.md", cached)
            settings = parse_release_ai_settings({"RELEASE_AI_MODE": "disabled"})

            result = resolve_release_changelog(
                repo_root=repo_root,
                payload={"schema_version": "x"},
                settings=settings,
                logger=lambda _line: None,
            )

            self.assertEqual(result.path, "manual")
            self.assertIn("2.0.0-3", result.content)

    def test_cached_draft_validation_accepts_matching_release_context(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            context = self._context()
            _write(repo_root / "VERSION", "2.0.0\n")
            draft_path = repo_root / ".changelog_scratch" / "changelog.draft.md"
            _write(
                draft_path,
                render_cached_draft_markdown(version="2.0.0", content="# AI Draft\n- current\n", context=context),
            )

            result = validate_cached_draft_current(
                repo_root=repo_root,
                draft_path=draft_path,
                context=context,
                require_context=True,
            )

            self.assertEqual(result.content, "# AI Draft\n- current\n")

    def test_cached_draft_validation_rejects_same_version_stale_context(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            current = self._context(previous_tag="v1.9.0")
            stale = self._context(previous_tag="v1.8.0")
            _write(repo_root / "VERSION", "2.0.0\n")
            draft_path = repo_root / ".changelog_scratch" / "changelog.draft.md"
            _write(
                draft_path,
                render_cached_draft_markdown(version="2.0.0", content="# AI Draft\n- stale\n", context=stale),
            )

            with self.assertRaisesRegex(ValueError, "stale for the current release context"):
                _ = validate_cached_draft_current(
                    repo_root=repo_root,
                    draft_path=draft_path,
                    context=current,
                    require_context=True,
                )

    def test_cached_draft_validation_rejects_missing_context_when_required(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            context = self._context()
            _write(repo_root / "VERSION", "2.0.0\n")
            draft_path = repo_root / ".changelog_scratch" / "changelog.draft.md"
            _write(draft_path, render_cached_draft_markdown(version="2.0.0", content="# AI Draft\n"))

            with self.assertRaisesRegex(ValueError, "missing required release context marker"):
                _ = validate_cached_draft_current(
                    repo_root=repo_root,
                    draft_path=draft_path,
                    context=context,
                    require_context=True,
                )

    def test_release_notes_context_must_match_current_context(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            notes_path = repo_root / "release_notes.md"
            current = self._context(head_sha="abc123def456")
            stale = self._context(head_sha="fff999000111")
            _write(notes_path, "# Public Notes\n")
            write_release_notes_context_metadata(release_notes_path=notes_path, context=stale)

            self.assertFalse(release_notes_context_matches(release_notes_path=notes_path, context=current))

            write_release_notes_context_metadata(release_notes_path=notes_path, context=current)
            self.assertTrue(release_notes_context_matches(release_notes_path=notes_path, context=current))


class ReleaseWorkflowConfigTests(unittest.TestCase):
    def test_local_base_url_env_override_replaces_profile_base_url(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write(
                repo_root / "ai.yml",
                """
profiles:
  local-gemma:
    provider: openai-compatible
    base_url: http://127.0.0.1:7777/v1
    stages:
      draft:
        model: Gemma-4-31B
""",
            )

            pipeline, profile_base_url, override_applied = resolve_local_release_pipeline_config(
                repo_root=repo_root,
                profile_slug="local-gemma",
                base_url_override="http://10.0.0.20:11434/v1",
            )

            self.assertEqual(profile_base_url, "http://127.0.0.1:7777/v1")
            self.assertEqual(pipeline.base_url, "http://10.0.0.20:11434/v1")
            self.assertTrue(override_applied)

    def test_manual_stale_validation_fails_for_mismatched_version(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            _write(repo_root / "VERSION", "1.2.3\n")
            _make_debian_changelog(repo_root / "debian" / "changelog", "1.2.2-1")

            with self.assertRaisesRegex(ValueError, "stale changelog"):
                _ = validate_manual_changelog_current(
                    repo_root=repo_root,
                    changelog_path="debian/changelog",
                )

    def test_refresh_debian_changelog_entry_rewrites_full_top_entry(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            changelog_path = repo_root / "debian" / "changelog"
            _write(
                changelog_path,
                (
                    "pmdocs (1.2.3-2) unstable; urgency=medium\n\n"
                    "  - previous line\n\n"
                    " -- Test User <test@example.com>  Sun, 19 Apr 2026 00:00:00 +0000\n\n"
                    "pmdocs (1.2.2-1) unstable; urgency=medium\n\n"
                    "  - older entry\n\n"
                    " -- Test User <test@example.com>  Sat, 18 Apr 2026 00:00:00 +0000\n"
                ),
            )

            result = refresh_debian_changelog_entry(
                changelog_path=changelog_path,
                release_markdown="# Release\n- alpha change\n- beta change\n",
                now=datetime(2026, 4, 21, 18, 30, 0, tzinfo=timezone.utc),
            )

            rendered = changelog_path.read_text(encoding="utf-8")
            self.assertEqual(result.package, "pmdocs")
            self.assertEqual(result.full_version, "1.2.3-2")
            self.assertEqual(result.distribution, "unstable")
            self.assertEqual(result.urgency, "medium")
            self.assertIn("pmdocs (1.2.3-2) unstable; urgency=medium", rendered)
            self.assertIn("  - alpha change", rendered)
            self.assertIn("  - beta change", rendered)
            self.assertIn(" -- Test User <test@example.com>  Tue, 21 Apr 2026 18:30:00 +0000", rendered)
            self.assertIn("pmdocs (1.2.2-1) unstable; urgency=medium", rendered)

    def test_refresh_debian_changelog_entry_honors_distribution_urgency_override(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            changelog_path = repo_root / "debian" / "changelog"
            _make_debian_changelog(changelog_path, "2.1.0-1")

            result = refresh_debian_changelog_entry(
                changelog_path=changelog_path,
                release_markdown="- release note one\n",
                distribution="stable",
                urgency="high",
                now=datetime(2026, 4, 21, 19, 0, 0, tzinfo=timezone.utc),
            )

            rendered = changelog_path.read_text(encoding="utf-8")
            self.assertEqual(result.distribution, "stable")
            self.assertEqual(result.urgency, "high")
            self.assertIn("pmdocs (2.1.0-1) stable; urgency=high", rendered)

    def test_refresh_debian_changelog_entry_honors_env_distribution_urgency_and_maintainer(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            changelog_path = repo_root / "debian" / "changelog"
            _make_debian_changelog(changelog_path, "2.1.0-1")

            result = refresh_debian_changelog_entry(
                changelog_path=changelog_path,
                release_markdown="- release note one\n",
                environ={
                    "RELEASE_DEBIAN_DISTRIBUTION": "stable",
                    "RELEASE_DEBIAN_URGENCY": "low",
                    "DEBFULLNAME": "Release Bot",
                    "DEBEMAIL": "release@example.com",
                },
                now=datetime(2026, 4, 21, 19, 30, 0, tzinfo=timezone.utc),
            )

            rendered = changelog_path.read_text(encoding="utf-8")
            self.assertEqual(result.distribution, "stable")
            self.assertEqual(result.urgency, "low")
            self.assertEqual(result.maintainer, "Release Bot <release@example.com>")
            self.assertIn("pmdocs (2.1.0-1) stable; urgency=low", rendered)
            self.assertIn(" -- Release Bot <release@example.com>  Tue, 21 Apr 2026 19:30:00 +0000", rendered)

    def test_refresh_debian_changelog_entry_rejects_invalid_distribution(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            changelog_path = repo_root / "debian" / "changelog"
            _make_debian_changelog(changelog_path, "2.1.0-1")

            with self.assertRaisesRegex(ValueError, "invalid distribution"):
                _ = refresh_debian_changelog_entry(
                    changelog_path=changelog_path,
                    release_markdown="- release note\n",
                    distribution="invalid token",
                )

    def test_refresh_debian_changelog_entry_uses_rfc2822_timestamp_format(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            changelog_path = repo_root / "debian" / "changelog"
            _make_debian_changelog(changelog_path, "2.1.0-1")

            _ = refresh_debian_changelog_entry(
                changelog_path=changelog_path,
                release_markdown="- note\n",
                now=datetime(2026, 4, 21, 20, 45, 0, tzinfo=timezone.utc),
            )

            rendered = changelog_path.read_text(encoding="utf-8")
            signature_line = next(line for line in rendered.splitlines() if line.startswith(" -- "))
            self.assertRegex(signature_line, re.compile(r"^ -- .+  [A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}$"))

    def test_refresh_debian_changelog_entry_filters_classifier_residue_bullets(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            changelog_path = repo_root / "debian" / "changelog"
            _make_debian_changelog(changelog_path, "2.1.0-1")

            _ = refresh_debian_changelog_entry(
                changelog_path=changelog_path,
                release_markdown=(
                    "# Release\n"
                    "- important files: tools/release/changelog/payload.py\n"
                    "- evidence_refs: core/protocols/websocket/server.cpp#error-handling\n"
                    "- Hardened OpenAI request/response validation paths for release generation.\n"
                ),
            )

            rendered = changelog_path.read_text(encoding="utf-8")
            self.assertIn("Hardened OpenAI request/response validation paths for release generation.", rendered)
            self.assertNotIn("important files", rendered)
            self.assertNotIn("evidence_refs", rendered)
            self.assertNotIn("tools/release/changelog/payload.py", rendered)

    def test_refresh_debian_changelog_entry_rejects_when_only_low_value_bullets_remain(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            changelog_path = repo_root / "debian" / "changelog"
            _make_debian_changelog(changelog_path, "2.1.0-1")

            with self.assertRaisesRegex(ValueError, "no usable summary lines"):
                _ = refresh_debian_changelog_entry(
                    changelog_path=changelog_path,
                    release_markdown=(
                        "# Release\n"
                        "- important files: tools/release/changelog/payload.py\n"
                        "- evidence_refs: core/fuse/mount_service.cpp#filesystem-lifecycle\n"
                    ),
                )


if __name__ == "__main__":
    unittest.main()
