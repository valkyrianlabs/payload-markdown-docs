from __future__ import annotations

import unittest

from tools.release.changelog.ai.prompts.draft import build_draft_user_prompt
from tools.release.changelog.ai.prompts.polish import build_polish_user_prompt
from tools.release.changelog.ai.prompts.release_notes import build_release_notes_user_prompt
from tools.release.changelog.ai.prompts.triage import build_triage_user_prompt
from tools.release.tests.changelog._support import (
    assert_contains_all,
    assert_not_contains_any,
    load_json_fixture,
)


class AISemanticDownstreamRegressionTests(unittest.TestCase):
    def test_triage_projection_uses_semantic_payload_fields(self) -> None:
        payload = load_json_fixture(__file__, "semantic_payload_realistic.json")
        user_prompt = build_triage_user_prompt(payload)
        lower = user_prompt.lower()

        assert_contains_all(
            self,
            lower,
            (
                "semantic payload (compact projection)",
                "summary_hint",
                "semantic_hunks",
                "candidate_commits",
                "all_commits",
                "kind",
                "why_selected",
                "grounded_claims",
            ),
        )
        assert_not_contains_any(self, lower, ("important_files", "retained_snippets"))

    def test_downstream_prompts_preserve_semantic_handoff_and_cleanup_rules(self) -> None:
        prompt_cases = (
            (
                "draft-triage-handoff",
                build_draft_user_prompt(
                    {
                        "schema_version": "vaulthalla.release.ai_triage.v2",
                        "version": "2.5.0",
                        "summary_points": ["Release tooling and core reliability updates dominate this cycle."],
                        "categories": [
                            {
                                "name": "tools",
                                "signal_strength": "strong",
                                "priority_rank": 1,
                                "theme": "Release tooling contract and workflow updates",
                                "grounded_claims": ["Triage schema now requires theme and grounded claims."],
                                "evidence_refs": ["tools/release/changelog/ai/contracts/triage.py#schema-change"],
                            }
                        ],
                    },
                    source_kind="triage",
                ).lower(),
                ("theme", "grounded_claims", "do not echo file paths/lists", "slot-by-slot recap language"),
                (),
            ),
            (
                "polish-cleanup",
                build_polish_user_prompt(
                    {
                        "schema_version": "vaulthalla.release.ai_draft.v1",
                        "title": "Release 2.5.0",
                        "summary": "Priority rank 1 category and evidence refs dominate.",
                        "sections": [
                            {
                                "category": "tools",
                                "overview": "Evidence refs indicate tools/release/changelog/ai/contracts/triage.py changed.",
                                "bullets": ["important files: tools/release/changelog/ai/contracts/triage.py"],
                            }
                        ],
                    }
                ).lower(),
                ("classifier/audit residue", "path-heavy recap"),
                (),
            ),
            (
                "release-notes-cleanup",
                build_release_notes_user_prompt(
                    "# Release\n- evidence_refs: tools/release/changelog/ai/contracts/triage.py#schema-change\n"
                ).lower(),
                ("remove classifier residue",),
                ("brand voice reference",),
            ),
        )

        for label, prompt, required, forbidden in prompt_cases:
            with self.subTest(label=label):
                assert_contains_all(self, prompt, required)
                assert_not_contains_any(self, prompt, forbidden)


if __name__ == "__main__":
    unittest.main()
