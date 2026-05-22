from __future__ import annotations

from pathlib import Path
import unittest


class ReleaseWorkflowContractTests(unittest.TestCase):
    def _repo_root(self) -> Path:
        return Path(__file__).resolve().parents[4]

    def _workflow(self) -> str:
        workflow_path = self._repo_root() / ".github" / "workflows" / "release.yml"
        return workflow_path.read_text(encoding="utf-8")

    def test_release_workflow_checks_canonical_version_state(self) -> None:
        workflow = self._workflow()

        self.assertIn("python3 -m tools.release check", workflow)
        self.assertIn("VERSION", workflow)
        self.assertIn("Multi-package publication requires the canonical tag 'v${version}'", workflow)
        self.assertIn("publish_required", workflow)

    def test_release_workflow_builds_all_shipping_package_surfaces(self) -> None:
        workflow = self._workflow()

        self.assertIn("npm pack --pack-destination release/npm", workflow)
        self.assertIn("python3 -m tools.release build-deb --output-dir release", workflow)
        self.assertIn("python3 -m tools.release prepare-homebrew-formula", workflow)
        self.assertIn("meson setup build-native -Dnative_cli_parity_tests=true", workflow)
        self.assertIn("meson setup build-homebrew", workflow)

    def test_release_workflow_validates_and_smoke_tests_native_artifacts(self) -> None:
        workflow = self._workflow()

        self.assertIn("python3 -m tools.release validate-release-artifacts", workflow)
        self.assertIn("--require-homebrew", workflow)
        self.assertIn("sudo apt-get install -y ./release/*.deb", workflow)
        self.assertIn("pmdocs doctor", workflow)
        self.assertIn("pmdocs validate ./dev/docs-fixtures/basic --source payload-markdown-docs", workflow)
        self.assertIn("brew install --build-from-source ./release/homebrew/Formula/pmdocs.rb", workflow)
        self.assertIn("brew test pmdocs", workflow)

    def test_release_workflow_publishes_with_protected_gates(self) -> None:
        workflow = self._workflow()

        self.assertIn("RELEASE_PUBLISH_MODE", workflow)
        self.assertIn("RELEASE_PUBLISH_REQUIRED", workflow)
        self.assertIn("NEXUS_REPO_URL", workflow)
        self.assertIn("NEXUS_USER", workflow)
        self.assertIn("NEXUS_PASS", workflow)
        self.assertIn("python3 -m tools.release publish-deb --output-dir release --require-enabled", workflow)
        self.assertIn("HOMEBREW_TAP_PUBLISH_MODE", workflow)
        self.assertIn("HOMEBREW_TAP_REPOSITORY", workflow)
        self.assertIn("HOMEBREW_TAP_TOKEN", workflow)
        self.assertIn("environment: Production", workflow)

    def test_release_workflow_attaches_deduped_github_release_assets(self) -> None:
        workflow = self._workflow()

        self.assertIn("Prepare GitHub release asset list (deduped)", workflow)
        self.assertIn("id: gh_release_assets", workflow)
        self.assertIn("find \"$artifact_dir\" -type f | LC_ALL=C sort -u", workflow)
        self.assertIn("uses: softprops/action-gh-release@v2", workflow)
        self.assertIn("files: ${{ steps.gh_release_assets.outputs.assets }}", workflow)
        self.assertIn("overwrite_files: true", workflow)
        self.assertIn("fail_on_unmatched_files: true", workflow)

    def test_release_workflow_publishes_docs_after_package_publication(self) -> None:
        workflow = self._workflow()

        self.assertIn("publish-docs:", workflow)
        self.assertIn("needs.publish-debian.result == 'success'", workflow)
        self.assertIn("needs.publish-homebrew-tap.result == 'success'", workflow)
        self.assertIn("--github-oidc", workflow)
        self.assertIn("--publish", workflow)
        self.assertIn("DOCS_SYNC_ENDPOINT", workflow)


if __name__ == "__main__":
    unittest.main()
