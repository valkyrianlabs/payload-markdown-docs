from tools.release.tests.helpers.cli_harness import CliHarness


class ChangelogCliHarness(CliHarness):
    def mock_build_ai_payload(self, payload):
        return super().mock_build_ai_payload(payload)

    def mock_semantic_payload(self, payload):
        return super().mock_build_semantic_ai_payload(payload)

    def mock_provider(self, provider):
        return super().mock_ai_provider_from_args(provider)

    def mock_draft(self, markdown="# AI Draft\n"):
        self.mock_generate_draft_from_payload(object())
        return self.mock_render_draft_markdown(markdown)

    def mock_emergency_triage(self, result, json_str):
        self.mock_run_emergency_triage_stage(result)
        return self.mock_render_emergency_triage_result_json(json_str)

    def mock_triage(self, result=object()):
        return self.mock_run_triage_stage(result)
