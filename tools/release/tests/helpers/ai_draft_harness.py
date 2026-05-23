from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import call

from tools.release.changelog.ai.config import AIDynamicRatioTokenBudget
from tools.release.tests.helpers.cli_harness import CliHarness
from tools.release.version.models import Version

class AIDraftHarness(CliHarness):
    default_payload = {"schema_version": "x"}
    default_semantic_payload = {"schema_version": "semantic-x"}
    default_triage_payload = {"schema_version": "triage-x"}

    def __enter__(self):
        super().__enter__()

        self.context = object()
        self.draft = object()
        self.triage = object()
        self.polish = object()
        self.release_notes = None

        self.mock_build_changelog_context(self.context)

        self.mock_payload(self.default_payload)
        self.mock_semantic_payload(self.default_semantic_payload)
        self.mock_provider(self.provider)

        self.mock_draft_result(self.draft)
        self.mock_draft_markdown("# AI Draft\n")
        self.mock_draft_json('{"ok":true}\n')

        self.mock_triage_result(self.triage)
        self.mock_triage_json('{"schema_version":"triage"}\n')
        self.mock_triage_ir_payload(self.default_triage_payload)

        self.mock_polish_result(self.polish)
        self.mock_polish_markdown("# AI Polished\n")
        self.mock_polish_json('{"schema_version":"polish"}\n')

        self.mock_emergency_triage_result()
        self.mock_emergency_triage_json('{"schema_version":"emergency_triage"}\n')
        self.mock_synthesized_triage_input(self.default_triage_payload)

        self.mock_release_notes_stage()
        self.patch_symbol(self.CHANGELOG_MODULES.run, "run_provider_preflight")
        self.patch_symbol(self.CHANGELOG_MODULES.draft, "read_version_file", return_value=Version(1, 2, 3))

        return self

    # -------------------------
    # Mock builders
    # -------------------------

    def mock_payload(self, payload: dict[str, Any]):
        return self.mock_build_ai_payload(payload)

    def mock_semantic_payload(self, payload: dict[str, Any]):
        return self.mock_build_semantic_ai_payload(payload)

    def mock_provider(self, provider: object):
        return self.mock_ai_provider_from_args(provider)

    def mock_draft_result(self, result: object):
        return self.mock_generate_draft_from_payload(result)

    def mock_draft_markdown(self, markdown: str):
        return self.mock_render_draft_markdown(markdown)

    def mock_draft_json(self, json: str):
        return self.mock_render_draft_result_json(json)

    def mock_triage_result(self, result: object):
        return self.mock_run_triage_stage(result)

    def mock_triage_json(self, json: str):
        return self.mock_render_triage_result_json(json)

    def mock_triage_ir_payload(self, payload: dict[str, Any]):
        return self.mock_build_triage_ir_payload(payload)

    def mock_emergency_triage(self, result: object, json: str):
        self.mock_emergency_triage_result(result)
        return self.mock_emergency_triage_json(json)

    def mock_synthesized_triage_input(self, payload: dict[str, Any]):
        return self.mock_build_triage_input_from_emergency_result(payload)

    def mock_emergency_triage_result(self, result: object = None):
        return self.mock_run_emergency_triage_stage(result)

    def mock_emergency_triage_json(self, json: str):
        return self.mock_render_emergency_triage_result_json(json)

    def mock_polish_result(self, result: object):
        return self.mock_run_polish_stage(result)

    def mock_polish_markdown(self, markdown: str):
        return self.mock_render_polish_markdown(markdown)

    def mock_polish_json(self, json: str):
        return self.mock_render_polish_result_json(json)

    def mock_release_notes_result(self, markdown: str):
        result = type("ReleaseNotesResult", (), {"markdown": markdown})()
        self.release_notes = result
        return self.mock_release_notes_stage(result)

    def mock_release_notes_stage(self, result: object = None):
        return self.mock_run_release_notes_stage(result)

    # -------------------------
    # Common policies
    # -------------------------

    @staticmethod
    def draft_budget():
        return AIDynamicRatioTokenBudget(mode="dynamic_ratio", ratio=0.35, min=800, max=4000)

    @staticmethod
    def emergency_budget():
        return AIDynamicRatioTokenBudget(mode="dynamic_ratio", ratio=0.55, min=1200, max=12000)

    # -------------------------
    # Assertions
    # -------------------------

    def assert_context_since_tag(self, since_tag: str):
        self.test.assertEqual(self.mocks.build_changelog_context.call_args.args[1], since_tag)

    def assert_provider_stages(self, args, repo_root: Path, *stages: str):
        expected = [
            call(args, repo_root=repo_root.resolve(), stage=stage)
            for stage in stages
        ]
        self.mocks.build_ai_provider_from_args.assert_has_calls(expected)

    def assert_only_provider_stages(self, args, repo_root: Path, *stages: str):
        self.assert_provider_stages(args, repo_root, *stages)
        self.test.assertEqual(
            self.mocks.build_ai_provider_from_args.call_args_list,
            [call(args, repo_root=repo_root.resolve(), stage=stage) for stage in stages],
        )

    def assert_draft_generated(
        self,
        payload: dict[str, Any],
        *,
        source_kind: str = "payload",
        provider_kind: str = "openai",
        reasoning_effort=None,
        structured_mode=None,
        temperature: float = 0.2,
    ):
        self.mocks.generate_draft_from_payload.assert_called_once_with(
            payload,
            provider=self.provider,
            source_kind=source_kind,
            provider_kind=provider_kind,
            reasoning_effort=reasoning_effort,
            structured_mode=structured_mode,
            temperature=temperature,
            max_output_tokens_policy=self.draft_budget(),
        )

    def assert_triage_ran(
        self,
        payload: dict[str, Any],
        *,
        input_mode: str = "raw_semantic",
        provider_kind: str = "openai",
        reasoning_effort=None,
        structured_mode=None,
        temperature: float = 0.0,
    ):
        self.mocks.run_triage_stage.assert_called_once_with(
            payload,
            provider=self.provider,
            provider_kind=provider_kind,
            reasoning_effort=reasoning_effort,
            structured_mode=structured_mode,
            temperature=temperature,
            max_output_tokens_policy=300,
            input_mode=input_mode,
        )

    def assert_emergency_triage_ran(
        self,
        payload: dict[str, Any],
        *,
        provider_kind: str = "openai",
        reasoning_effort=None,
        structured_mode=None,
        temperature: float = 0.0,
    ):
        self.mocks.run_emergency_triage_stage.assert_called_once_with(
            payload,
            provider=self.provider,
            provider_kind=provider_kind,
            reasoning_effort=reasoning_effort,
            structured_mode=structured_mode,
            temperature=temperature,
            max_output_tokens_policy=self.emergency_budget(),
            progress_logger=print,
        )

    def assert_polish_ran(
        self,
        draft_obj: object,
        *,
        provider_kind: str = "openai",
        reasoning_effort=None,
        structured_mode=None,
        temperature: float = 0.0,
    ):
        self.mocks.run_polish_stage.assert_called_once_with(
            draft_obj,
            provider=self.provider,
            provider_kind=provider_kind,
            reasoning_effort=reasoning_effort,
            structured_mode=structured_mode,
            temperature=temperature,
            max_output_tokens_policy=800,
        )

    def assert_release_notes_ran(
        self,
        markdown: str,
        *,
        provider_kind: str = "openai",
        reasoning_effort=None,
        structured_mode=None,
        temperature: float = 0.0,
    ):
        self.mocks.run_release_notes_stage.assert_called_once_with(
            markdown,
            provider=self.provider,
            provider_kind=provider_kind,
            reasoning_effort=reasoning_effort,
            structured_mode=structured_mode,
            temperature=temperature,
            max_output_tokens_policy=1200,
        )

    def assert_stage_not_run(self, stage: str):
        getattr(self.mocks, stage).assert_not_called()

    def assert_no_triage(self):
        self.mocks.run_triage_stage.assert_not_called()
        self.mocks.render_triage_result_json.assert_not_called()

    def assert_no_polish(self):
        self.mocks.run_polish_stage.assert_not_called()
        self.mocks.render_polish_result_json.assert_not_called()
        self.mocks.render_polish_markdown.assert_not_called()
