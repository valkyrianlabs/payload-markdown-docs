from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from tools.release import cli
from tools.release.changelog.ai.config import DEFAULT_AI_DRAFT_MODEL
from tools.release.changelog.ai.providers import ProviderPreflightResult
from tools.release.changelog.release_workflow import render_cached_draft_markdown
from tools.release.cli_tools.commands.changelog.basic import cmd_changelog_draft, cmd_changelog_payload, \
    cmd_changelog_release
from tools.release.cli_tools.commands.changelog.check import cmd_changelog_ai_check
from tools.release.cli_tools.commands.changelog.compare import cmd_changelog_ai_compare
from tools.release.cli_tools.commands.changelog.draft import cmd_changelog_ai_draft
from tools.release.cli_tools.commands.changelog.release import cmd_changelog_ai_release
from tools.release.tests.helpers.ai_draft_harness import AIDraftHarness
from tools.release.tests.helpers.build_ai_profile import build_openai_profile
from tools.release.tests.helpers.cli_harness import CliHarness


class CliChangelogDraftTests(unittest.TestCase):
    @staticmethod
    def _args(
        *,
        repo_root: str = ".",
        fmt: str = "raw",
        since_tag: str | None = None,
        output: str | None = None,
    ) -> argparse.Namespace:
        return argparse.Namespace(
            repo_root=repo_root,
            format=fmt,
            since_tag=since_tag,
            output=output,
        )

    def test_changelog_draft_facade_behaviors(self) -> None:
        cases = (
            {
                "name": "raw_stdout",
                "fmt": "raw",
                "since_tag": None,
                "rendered": "# Release Draft\n",
                "expected_stdout": "# Release Draft\n",
                "json_rendered": '{"ignored":true}',
                "output_name": None,
            },
            {
                "name": "json_stdout",
                "fmt": "json",
                "since_tag": "v0.27.0",
                "rendered": "# Ignored Draft\n",
                "expected_stdout": '{"ok":true}\n',
                "json_rendered": '{"ok":true}',
                "output_name": None,
            },
            {
                "name": "raw_file_output",
                "fmt": "raw",
                "since_tag": None,
                "rendered": "# File Draft\n",
                "expected_stdout_contains": "Wrote changelog draft to",
                "json_rendered": '{"ignored":true}',
                "output_name": "release.md",
            },
        )

        for case in cases:
            with self.subTest(case=case["name"]):
                with TemporaryDirectory() as temp_dir:
                    target = Path(temp_dir) / case["output_name"] if case["output_name"] else None
                    args = self._args(
                        fmt=case["fmt"],
                        since_tag=case["since_tag"],
                        output=str(target) if target else None,
                    )
                    with CliHarness(self) as h:
                        build_context = h.mock_build_changelog_context(object(), module="basic")
                        render_raw = h.mock_render_release_changelog(case["rendered"])
                        render_json = h.mock_render_debug_json(case["json_rendered"])
                        result = cmd_changelog_draft(args)

                    self.assertEqual(result, 0)
                    self.assertEqual(build_context.call_args.args[1], case["since_tag"])
                    if case["fmt"] == "json":
                        render_json.assert_called_once()
                        render_raw.assert_not_called()
                    else:
                        render_raw.assert_called_once()
                        render_json.assert_not_called()
                    if target is None:
                        self.assertEqual(h.stdout(), case["expected_stdout"])
                    else:
                        self.assertTrue(target.is_file())
                        self.assertEqual(target.read_text(encoding="utf-8"), case["rendered"])
                        self.assertIn(case["expected_stdout_contains"], h.stdout())

    def test_new_command_surface_parses(self) -> None:
        parser = cli.build_parser()

        parsed = parser.parse_args(["changelog", "draft"])
        self.assertEqual(parsed.command, "changelog")
        self.assertEqual(parsed.changelog_command, "draft")
        self.assertEqual(parsed.format, "raw")

        parsed_json = parser.parse_args(
            ["changelog", "draft", "--format", "json", "--since-tag", "v0.1.0", "--output", "/tmp/x.md"]
        )
        self.assertEqual(parsed_json.format, "json")
        self.assertEqual(parsed_json.since_tag, "v0.1.0")
        self.assertEqual(parsed_json.output, "/tmp/x.md")

        parsed_payload = parser.parse_args(
            ["changelog", "payload", "--since-tag", "v0.1.0", "--output", "/tmp/payload.json"]
        )
        self.assertEqual(parsed_payload.command, "changelog")
        self.assertEqual(parsed_payload.changelog_command, "payload")
        self.assertEqual(parsed_payload.since_tag, "v0.1.0")
        self.assertEqual(parsed_payload.output, "/tmp/payload.json")

        parsed_release = parser.parse_args(
            [
                "changelog",
                "release",
                "--since-tag",
                "v0.1.0",
                "--output",
                "/tmp/release.md",
                "--raw-output",
                "/tmp/raw.md",
                "--payload-output",
                "/tmp/release-payload.json",
                "--semantic-payload-output",
                "/tmp/release-semantic-payload.json",
                "--context-output",
                "/tmp/release-context.json",
                "--manual-changelog-path",
                "debian/changelog",
            ]
        )
        self.assertEqual(parsed_release.command, "changelog")
        self.assertEqual(parsed_release.changelog_command, "release")
        self.assertEqual(parsed_release.since_tag, "v0.1.0")
        self.assertEqual(parsed_release.output, "/tmp/release.md")
        self.assertEqual(parsed_release.raw_output, "/tmp/raw.md")
        self.assertEqual(parsed_release.payload_output, "/tmp/release-payload.json")
        self.assertEqual(parsed_release.semantic_payload_output, "/tmp/release-semantic-payload.json")
        self.assertEqual(parsed_release.context_output, "/tmp/release-context.json")
        self.assertEqual(parsed_release.manual_changelog_path, "debian/changelog")
        self.assertEqual(parsed_release.cached_draft_path, ".changelog_scratch/changelog.draft.md")
        self.assertIsNone(parsed_release.debian_distribution)
        self.assertIsNone(parsed_release.debian_urgency)

        parsed_ai_release = parser.parse_args(
            [
                "changelog",
                "ai-release",
                "--ai-profile",
                "openai-balanced",
                "--draft-output",
                "/tmp/draft.md",
                "--output",
                "/tmp/release.md",
            ]
        )
        self.assertEqual(parsed_ai_release.command, "changelog")
        self.assertEqual(parsed_ai_release.changelog_command, "ai-release")
        self.assertEqual(parsed_ai_release.ai_profile, "openai-balanced")
        self.assertEqual(parsed_ai_release.draft_output, "/tmp/draft.md")
        self.assertEqual(parsed_ai_release.output, "/tmp/release.md")
        self.assertEqual(
            parsed_ai_release.semantic_payload_output,
            ".changelog_scratch/changelog.semantic_payload.json",
        )

        parsed_ai_check = parser.parse_args(
            [
                "changelog",
                "ai-check",
                "--ai-profile",
                "local-gemma",
                "--provider",
                "openai-compatible",
                "--base-url",
                "http://localhost:8888/v1",
                "--model",
                "Qwen3.5-122B",
            ]
        )
        self.assertEqual(parsed_ai_check.command, "changelog")
        self.assertEqual(parsed_ai_check.changelog_command, "ai-check")
        self.assertEqual(parsed_ai_check.ai_profile, "local-gemma")
        self.assertEqual(parsed_ai_check.provider, "openai-compatible")
        self.assertEqual(parsed_ai_check.base_url, "http://localhost:8888/v1")
        self.assertEqual(parsed_ai_check.model, "Qwen3.5-122B")

        parsed_ai = parser.parse_args(
            [
                "changelog",
                "ai-draft",
                "--since-tag",
                "v0.1.0",
                "--output",
                "/tmp/ai.md",
                "--save-json",
                "/tmp/ai.json",
                "--ai-profile",
                "openai-balanced",
                "--model",
                "gpt-5.4-mini",
                "--provider",
                "openai-compatible",
                "--base-url",
                "http://localhost:8888/v1",
                "--use-triage",
                "--save-triage-json",
                "/tmp/triage.json",
                "--polish",
                "--save-polish-json",
                "/tmp/polish.json",
            ]
        )
        self.assertEqual(parsed_ai.command, "changelog")
        self.assertEqual(parsed_ai.changelog_command, "ai-draft")
        self.assertEqual(parsed_ai.since_tag, "v0.1.0")
        self.assertEqual(parsed_ai.output, "/tmp/ai.md")
        self.assertEqual(parsed_ai.save_json, "/tmp/ai.json")
        self.assertEqual(parsed_ai.ai_profile, "openai-balanced")
        self.assertEqual(parsed_ai.model, "gpt-5.4-mini")
        self.assertEqual(parsed_ai.provider, "openai-compatible")
        self.assertEqual(parsed_ai.base_url, "http://localhost:8888/v1")
        self.assertTrue(parsed_ai.use_triage)
        self.assertEqual(parsed_ai.save_triage_json, "/tmp/triage.json")
        self.assertTrue(parsed_ai.polish)
        self.assertEqual(parsed_ai.save_polish_json, "/tmp/polish.json")

        parsed_ai_compare = parser.parse_args(
            [
                "changelog",
                "ai-compare",
                "--since-tag",
                "v0.1.0",
                "--ai-profiles",
                "openai-cheap,openai-balanced,openai-premium",
                "--output-name",
                "0.34.0-openai-comparison.md",
            ]
        )
        self.assertEqual(parsed_ai_compare.command, "changelog")
        self.assertEqual(parsed_ai_compare.changelog_command, "ai-compare")
        self.assertEqual(parsed_ai_compare.since_tag, "v0.1.0")
        self.assertEqual(
            parsed_ai_compare.ai_profiles,
            "openai-cheap,openai-balanced,openai-premium",
        )
        self.assertEqual(parsed_ai_compare.output_name, "0.34.0-openai-comparison.md")


class CliChangelogPayloadTests(unittest.TestCase):
    @staticmethod
    def _args(
        *,
        repo_root: str = ".",
        since_tag: str | None = None,
        output: str | None = None,
    ) -> argparse.Namespace:
        return argparse.Namespace(
            repo_root=repo_root,
            since_tag=since_tag,
            output=output,
        )

    def test_payload_facade_behaviors(self) -> None:
        cases = (
            {
                "name": "stdout",
                "since_tag": "v0.1.0",
                "output_name": None,
            },
            {
                "name": "file_output",
                "since_tag": None,
                "output_name": "payload.json",
            },
        )

        for case in cases:
            with self.subTest(case=case["name"]):
                with TemporaryDirectory() as temp_dir:
                    target = Path(temp_dir) / case["output_name"] if case["output_name"] else None
                    args = self._args(
                        since_tag=case["since_tag"],
                        output=str(target) if target else None,
                    )
                    with CliHarness(self) as h:
                        build_context = h.mock_build_changelog_context(object(), module="basic")
                        build_payload = h.mock_build_ai_payload({"schema_version": "x"}, module="basic")
                        render_payload = h.mock_render_ai_payload_json('{"schema_version":"x"}\n')
                        result = cmd_changelog_payload(args)

                    self.assertEqual(result, 0)
                    self.assertEqual(build_context.call_args.args[1], case["since_tag"])
                    build_payload.assert_called_once()
                    render_payload.assert_called_once()
                    if target is None:
                        self.assertEqual(h.stdout(), '{"schema_version":"x"}\n')
                    else:
                        self.assertTrue(target.is_file())
                        self.assertEqual(target.read_text(encoding="utf-8"), '{"schema_version":"x"}\n')
                        self.assertIn("Wrote changelog payload to", h.stdout())


class CliChangelogReleaseTests(unittest.TestCase):
    @staticmethod
    def _args(
        *,
        repo_root: str = ".",
        since_tag: str | None = None,
        output: str = ".changelog_scratch/changelog.release.md",
        raw_output: str = ".changelog_scratch/changelog.raw.md",
        payload_output: str = ".changelog_scratch/changelog.payload.json",
        semantic_payload_output: str = ".changelog_scratch/changelog.semantic_payload.json",
        context_output: str = ".changelog_scratch/changelog.context.json",
        release_notes_output: str = ".changelog_scratch/release_notes.md",
        selection_output: str | None = None,
        manual_changelog_path: str = "debian/changelog",
        cached_draft_path: str = ".changelog_scratch/changelog.draft.md",
        debian_distribution: str | None = None,
        debian_urgency: str | None = None,
    ) -> argparse.Namespace:
        return argparse.Namespace(
            repo_root=repo_root,
            since_tag=since_tag,
            output=output,
            raw_output=raw_output,
            payload_output=payload_output,
            semantic_payload_output=semantic_payload_output,
            context_output=context_output,
            release_notes_output=release_notes_output,
            selection_output=selection_output,
            manual_changelog_path=manual_changelog_path,
            cached_draft_path=cached_draft_path,
            debian_distribution=debian_distribution,
            debian_urgency=debian_urgency,
        )

    def test_release_command_writes_evidence_and_selected_artifacts(self) -> None:
        with TemporaryDirectory() as temp_dir:
            target = Path(temp_dir) / "release.md"
            raw_target = Path(temp_dir) / "raw.md"
            payload_target = Path(temp_dir) / "payload.json"
            semantic_payload_target = Path(temp_dir) / "semantic-payload.json"
            context_target = Path(temp_dir) / "context.json"
            release_notes_target = Path(temp_dir) / "release-notes.md"
            selection_target = Path(temp_dir) / "selection.json"
            args = self._args(
                output=str(target),
                raw_output=str(raw_target),
                payload_output=str(payload_target),
                semantic_payload_output=str(semantic_payload_target),
                context_output=str(context_target),
                release_notes_output=str(release_notes_target),
                selection_output=str(selection_target),
            )
            with CliHarness(self) as h:
                h.mock_build_changelog_context(object(), module="run")
                h.mock_render_release_changelog("# Raw Draft\n", module="run")
                h.mock_build_ai_payload({"schema_version": "x"}, module="run")
                h.mock_render_ai_payload_json('{"schema_version":"x"}\n', module="run")
                h.mock_build_semantic_ai_payload({"schema_version": "semantic-x"}, module="run")
                h.mock_render_semantic_ai_payload_json('{"schema_version":"semantic-x"}\n')
                h.mock_parse_release_ai_settings(
                    type(
                        "_ReleaseSettings",
                        (),
                        {
                            "mode": "auto",
                            "openai_profile": "openai-balanced",
                            "openai_api_key_present": True,
                            "local_enabled": False,
                            "local_profile": None,
                            "local_base_url_override": None,
                            "local_api_key": None,
                        },
                    )(),
                )
                h.mock_resolve_release_changelog(
                    type(
                        "_Selection",
                        (),
                        {
                            "path": "openai",
                            "content": "# Final Changelog\n",
                            "release_notes_content": "# Public Notes\n",
                            "source_path": None,
                            "local_base_url_overrode_profile": False,
                        },
                    )(),
                )
                refresh = h.mock_refresh_debian_changelog_entry(
                    type(
                        "_DebianUpdate",
                        (),
                        {
                            "path": Path(temp_dir) / "debian" / "changelog",
                            "package": "pmdocs",
                            "full_version": "1.2.3-1",
                            "distribution": "unstable",
                            "urgency": "medium",
                            "maintainer": "Test User <test@example.com>",
                            "timestamp": "Tue, 21 Apr 2026 20:00:00 +0000",
                        },
                    )(),
                )
                rc = cmd_changelog_release(args)

            self.assertEqual(rc, 0)
            self.assertEqual(target.read_text(encoding="utf-8"), "# Final Changelog\n")
            self.assertEqual(raw_target.read_text(encoding="utf-8"), "# Raw Draft\n")
            self.assertEqual(payload_target.read_text(encoding="utf-8"), '{"schema_version":"x"}\n')
            self.assertEqual(
                semantic_payload_target.read_text(encoding="utf-8"),
                '{"schema_version":"semantic-x"}\n',
            )
            context_metadata = json.loads(context_target.read_text(encoding="utf-8"))
            self.assertEqual(context_metadata["schema_version"], "payload_markdown_docs.release.changelog_context.v1")
            self.assertEqual(release_notes_target.read_text(encoding="utf-8"), "# Public Notes\n")
            metadata = json.loads(selection_target.read_text(encoding="utf-8"))
            self.assertEqual(metadata["schema_version"], "payload_markdown_docs.release.changelog_selection.v2")
            self.assertEqual(metadata["selected_path"], "openai")
            self.assertIn("context", metadata)
            self.assertTrue(metadata["release_notes_generated"])
            refresh.assert_called_once()
            rendered = h.stdout()
            self.assertIn("Wrote changelog raw evidence to", rendered)
            self.assertIn("Wrote changelog payload evidence to", rendered)
            self.assertIn("Wrote changelog semantic payload evidence to", rendered)
            self.assertIn("Wrote changelog context metadata to", rendered)
            self.assertIn("Wrote release changelog to", rendered)
            self.assertIn("Wrote release notes artifact to", rendered)
            self.assertIn("Wrote changelog selection metadata to", rendered)

    def test_release_command_refreshes_debian_changelog_for_generated_selection(self) -> None:
        with TemporaryDirectory() as temp_dir:
            target = Path(temp_dir) / "release.md"
            raw_target = Path(temp_dir) / "raw.md"
            payload_target = Path(temp_dir) / "payload.json"
            semantic_payload_target = Path(temp_dir) / "semantic-payload.json"
            context_target = Path(temp_dir) / "context.json"
            args = self._args(
                output=str(target),
                raw_output=str(raw_target),
                payload_output=str(payload_target),
                semantic_payload_output=str(semantic_payload_target),
                context_output=str(context_target),
                debian_distribution="stable",
                debian_urgency="high",
            )
            with CliHarness(self) as h:
                h.mock_build_changelog_context(object(), module="run")
                h.mock_render_release_changelog("# Raw Draft\n", module="run")
                h.mock_build_ai_payload({"schema_version": "x"}, module="run")
                h.mock_render_ai_payload_json('{"schema_version":"x"}\n', module="run")
                h.mock_build_semantic_ai_payload({"schema_version": "semantic-x"}, module="run")
                h.mock_render_semantic_ai_payload_json('{"schema_version":"semantic-x"}\n')
                h.mock_parse_release_ai_settings(
                    type(
                        "_ReleaseSettings",
                        (),
                        {
                            "mode": "auto",
                            "openai_profile": "openai-balanced",
                            "openai_api_key_present": True,
                            "local_enabled": False,
                            "local_profile": None,
                            "local_base_url_override": None,
                            "local_api_key": None,
                        },
                    )(),
                )
                h.mock_resolve_release_changelog(
                    type(
                        "_Selection",
                        (),
                        {"path": "openai", "content": "# Release\n- change one\n", "local_base_url_overrode_profile": False},
                    )(),
                )
                refresh_entry = h.mock_refresh_debian_changelog_entry(
                    type(
                        "_DebianUpdate",
                        (),
                        {
                            "path": Path(temp_dir) / "debian" / "changelog",
                            "package": "pmdocs",
                            "full_version": "1.2.3-1",
                            "distribution": "stable",
                            "urgency": "high",
                            "maintainer": "Test User <test@example.com>",
                            "timestamp": "Tue, 21 Apr 2026 20:00:00 +0000",
                        },
                    )(),
                )
                rc = cmd_changelog_release(args)

            self.assertEqual(rc, 0)
            self.assertEqual(
                semantic_payload_target.read_text(encoding="utf-8"),
                '{"schema_version":"semantic-x"}\n',
            )
            refresh_entry.assert_called_once()
            self.assertEqual(refresh_entry.call_args.kwargs["release_markdown"], "# Release\n- change one\n")
            self.assertEqual(refresh_entry.call_args.kwargs["distribution"], "stable")
            self.assertEqual(refresh_entry.call_args.kwargs["urgency"], "high")


class CliChangelogAIReleaseTests(unittest.TestCase):
    @staticmethod
    def _args() -> argparse.Namespace:
        return argparse.Namespace(
            repo_root=".",
            since_tag=None,
            draft_output=".changelog_scratch/changelog.draft.md",
            output=".changelog_scratch/changelog.release.md",
            raw_output=".changelog_scratch/changelog.raw.md",
            payload_output=".changelog_scratch/changelog.payload.json",
            semantic_payload_output=".changelog_scratch/changelog.semantic_payload.json",
            context_output=".changelog_scratch/changelog.context.json",
            manual_changelog_path="debian/changelog",
            debian_distribution=None,
            debian_urgency=None,
            save_json=None,
            ai_profile="openai-balanced",
            model=None,
            provider="openai",
            base_url=None,
            use_triage=False,
            save_triage_json=None,
            polish=False,
            save_polish_json=None,
            release_notes_output=".changelog_scratch/release_notes.md",
        )

    def test_ai_release_runs_ai_draft_then_forced_cached_release(self) -> None:
        args = self._args()
        observed_modes: list[str | None] = []

        with CliHarness(self) as h, patch.dict("os.environ", {"RELEASE_AI_MODE": "auto"}, clear=False):
            run_ai_draft = h.mock_changelog_ai_draft(0)
            run_release = h.mock_changelog_release(
                side_effect=lambda _release_args: observed_modes.append(os.environ.get("RELEASE_AI_MODE")) or 0,
            )
            rc = cmd_changelog_ai_release(args)
            self.assertEqual(os.environ.get("RELEASE_AI_MODE"), "auto")

        self.assertEqual(rc, 0)
        run_ai_draft.assert_called_once()
        run_release.assert_called_once()
        self.assertEqual(observed_modes, ["disabled"])
        expected_cached_path = str((Path(".").resolve() / ".changelog_scratch/changelog.draft.md").resolve())
        self.assertEqual(run_ai_draft.call_args.args[0].output, expected_cached_path)
        self.assertEqual(run_release.call_args.args[0].cached_draft_path, expected_cached_path)
        self.assertEqual(
            run_release.call_args.args[0].semantic_payload_output,
            ".changelog_scratch/changelog.semantic_payload.json",
        )

    def test_ai_release_skips_release_stage_when_draft_returns_nonzero(self) -> None:
        args = self._args()
        with CliHarness(self) as h:
            run_ai_draft = h.mock_changelog_ai_draft(2)
            run_release = h.mock_changelog_release(0)
            rc = cmd_changelog_ai_release(args)

        self.assertEqual(rc, 2)
        run_ai_draft.assert_called_once()
        run_release.assert_not_called()


class CliChangelogAICheckTests(unittest.TestCase):
    @staticmethod
    def _args(
        *,
        ai_profile: str | None = None,
        provider: str = "openai-compatible",
        model: str = "Qwen3.5-122B",
        base_url: str | None = "http://localhost:8888/v1",
        repo_root: str = ".",
    ) -> argparse.Namespace:
        return argparse.Namespace(
            ai_profile=ai_profile,
            provider=provider,
            model=model,
            base_url=base_url,
            repo_root=repo_root,
        )

    def test_ai_check_command_and_main_contracts(self) -> None:
        success_result = ProviderPreflightResult(
            provider_kind="openai-compatible",
            model="Qwen3.5-122B",
            base_url="http://localhost:8888/v1",
            discovered_models=("Qwen3.5-122B", "Gemma-4-31B"),
            model_found=True,
        )

        with self.subTest("direct_command_success_summary"):
            args = self._args()
            with CliHarness(self) as h:
                build_config = h.mock_ai_provider_config_from_args(object())
                build_provider = h.mock_ai_provider_from_config(object())
                run_preflight = h.mock_run_provider_preflight(success_result)
                rc = cmd_changelog_ai_check(args)

            self.assertEqual(rc, 0)
            build_config.assert_called_once_with(args)
            build_provider.assert_called_once()
            run_preflight.assert_called_once()
            self.assertIn("AI provider check", h.stdout())
            self.assertIn("openai-compatible", h.stdout())
            self.assertIn("Qwen3.5-122B", h.stdout())
            self.assertIn("Gemma-4-31B", h.stdout())

        with self.subTest("cli_main_preflight_error"):
            with CliHarness(self) as h:
                h.patch_stderr()
                h.mock_ai_provider_from_config(object())
                h.mock_run_provider_preflight(
                    side_effect=ValueError("Could not reach OpenAI-compatible endpoint"),
                )
                rc = cli.main(
                    [
                        "changelog",
                        "ai-check",
                        "--provider",
                        "openai-compatible",
                        "--base-url",
                        "http://localhost:8888/v1",
                        "--model",
                        "Qwen3.5-122B",
                    ]
                )

            self.assertEqual(rc, 1)
            h.assert_stderr_contains("ERROR: Could not reach OpenAI-compatible endpoint")


class CliChangelogAIDraftTests(unittest.TestCase):
    @staticmethod
    def _args(
        *,
        repo_root: str = ".",
        since_tag: str | None = None,
        output: str | None = None,
        save_json: str | None = None,
        model: str | None = DEFAULT_AI_DRAFT_MODEL,
        provider: str | None = "openai",
        base_url: str | None = None,
        ai_profile: str | None = None,
        use_triage: bool = False,
        save_triage_json: str | None = None,
        polish: bool = False,
        save_polish_json: str | None = None,
        release_notes_output: str = ".changelog_scratch/release_notes.md",
    ) -> argparse.Namespace:
        return argparse.Namespace(
            repo_root=repo_root,
            since_tag=since_tag,
            output=output,
            save_json=save_json,
            model=model,
            provider=provider,
            base_url=base_url,
            ai_profile=ai_profile,
            use_triage=use_triage,
            save_triage_json=save_triage_json,
            polish=polish,
            save_polish_json=save_polish_json,
            release_notes_output=release_notes_output,
        )

    def test_ai_draft_output_and_json_files(self) -> None:
        with TemporaryDirectory() as temp_dir:
            markdown_target = Path(temp_dir) / "ai-draft.md"
            json_target = Path(temp_dir) / "ai-draft.json"

            args = self._args(
                output=str(markdown_target),
                save_json=str(json_target),
                model="gpt-x-mini",
                use_triage=True,
            )

            triage_obj = object()

            with AIDraftHarness(self) as h:
                h.mock_triage_result(triage_obj)
                h.mock_draft_json('{"title":"x"}\n')

                result = cmd_changelog_ai_draft(args)

            self.assertEqual(result, 0)

            h.assert_file_contains(markdown_target, "<!-- payload-markdown-docs-release-version:")
            h.assert_file_contains(markdown_target, "# AI Draft")
            h.assert_file_equals(json_target, '{"title":"x"}\n')

            h.assert_triage_ran({"schema_version": "semantic-x"})
            h.assert_provider_stages(args, Path("."), "draft", "triage")
            h.mocks.build_triage_ir_payload.assert_called_once_with(triage_obj)

            h.assert_draft_generated(
                {"schema_version": "triage-x"},
                source_kind="triage",
            )

            h.assert_stdout_contains("Wrote AI changelog draft to")
            h.assert_stdout_contains("Wrote AI draft JSON to")
            h.assert_no_polish()

    def test_ai_draft_emergency_triage_routes_triage_to_synthesized_mode_and_writes_artifact(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            semantic_payload = {
                "schema_version": "payload_markdown_docs.release.semantic_payload.v1",
                "version": "1.2.3",
                "categories": [{"name": "tools"}],
            }
            synthesized_payload = {
                "schema_version": "payload_markdown_docs.release.triage_input.synthesized.v1",
                "categories": [],
            }
            emergency_json = (
                '{"schema_version":"payload_markdown_docs.release.ai_emergency_triage.v1",'
                '"version":"1.2.3","items":[]}\n'
            )
            emergency_obj = SimpleNamespace(items=(SimpleNamespace(id="tools:1"),))

            (repo_root / "VERSION").write_text("1.2.3\n", encoding="utf-8")
            (repo_root / "ai.yml").write_text(
                build_openai_profile(
                    emergency_triage="gpt-5-nano",
                    triage="gpt-5-nano",
                    draft="gpt-5-mini",
                ),
                encoding="utf-8",
            )

            args = self._args(
                repo_root=str(repo_root),
                ai_profile="openai-balanced",
                provider=None,
                model=None,
                use_triage=False,
            )

            with AIDraftHarness(self) as h:
                h.mock_semantic_payload(semantic_payload)
                h.mock_emergency_triage(emergency_obj, emergency_json)
                h.mock_synthesized_triage_input(synthesized_payload)

                result = cmd_changelog_ai_draft(args)

            self.assertEqual(result, 0)

            h.assert_emergency_triage_ran(semantic_payload)
            h.mocks.build_triage_input_from_emergency_result.assert_called_once_with(
                semantic_payload,
                emergency_obj,
            )
            h.assert_triage_ran(
                synthesized_payload,
                input_mode="synthesized_semantic",
            )

            emergency_artifact = repo_root / ".changelog_scratch" / "emergency_triage.json"
            h.assert_file_contains(
                emergency_artifact,
                "payload_markdown_docs.release.ai_emergency_triage.v1",
            )

    def test_ai_draft_release_notes_uses_draft_input_even_when_polish_enabled(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            output_target = repo_root / ".changelog_scratch" / "changelog.release.md"
            notes_target = repo_root / ".changelog_scratch" / "release_notes.md"
            draft_obj = object()
            polish_obj = object()

            (repo_root / "VERSION").write_text("1.2.3\n", encoding="utf-8")
            (repo_root / "ai.yml").write_text(
                build_openai_profile(
                    draft="gpt-5-mini",
                    polish="gpt-5.4",
                    release_notes="gpt-5.4",
                ),
                encoding="utf-8",
            )

            args = self._args(
                repo_root=str(repo_root),
                ai_profile="openai-balanced",
                provider=None,
                model=None,
                output=str(output_target),
                release_notes_output=str(notes_target),
            )

            with AIDraftHarness(self) as h:
                h.mock_draft_result(draft_obj)
                h.mock_draft_markdown("# Draft Output\n- d\n")
                h.mock_polish_result(polish_obj)
                h.mock_polish_markdown("# Polished Output\n- p\n")
                h.mock_release_notes_result("# Public Notes\n- from draft\n")

                result = cmd_changelog_ai_draft(args)

            self.assertEqual(result, 0)

            h.assert_polish_ran(draft_obj)
            h.assert_release_notes_ran("# Draft Output\n- d\n")
            h.assert_file_contains(output_target, "# Polished Output")
            h.assert_file_equals(notes_target, "# Public Notes\n- from draft\n")

    def test_main_formats_stage_failures_cleanly(self) -> None:
        cases = (
            {
                "name": "triage_invalid_categories",
                "argv": ["changelog", "ai-draft", "--use-triage"],
                "patcher": lambda h: (
                    h.mock_build_semantic_ai_payload({"schema_version": "semantic-x", "categories": [{}]}),
                    h.mock_run_triage_stage(
                        side_effect=ValueError("AI triage response must include non-empty `categories` list."),
                    ),
                ),
                "stderr_fragments": ("ERROR: Triage stage failed:", "categories"),
            },
            {
                "name": "triage_missing_schema_version",
                "argv": ["changelog", "ai-draft", "--use-triage"],
                "patcher": lambda h: (
                    h.mock_build_semantic_ai_payload({"schema_version": "semantic-x", "categories": [{}]}),
                    h.mock_run_triage_stage(
                        side_effect=ValueError("`schema_version` must be a non-empty string."),
                    ),
                ),
                "stderr_fragments": ("ERROR: Triage stage failed: missing required field `schema_version`.",),
            },
            {
                "name": "polish_invalid_sections",
                "argv": ["changelog", "ai-draft", "--polish"],
                "patcher": lambda h: h.mock_run_polish_stage(
                    side_effect=ValueError("AI polish response must include non-empty `sections` list."),
                ),
                "stderr_fragments": ("ERROR: Polish stage failed:", "sections"),
            },
            {
                "name": "draft_missing_title",
                "argv": ["changelog", "ai-draft"],
                "patcher": lambda h: h.mock_generate_draft_from_payload(
                    side_effect=ValueError("`title` must be a non-empty string."),
                ),
                "stderr_fragments": ("ERROR: Draft stage failed: missing required field `title`.",),
            },
        )

        for case in cases:
            with self.subTest(case=case["name"]):
                with AIDraftHarness(self) as h:
                    h.patch_stderr()
                    case["patcher"](h)
                    rc = cli.main(case["argv"])

                self.assertEqual(rc, 1)
                for fragment in case["stderr_fragments"]:
                    h.assert_stderr_contains(fragment)

    def test_main_validates_save_json_flags(self) -> None:
        cases = (
            {
                "name": "triage_json_without_triage",
                "argv": ["changelog", "ai-draft", "--save-triage-json", "/tmp/triage.json"],
                "stderr_fragment": "ERROR: --save-triage-json requires triage stage to run.",
            },
            {
                "name": "polish_json_without_polish",
                "argv": ["changelog", "ai-draft", "--save-polish-json", "/tmp/polish.json"],
                "stderr_fragment": "ERROR: --save-polish-json requires polish stage to run.",
            },
        )

        for case in cases:
            with self.subTest(case=case["name"]):
                with CliHarness(self) as h:
                    h.patch_stderr()
                    rc = cli.main(case["argv"])

                self.assertEqual(rc, 1)
                h.assert_stderr_contains(case["stderr_fragment"])

    def test_main_reports_missing_api_key_error_cleanly(self) -> None:
        with AIDraftHarness(self) as h:
            h.patch_stderr()
            h.mock_ai_provider_from_args(
                object(),
                side_effect=ValueError("OPENAI_API_KEY is not set."),
            )

            rc = cli.main(["changelog", "ai-draft"])

        self.assertEqual(rc, 1)
        h.assert_stderr_contains("ERROR: OPENAI_API_KEY is not set.")

    def test_main_openai_rejects_base_url_flag(self) -> None:
        with CliHarness(self) as h:
            h.mock_build_changelog_context(object())
            h.mock_build_ai_payload({"schema_version": "x"})
            h.patch_stderr()

            rc = cli.main(
                [
                    "changelog",
                    "ai-draft",
                    "--provider",
                    "openai",
                    "--base-url",
                    "http://localhost:8888/v1",
                ]
            )

        self.assertEqual(rc, 1)
        h.assert_stderr_contains("ERROR: `--base-url` is only valid when `--provider openai-compatible` is used.")

    def test_main_openai_compatible_allows_no_auth_provider_build(self) -> None:
        with AIDraftHarness(self) as h:
            h.patch_stderr()
            h.mock_draft_markdown("# Draft\n")

            rc = cli.main(
                [
                    "changelog",
                    "ai-draft",
                    "--provider",
                    "openai-compatible",
                    "--base-url",
                    "http://localhost:8888/v1",
                    "--model",
                    "Qwen3.5-122B",
                ]
            )

        self.assertEqual(rc, 0)
        self.assertEqual(h.stderr(), "")
        self.assertEqual(h.stdout(), "# Draft\n")

    def test_ai_draft_openai_compatible_runs_preflight(self) -> None:
        args = self._args(
            provider="openai-compatible",
            base_url="http://localhost:8888/v1",
            model="Qwen3.5-122B",
        )

        with AIDraftHarness(self) as h:
            h.mock_draft_markdown("# Draft\n")

            rc = cmd_changelog_ai_draft(args)

        self.assertEqual(rc, 0)

        h.mocks.run_provider_preflight.assert_called_once()
        preflight_call = h.mocks.run_provider_preflight.call_args

        self.assertEqual(preflight_call.kwargs["provider"], h.provider)
        self.assertTrue(preflight_call.kwargs["require_model"])
        self.assertEqual(preflight_call.args[0].kind, "openai-compatible")
        self.assertEqual(preflight_call.args[0].base_url, "http://localhost:8888/v1")
        self.assertEqual(preflight_call.args[0].model, "Qwen3.5-122B")


class CliChangelogAICompareTests(unittest.TestCase):
    @staticmethod
    def _write_repo_basics(repo_root: Path) -> str:
        original_debian = (
            "pmdocs (0.34.0-1) unstable; urgency=medium\n\n"
            "  - existing line\n\n"
            " -- Test User <test@example.com>  Sun, 19 Apr 2026 00:00:00 +0000\n"
        )
        (repo_root / "VERSION").write_text("0.34.0\n", encoding="utf-8")
        debian_path = repo_root / "debian" / "changelog"
        debian_path.parent.mkdir(parents=True, exist_ok=True)
        debian_path.write_text(original_debian, encoding="utf-8")
        return original_debian

    def test_ai_compare_writes_combined_markdown_artifact(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            original_debian = self._write_repo_basics(repo_root)
            args = argparse.Namespace(
                repo_root=str(repo_root),
                since_tag=None,
                ai_profiles="openai-cheap,openai-balanced",
                output_name="0.34.0-openai-comparison.md",
            )

            def _fake_draft(draft_args: argparse.Namespace) -> int:
                cached = render_cached_draft_markdown(
                    version="0.34.0",
                    content=f"# {draft_args.ai_profile}\n- {draft_args.ai_profile} summary",
                )
                Path(draft_args.output).write_text(cached, encoding="utf-8")
                return 0

            def _fake_pipeline(_draft_args: argparse.Namespace, *, repo_root: Path | None = None):
                return SimpleNamespace(
                    provider="openai",
                    base_url=None,
                    profile_slug=None,
                    enabled_stages=("triage", "draft", "polish"),
                    stages={
                        "emergency_triage": SimpleNamespace(
                            model="gpt-5-nano",
                            reasoning_effort="low",
                            structured_mode="strict_json_schema",
                            max_output_tokens=SimpleNamespace(mode="dynamic_ratio", ratio=0.55, min=1200, max=12000),
                        ),
                        "triage": SimpleNamespace(
                            model="gpt-5-nano",
                            reasoning_effort="low",
                            structured_mode=None,
                            max_output_tokens=300,
                        ),
                        "draft": SimpleNamespace(
                            model="gpt-5-mini",
                            reasoning_effort="medium",
                            structured_mode="strict_json_schema",
                            max_output_tokens=SimpleNamespace(mode="dynamic_ratio", ratio=0.35, min=800, max=4000),
                        ),
                        "polish": SimpleNamespace(
                            model="gpt-5.4",
                            reasoning_effort="medium",
                            structured_mode=None,
                            max_output_tokens=800,
                        ),
                        "release_notes": SimpleNamespace(
                            model="gpt-5.4",
                            reasoning_effort="high",
                            structured_mode=None,
                            max_output_tokens=1200,
                        ),
                    },
                    is_stage_enabled=lambda stage: stage in {"triage", "draft", "polish"},
                )

            def _fake_refresh(**kwargs):
                changelog_path = Path(kwargs["changelog_path"])
                heading = kwargs["release_markdown"].splitlines()[0].strip()
                changelog_path.write_text(f"effective debian from {heading}\n", encoding="utf-8")
                return SimpleNamespace(path=changelog_path)

            with CliHarness(self) as h:
                run_draft = h.mock_changelog_ai_draft(side_effect=_fake_draft, module="compare")
                h.mock_build_ai_pipeline_config_from_args(module="compare", side_effect=_fake_pipeline)
                refresh_entry = h.mock_refresh_debian_changelog_entry(side_effect=_fake_refresh, module="compare")
                rc = cmd_changelog_ai_compare(args)

            self.assertEqual(rc, 0)
            artifact = (
                repo_root / ".changelog_scratch" / "comparisons" / "0.34.0-openai-comparison.md"
            )
            self.assertTrue(artifact.is_file())
            rendered = artifact.read_text(encoding="utf-8")
            self.assertIn("# AI Changelog Comparison — 0.34.0", rendered)
            self.assertIn("## Profile: openai-cheap", rendered)
            self.assertIn("## Profile: openai-balanced", rendered)
            self.assertIn("### changelog.release.md", rendered)
            self.assertIn("### Effective profile config", rendered)
            self.assertIn("```yaml", rendered)
            self.assertIn("# openai-cheap", rendered)
            self.assertIn("# openai-balanced", rendered)
            self.assertIn("### debian/changelog", rendered)
            self.assertIn("### release_notes.md", rendered)
            self.assertIn("_not generated_", rendered)
            self.assertIn("effective debian from # openai-cheap", rendered)
            self.assertIn("effective debian from # openai-balanced", rendered)
            self.assertIn("provider: openai", rendered)
            self.assertIn("profile_slug: <none>", rendered)
            self.assertIn("enabled_stages:", rendered)
            self.assertIn("default_max_output_tokens:", rendered)
            self.assertIn("mode: dynamic_ratio", rendered)
            self.assertIn("ratio: 0.35", rendered)
            self.assertIn("stages:", rendered)
            self.assertIn("reasoning_effort: medium", rendered)
            self.assertIn("structured_mode: strict_json_schema", rendered)
            self.assertEqual(run_draft.call_count, 2)
            self.assertEqual(refresh_entry.call_count, 2)
            for call_ in refresh_entry.call_args_list:
                self.assertNotEqual(
                    Path(call_.kwargs["changelog_path"]).resolve(),
                    (repo_root / "debian" / "changelog").resolve(),
                )
            self.assertEqual((repo_root / "debian" / "changelog").read_text(encoding="utf-8"), original_debian)

    def test_ai_compare_rejects_invalid_output_name(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            (repo_root / "VERSION").write_text("0.34.0\n", encoding="utf-8")
            args = argparse.Namespace(
                repo_root=str(repo_root),
                since_tag=None,
                ai_profiles="openai-cheap",
                output_name="../bad.md",
            )
            with self.assertRaisesRegex(ValueError, "--output-name must be a file name"):
                _ = cmd_changelog_ai_compare(args)


if __name__ == "__main__":
    unittest.main()
