# tools/release/tests/helpers/cli_harness.py

from __future__ import annotations

from contextlib import ExitStack, redirect_stdout
from dataclasses import dataclass
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import Mock, patch


@dataclass(frozen=True)
class DraftPolicy:
    ratio: float = 0.35
    min: int = 800
    max: int = 4000


class CliHarness:
    CHANGELOG_MODULES = SimpleNamespace(
        build="tools.release.cli_tools.commands.changelog.build",
        basic="tools.release.cli_tools.commands.changelog.basic",
        draft="tools.release.cli_tools.commands.changelog.draft",
        release="tools.release.cli_tools.commands.changelog.release",
        check="tools.release.cli_tools.commands.changelog.check",
        compare="tools.release.cli_tools.commands.changelog.compare",
        run="tools.release.cli_tools.changelog.run",
    )

    def __init__(self, test):
        self.test = test
        self.stack = ExitStack()
        self.out = StringIO()
        self.err = StringIO()
        self.mocks = SimpleNamespace()
        self.provider = object()

    def __enter__(self):
        self.stack.__enter__()
        self.stack.enter_context(redirect_stdout(self.out))
        return self

    def __exit__(self, *exc):
        return self.stack.__exit__(*exc)

    def patch(self, path: str, **kwargs) -> Mock:
        mock = self.stack.enter_context(patch(path, **kwargs))
        setattr(self.mocks, path.split(".")[-1], mock)
        return mock

    def patch_symbol(self, module_path: str, symbol: str, **kwargs) -> Mock:
        return self.patch(f"{module_path}.{symbol}", **kwargs)

    def mock_build_changelog_context(self, context: object, *, module: str = "draft") -> Mock:
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "build_changelog_context", return_value=context)

    def mock_build_release_context(self, context: object, *, module: str = "build") -> Mock:
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "build_release_context", return_value=context)

    def mock_build_ai_payload(self, payload: dict[str, Any], *, module: str = "draft") -> Mock:
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "build_ai_payload", return_value=payload)

    def mock_build_semantic_ai_payload(self, payload: dict[str, Any], *, module: str = "draft") -> Mock:
        return self.patch_symbol(
            getattr(self.CHANGELOG_MODULES, module),
            "build_semantic_ai_payload",
            return_value=payload,
        )

    def mock_ai_provider_from_args(self, provider: object, *, module: str = "draft", **kwargs) -> Mock:
        self.provider = provider
        if "return_value" not in kwargs and "side_effect" not in kwargs:
            kwargs["return_value"] = provider
        return self.patch_symbol(
            getattr(self.CHANGELOG_MODULES, module),
            "build_ai_provider_from_args",
            **kwargs,
        )

    def mock_ai_provider_from_config(self, provider: object, *, module: str = "check", **kwargs) -> Mock:
        self.provider = provider
        if "return_value" not in kwargs and "side_effect" not in kwargs:
            kwargs["return_value"] = provider
        return self.patch_symbol(
            getattr(self.CHANGELOG_MODULES, module),
            "build_ai_provider_from_config",
            **kwargs,
        )

    def mock_ai_provider_config_from_args(self, config: object, *, module: str = "check", **kwargs) -> Mock:
        if "return_value" not in kwargs and "side_effect" not in kwargs:
            kwargs["return_value"] = config
        return self.patch_symbol(
            getattr(self.CHANGELOG_MODULES, module),
            "build_ai_provider_config_from_args",
            **kwargs,
        )

    def mock_build_ai_pipeline_config_from_args(self, config: object = None, *, module: str = "draft", **kwargs) -> Mock:
        if "return_value" not in kwargs and "side_effect" not in kwargs:
            kwargs["return_value"] = config
        return self.patch_symbol(
            getattr(self.CHANGELOG_MODULES, module),
            "build_ai_pipeline_config_from_args",
            **kwargs,
        )

    def mock_read_version_file(self, version: object, *, module: str = "build") -> Mock:
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "read_version_file", return_value=version)

    def mock_render_release_changelog(self, markdown: str, *, module: str = "basic") -> Mock:
        return self.patch_symbol(
            getattr(self.CHANGELOG_MODULES, module),
            "render_release_changelog",
            return_value=markdown,
        )

    def mock_render_debug_json(self, payload_json: str, *, module: str = "basic") -> Mock:
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "render_debug_json", return_value=payload_json)

    def mock_render_ai_payload_json(self, payload_json: str, *, module: str = "basic") -> Mock:
        return self.patch_symbol(
            getattr(self.CHANGELOG_MODULES, module),
            "render_ai_payload_json",
            return_value=payload_json,
        )

    def mock_render_semantic_ai_payload_json(self, payload_json: str, *, module: str = "run") -> Mock:
        return self.patch_symbol(
            getattr(self.CHANGELOG_MODULES, module),
            "render_semantic_ai_payload_json",
            return_value=payload_json,
        )

    def mock_parse_release_ai_settings(self, settings: object, *, module: str = "basic") -> Mock:
        return self.patch_symbol(
            getattr(self.CHANGELOG_MODULES, module),
            "parse_release_ai_settings",
            return_value=settings,
        )

    def mock_resolve_release_changelog(self, selection: object, *, module: str = "run", **kwargs) -> Mock:
        if "return_value" not in kwargs and "side_effect" not in kwargs:
            kwargs["return_value"] = selection
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "resolve_release_changelog", **kwargs)

    def mock_refresh_debian_changelog_entry(self, result: object = None, *, module: str = "run", **kwargs) -> Mock:
        if "return_value" not in kwargs and "side_effect" not in kwargs:
            kwargs["return_value"] = result
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "refresh_debian_changelog_entry", **kwargs)

    def mock_run_changelog_release_with_settings(
        self,
        result: object = None,
        *,
        module: str = "basic",
        **kwargs,
    ) -> Mock:
        if "return_value" not in kwargs and "side_effect" not in kwargs:
            kwargs["return_value"] = result
        return self.patch_symbol(
            getattr(self.CHANGELOG_MODULES, module),
            "run_changelog_release_with_settings",
            **kwargs,
        )

    def mock_generate_draft_from_payload(self, result: object = None, *, module: str = "draft", **kwargs) -> Mock:
        if "return_value" not in kwargs and "side_effect" not in kwargs:
            kwargs["return_value"] = result
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "generate_draft_from_payload", **kwargs)

    def mock_render_draft_markdown(self, markdown: str, *, module: str = "draft") -> Mock:
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "render_draft_markdown", return_value=markdown)

    def mock_render_draft_result_json(self, payload_json: str, *, module: str = "draft") -> Mock:
        return self.patch_symbol(
            getattr(self.CHANGELOG_MODULES, module),
            "render_draft_result_json",
            return_value=payload_json,
        )

    def mock_run_triage_stage(self, result: object = None, *, module: str = "draft", **kwargs) -> Mock:
        if "return_value" not in kwargs and "side_effect" not in kwargs:
            kwargs["return_value"] = result
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "run_triage_stage", **kwargs)

    def mock_render_triage_result_json(self, payload_json: str, *, module: str = "draft") -> Mock:
        return self.patch_symbol(
            getattr(self.CHANGELOG_MODULES, module),
            "render_triage_result_json",
            return_value=payload_json,
        )

    def mock_build_triage_ir_payload(self, payload: dict[str, Any], *, module: str = "draft") -> Mock:
        return self.patch_symbol(
            getattr(self.CHANGELOG_MODULES, module),
            "build_triage_ir_payload",
            return_value=payload,
        )

    def mock_run_emergency_triage_stage(
        self,
        result: object = None,
        *,
        module: str = "draft",
        **kwargs,
    ) -> Mock:
        if "return_value" not in kwargs and "side_effect" not in kwargs:
            kwargs["return_value"] = result
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "run_emergency_triage_stage", **kwargs)

    def mock_render_emergency_triage_result_json(self, payload_json: str, *, module: str = "draft") -> Mock:
        return self.patch_symbol(
            getattr(self.CHANGELOG_MODULES, module),
            "render_emergency_triage_result_json",
            return_value=payload_json,
        )

    def mock_build_triage_input_from_emergency_result(
        self,
        payload: dict[str, Any],
        *,
        module: str = "draft",
    ) -> Mock:
        return self.patch_symbol(
            getattr(self.CHANGELOG_MODULES, module),
            "build_triage_input_from_emergency_result",
            return_value=payload,
        )

    def mock_run_polish_stage(self, result: object = None, *, module: str = "draft", **kwargs) -> Mock:
        if "return_value" not in kwargs and "side_effect" not in kwargs:
            kwargs["return_value"] = result
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "run_polish_stage", **kwargs)

    def mock_render_polish_markdown(self, markdown: str, *, module: str = "draft") -> Mock:
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "render_polish_markdown", return_value=markdown)

    def mock_render_polish_result_json(self, payload_json: str, *, module: str = "draft") -> Mock:
        return self.patch_symbol(
            getattr(self.CHANGELOG_MODULES, module),
            "render_polish_result_json",
            return_value=payload_json,
        )

    def mock_run_release_notes_stage(self, result: object = None, *, module: str = "draft", **kwargs) -> Mock:
        if "return_value" not in kwargs and "side_effect" not in kwargs:
            kwargs["return_value"] = result
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "run_release_notes_stage", **kwargs)

    def mock_run_provider_preflight(
        self,
        result: object = None,
        *,
        module: str = "check",
        **kwargs,
    ) -> Mock:
        if "return_value" not in kwargs and "side_effect" not in kwargs:
            kwargs["return_value"] = result
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "run_provider_preflight", **kwargs)

    def mock_changelog_ai_draft(self, result: object = None, *, module: str = "release", **kwargs) -> Mock:
        if "return_value" not in kwargs and "side_effect" not in kwargs:
            kwargs["return_value"] = result
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "cmd_changelog_ai_draft", **kwargs)

    def mock_changelog_release(self, result: object = None, *, module: str = "release", **kwargs) -> Mock:
        if "return_value" not in kwargs and "side_effect" not in kwargs:
            kwargs["return_value"] = result
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "cmd_changelog_release", **kwargs)

    def mock_run_stage_preflight(self, result: object = None, *, module: str = "draft", **kwargs) -> Mock:
        if "return_value" not in kwargs and "side_effect" not in kwargs:
            kwargs["return_value"] = result
        return self.patch_symbol(getattr(self.CHANGELOG_MODULES, module), "run_stage_preflight", **kwargs)

    def patch_stderr(self):
        return self.patch("sys.stderr", new=self.err)

    def stdout(self) -> str:
        return self.out.getvalue()

    def stderr(self) -> str:
        return self.err.getvalue()

    def assert_stdout_contains(self, text: str):
        self.test.assertIn(text, self.stdout())

    def assert_stderr_contains(self, text: str):
        self.test.assertIn(text, self.stderr())

    def assert_file_contains(self, path: Path, text: str):
        self.test.assertTrue(path.is_file(), f"Expected file to exist: {path}")
        self.test.assertIn(text, path.read_text(encoding="utf-8"))

    def assert_file_equals(self, path: Path, text: str):
        self.test.assertTrue(path.is_file(), f"Expected file to exist: {path}")
        self.test.assertEqual(path.read_text(encoding="utf-8"), text)
