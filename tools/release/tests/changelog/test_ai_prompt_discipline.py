from __future__ import annotations

import unittest

from tools.release.changelog.ai.prompts.draft import build_draft_system_prompt, build_draft_user_prompt
from tools.release.changelog.ai.prompts.emergency_triage import build_emergency_triage_user_prompt
from tools.release.changelog.ai.prompts.polish import build_polish_system_prompt, build_polish_user_prompt
from tools.release.changelog.ai.prompts.release_notes import (
    build_release_notes_system_prompt,
    build_release_notes_user_prompt,
)
from tools.release.changelog.ai.prompts.triage import build_triage_system_prompt, build_triage_user_prompt
from tools.release.tests.changelog._support import assert_contains_all


class AIPromptDisciplineTests(unittest.TestCase):
    def test_triage_prompt_contract_variants(self) -> None:
        cases = (
            (
                "default",
                build_triage_system_prompt().lower(),
                build_triage_user_prompt({"schema_version": "x"}).lower(),
                ("deterministic", "do not use speculative wording", "return json only"),
                (
                    "required top-level output fields",
                    "schema_version",
                    "never emit empty placeholders in arrays",
                    "nulls",
                    "non-string placeholders",
                ),
            ),
            (
                "hosted-compact",
                build_triage_system_prompt(hosted_compact_mode=True).lower(),
                build_triage_user_prompt({"schema_version": "x"}, hosted_compact_mode=True).lower(),
                ("compression stage", "top-category distinctions"),
                ("compression mode (hosted)", "top category distinctions", "grounded_claims", "evidence_refs"),
            ),
            (
                "synthesized-input",
                build_triage_system_prompt(input_mode="synthesized_semantic").lower(),
                build_triage_user_prompt(
                    {
                        "schema_version": "vaulthalla.release.triage_input.synthesized.v1",
                        "categories": [],
                    },
                    input_mode="synthesized_semantic",
                ).lower(),
                ("pre-synthesized unit summaries",),
                ("synthesized_units", "synthesized semantic payload"),
            ),
        )

        for label, system, user, system_fragments, user_fragments in cases:
            with self.subTest(label=label):
                assert_contains_all(self, system, system_fragments)
                assert_contains_all(self, user, user_fragments)

    def test_draft_prompt_enforces_evidence_bound_output(self) -> None:
        system = build_draft_system_prompt().lower()
        user = build_draft_user_prompt({"schema_version": "x", "categories": []}).lower()
        assert_contains_all(self, system, ("use only explicit evidence", "do not use speculative wording"))
        assert_contains_all(
            self,
            user,
            (
                "directly attributable to input evidence",
                "theme",
                "grounded_claims",
                "do not echo file paths",
                "foreground the 2-3 strongest release themes",
                "do not give weak/low-signal categories equal space",
                "synthesize related evidence",
                "do not add intro/outro filler",
                "required top-level output fields",
                "`title`, `summary`, `sections`",
            ),
        )

    def test_polish_prompt_constrains_semantic_changes(self) -> None:
        system = build_polish_system_prompt().lower()
        user = build_polish_user_prompt({"title": "t", "summary": "s", "sections": []}).lower()
        assert_contains_all(self, system, ("wording refinement only", "never add meaning"))
        assert_contains_all(
            self,
            user,
            (
                "merge repetitive phrasing",
                "classifier/audit residue",
                "remove redundancy between section overviews and bullets",
                "increasing verbosity",
                "return json only",
                "schema_version",
                "required top-level output fields",
            ),
        )

    def test_required_input_labels_preserved(self) -> None:
        triage_user = build_triage_user_prompt({"schema_version": "x"})
        draft_user = build_draft_user_prompt({"schema_version": "x"}, source_kind="triage")
        polish_user = build_polish_user_prompt({"title": "t"})
        assert_contains_all(self, triage_user, ("Semantic payload",))
        assert_contains_all(self, draft_user, ("Triage IR",))
        assert_contains_all(self, polish_user, ("Draft input",))

    def test_release_notes_prompt_enforces_no_invention(self) -> None:
        system = build_release_notes_system_prompt().lower()
        user = build_release_notes_user_prompt("# Changelog\n- fix\n").lower()
        assert_contains_all(
            self,
            system,
            ("do not invent", "engineering-focused", "do not contradict", "do not write marketing copy", "preserve cautions"),
        )
        assert_contains_all(self, user, ("remove classifier residue", "schema_version", "return markdown in `markdown`"))

    def test_emergency_triage_prompt_requires_version_and_non_empty_items(self) -> None:
        user = build_emergency_triage_user_prompt({"schema_version": "x", "version": "1.2.3", "items": []}).lower()
        assert_contains_all(
            self,
            user,
            (
                "required top-level output fields",
                "`schema_version`, `version`, `items`",
                "set top-level `version` exactly",
                "non-empty array",
            ),
        )


if __name__ == "__main__":
    unittest.main()
