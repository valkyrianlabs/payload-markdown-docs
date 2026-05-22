from __future__ import annotations

from pathlib import Path
import unittest


class ReleaseWorkflowContractTests(unittest.TestCase):
    def _repo_root(self) -> Path:
        return Path(__file__).resolve().parents[4]

    def _workflow(self) -> str:
        repo_root = self._repo_root()
        workflow_path = repo_root / ".github" / "workflows" / "release.yml"
        return workflow_path.read_text(encoding="utf-8")

    def _package_action(self) -> str:
        repo_root = self._repo_root()
        action_path = repo_root / ".github" / "actions" / "package" / "action.yml"
        return action_path.read_text(encoding="utf-8")

    def test_release_workflow_exposes_debian_distribution_and_urgency_env(self) -> None:
        workflow = self._workflow()
        self.assertIn("RELEASE_DEBIAN_DISTRIBUTION", workflow)
        self.assertIn("RELEASE_DEBIAN_URGENCY", workflow)

    def test_release_workflow_checkout_fetches_full_history_for_changelog_tags(self) -> None:
        workflow = self._workflow()
        self.assertIn("uses: actions/checkout@v4", workflow)
        self.assertIn("fetch-depth: 0", workflow)

    def test_github_release_assets_are_prepared_via_deduped_manifest_step(self) -> None:
        workflow = self._workflow()
        self.assertIn("Prepare GitHub release asset list (deduped)", workflow)
        self.assertIn("id: gh_release_assets", workflow)
        self.assertIn("find \"$artifact_dir\" -type f | LC_ALL=C sort -u", workflow)

    def test_github_release_action_uses_manifest_output_not_duplicate_globs(self) -> None:
        workflow = self._workflow()
        self.assertIn("files: ${{ steps.gh_release_assets.outputs.assets }}", workflow)
        self.assertIn("overwrite_files: true", workflow)
        self.assertIn("fail_on_unmatched_files: true", workflow)
        self.assertNotIn("release/**/**/*", workflow)
        self.assertNotIn("release/**/*", workflow)
        self.assertNotIn("release/*", workflow)

    def test_package_action_preflight_validates_debian_distribution_and_urgency_tokens(self) -> None:
        action = self._package_action()
        self.assertIn("RELEASE_DEBIAN_DISTRIBUTION", action)
        self.assertIn("RELEASE_DEBIAN_URGENCY", action)
        self.assertIn("debian_token_regex=", action)
        self.assertIn("RELEASE_DEBIAN_DISTRIBUTION must be a Debian token", action)
        self.assertIn("RELEASE_DEBIAN_URGENCY must be a Debian token", action)

    def test_package_action_clears_volatile_changelog_scratch_before_generation(self) -> None:
        action = self._package_action()
        self.assertIn("scratch_dir=\".changelog_scratch\"", action)
        self.assertIn("rm -rf \"$scratch_dir\" \"$artifact_dir\"", action)
        self.assertIn("clearing volatile changelog scratch", action)

    def test_package_action_writes_changelog_context_artifact(self) -> None:
        action = self._package_action()
        self.assertIn("--context-output", action)
        self.assertIn("changelog.context.json", action)
        self.assertIn("--semantic-payload-output", action)
        self.assertIn("changelog.semantic_payload.json", action)


if __name__ == "__main__":
    unittest.main()
