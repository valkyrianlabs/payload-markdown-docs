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

        self.assertIn("bash .github/scripts/setup-release-python.sh", workflow)
        self.assertIn("python -m tools.release check", workflow)
        self.assertIn("VERSION", workflow)
        self.assertIn("Multi-package publication requires the canonical tag 'v${version}'", workflow)
        self.assertIn("publish_required", workflow)
        self.assertIn("fetch-depth: 0", workflow)

    def test_release_workflow_builds_all_shipping_package_surfaces(self) -> None:
        workflow = self._workflow()

        self.assertIn("npm pack --pack-destination release/npm", workflow)
        self.assertIn("python -m tools.release build-deb --output-dir release", workflow)
        self.assertIn("python -m tools.release prepare-homebrew-formula", workflow)
        self.assertIn("meson setup build-native -Dnative_cli_parity_tests=true", workflow)
        self.assertIn("meson setup build-homebrew", workflow)

    def test_release_workflow_validates_and_smoke_tests_native_artifacts(self) -> None:
        workflow = self._workflow()

        self.assertIn("python -m tools.release validate-release-artifacts", workflow)
        self.assertIn("--require-homebrew", workflow)
        self.assertIn("sudo -n apt install -y ./release/*.deb", workflow)
        self.assertIn("pmdocs doctor", workflow)
        self.assertIn("pmdocs validate ./dev/docs-fixtures/basic --source payload-markdown-docs", workflow)
        self.assertIn("ruby -c release/homebrew/Formula/pmdocs.rb", workflow)
        self.assertIn("Build and test native CLI for formula source build parity", workflow)

    def test_release_workflow_publishes_with_protected_gates(self) -> None:
        workflow = self._workflow()

        self.assertIn("RELEASE_PUBLISH_MODE", workflow)
        self.assertIn("RELEASE_PUBLISH_REQUIRED", workflow)
        self.assertIn("NEXUS_REPO_URL", workflow)
        self.assertIn("NEXUS_USER", workflow)
        self.assertIn("NEXUS_PASS", workflow)
        self.assertIn("python -m tools.release publish-deb --output-dir release --require-enabled", workflow)
        self.assertIn("HOMEBREW_TAP_PUBLISH_MODE", workflow)
        self.assertIn("HOMEBREW_TAP_REPOSITORY", workflow)
        self.assertIn("HOMEBREW_TAP_TOKEN", workflow)
        self.assertIn("environment: Production", workflow)

    def test_release_workflow_uses_self_hosted_for_native_and_github_hosted_for_npm_publish(self) -> None:
        workflow = self._workflow()

        self.assertIn("native-debian:\n    name: Native CLI and Debian package\n    runs-on: [self-hosted, Linux, X64, ubuntu-latest-lts]", workflow)
        self.assertIn("homebrew-formula:\n    name: Homebrew formula\n    runs-on: [self-hosted, Linux, X64, ubuntu-latest-lts]", workflow)
        self.assertIn("publish-debian:\n    name: Publish Debian artifacts to Nexus\n    runs-on: [self-hosted, Linux, X64, ubuntu-latest-lts]", workflow)
        self.assertIn("publish-homebrew-tap:\n    name: Publish Homebrew tap formula\n    runs-on: [self-hosted, Linux, X64, ubuntu-latest-lts]", workflow)
        self.assertIn("publish-npm:\n    name: Publish npm package\n    runs-on: ubuntu-latest", workflow)
        self.assertNotIn("NPM_TOKEN", workflow)

    def test_npm_package_name_is_guarded_from_package_json_or_env_var(self) -> None:
        workflow = self._workflow()

        self.assertIn("NPM_PACKAGE_NAME: ${{ vars.NPM_PACKAGE_NAME || '' }}", workflow)
        self.assertIn('expected_package_name="${NPM_PACKAGE_NAME:-$package_name}"', workflow)
        self.assertIn("does not match NPM_PACKAGE_NAME", workflow)
        self.assertIn("EXPECTED_PACKAGE_NAME: ${{ needs.validate-release-state.outputs.package_name }}", workflow)
        self.assertIn("tar -xOf \"$tarball\" package/package.json", workflow)
        self.assertIn("npm tarball package name", workflow)

    def test_npm_publish_runs_after_native_publication(self) -> None:
        workflow = self._workflow()

        self.assertIn("publish-npm:", workflow)
        self.assertIn("needs.publish-debian.result == 'success'", workflow)
        self.assertIn("needs.publish-homebrew-tap.result == 'success'", workflow)
        self.assertIn("npm publish \"${tarballs[0]}\" --access public", workflow)
        self.assertIn("Publish to npm through trusted publishing", workflow)

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
        self.assertIn("needs.publish-npm.result == 'success'", workflow)
        self.assertIn("--github-oidc", workflow)
        self.assertIn("--publish", workflow)
        self.assertIn("DOCS_SYNC_ENDPOINT", workflow)


if __name__ == "__main__":
    unittest.main()
