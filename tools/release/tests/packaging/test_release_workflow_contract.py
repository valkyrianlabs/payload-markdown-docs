from __future__ import annotations

import json
from pathlib import Path
import unittest


class ReleaseWorkflowContractTests(unittest.TestCase):
    def _repo_root(self) -> Path:
        return Path(__file__).resolve().parents[4]

    def _workflow(self) -> str:
        workflow_path = self._repo_root() / ".github" / "workflows" / "release.yml"
        return workflow_path.read_text(encoding="utf-8")

    def test_npm_package_is_plugin_runtime_only(self) -> None:
        package = json.loads((self._repo_root() / "package.json").read_text(encoding="utf-8"))
        scripts = package.get("scripts", {})

        self.assertNotIn("bin", package)
        self.assertNotIn("cli", scripts)
        self.assertNotIn("cli:dist", scripts)

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
        self.assertIn("meson setup build-native", workflow)
        self.assertNotIn("native_cli_parity_tests=true", workflow)
        self.assertIn("meson setup build-homebrew", workflow)

    def test_release_workflow_validates_and_smoke_tests_native_artifacts(self) -> None:
        workflow = self._workflow()
        native_job = workflow.split("  native-debian:", 1)[1].split("  homebrew-formula:", 1)[0]
        assemble_job = workflow.split("  assemble-release-artifacts:", 1)[1].split("  publish-debian:", 1)[0]

        self.assertIn("python -m tools.release validate-release-artifacts", workflow)
        self.assertIn("--require-homebrew", workflow)
        self.assertIn("python -m tools.release validate-release-artifacts --output-dir release", native_job)
        self.assertNotIn("--skip-changelog", native_job)
        self.assertNotIn("--skip-changelog", assemble_job)
        self.assertIn("Smoke install Debian package in container", workflow)
        self.assertIn("docker run --rm", workflow)
        self.assertIn("apt-get install -y /release/*.deb", workflow)
        self.assertIn("pmdocs doctor", workflow)
        self.assertIn("pmdocs validate /fixtures/basic --source payload-markdown-docs", workflow)
        self.assertIn("ruby -c release/homebrew/Formula/pmdocs.rb", workflow)
        self.assertIn("Build and test native CLI for formula source build parity", workflow)

    def test_release_workflow_generates_changelog_before_debian_build(self) -> None:
        workflow = self._workflow()
        native_job = workflow.split("  native-debian:", 1)[1].split("  homebrew-formula:", 1)[0]

        self.assertLess(native_job.index("Generate release changelog"), native_job.index("Build Debian package"))
        self.assertIn("python -m tools.release changelog release", native_job)
        self.assertIn("RELEASE_AI_MODE: ${{ vars.RELEASE_AI_MODE || 'auto' }}", native_job)
        self.assertIn("RELEASE_AI_PROFILE_OPENAI: ${{ vars.RELEASE_AI_PROFILE_OPENAI || 'openai-balanced' }}", native_job)
        self.assertIn("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY || '' }}", native_job)
        self.assertIn("RELEASE_LOCAL_LLM_API_KEY: ${{ secrets.RELEASE_LOCAL_LLM_API_KEY || '' }}", native_job)
        self.assertIn("--output release/changelog.release.md", native_job)
        self.assertIn("--raw-output release/changelog.raw.md", native_job)
        self.assertIn("--payload-output release/changelog.payload.json", native_job)
        self.assertIn("--semantic-payload-output release/changelog.semantic_payload.json", native_job)
        self.assertIn("--context-output release/changelog.context.json", native_job)
        self.assertIn("--selection-output release/changelog.selection.json", native_job)
        self.assertIn("release/changelog.release.md", native_job)
        self.assertIn("release/changelog.raw.md", native_job)
        self.assertIn("release/changelog.payload.json", native_job)
        self.assertIn("release/changelog.semantic_payload.json", native_job)
        self.assertIn("release/changelog.context.json", native_job)

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
        self.assertIn("Prepare GitHub Release body append", workflow)
        self.assertIn("id: gh_release_body", workflow)
        self.assertIn("## What's changed", workflow)
        self.assertIn("release/release_notes.md", workflow)
        self.assertIn("release/changelog.release.md", workflow)
        self.assertIn("uses: softprops/action-gh-release@v2", workflow)
        self.assertIn("body_path: ${{ steps.gh_release_body.outputs.body_path }}", workflow)
        self.assertIn("append_body: true", workflow)
        self.assertIn("files: ${{ steps.gh_release_assets.outputs.assets }}", workflow)
        self.assertIn("overwrite_files: true", workflow)
        self.assertIn("fail_on_unmatched_files: true", workflow)

    def test_release_workflow_publishes_docs_after_package_publication(self) -> None:
        workflow = self._workflow()
        docs_job = workflow.split("  publish-docs:", 1)[1]

        self.assertIn("publish-docs:", workflow)
        self.assertIn("needs.native-debian.result == 'success'", workflow)
        self.assertIn("needs.publish-debian.result == 'success'", workflow)
        self.assertIn("needs.publish-homebrew-tap.result == 'success'", workflow)
        self.assertIn("needs.publish-npm.result == 'success'", workflow)
        self.assertIn("Download workflow-built pmdocs", docs_job)
        self.assertIn("pmdocs-linux-amd64", docs_job)
        self.assertIn(".artifacts/pmdocs-linux-amd64", docs_job)
        self.assertIn("Using workflow-built pmdocs artifact: ${PMDOCS_BIN}", docs_job)
        self.assertIn("Publishing docs with workflow-built pmdocs: ${PMDOCS_BIN}", docs_job)
        self.assertIn("pmdocs --version", workflow)
        self.assertIn('echo "$PWD/.tools" >> "$GITHUB_PATH"', docs_job)
        self.assertIn("PMDOCS_BIN=\"$(command -v pmdocs)\"", docs_job)
        self.assertIn("pmdocs --version", docs_job)
        self.assertIn("pmdocs --help", docs_job)
        self.assertIn("pmdocs push ./docs", docs_job)
        self.assertNotIn("Install native pmdocs from Valkyrian Labs APT", docs_job)
        self.assertNotIn("apt-get install -y pmdocs", docs_job)
        self.assertNotIn("apt install -y pmdocs", docs_job)
        self.assertNotIn("node ./dist/cli/index.js push", workflow)
        self.assertNotIn("pnpm exec payload-markdown-docs", workflow)
        self.assertIn("--github-oidc", workflow)
        self.assertIn("--publish", workflow)
        self.assertIn("DOCS_SYNC_ENDPOINT", workflow)

    def test_release_workflow_smoke_installs_published_apt_package_separately(self) -> None:
        workflow = self._workflow()
        publish_debian_job = workflow.split("  publish-debian:", 1)[1].split("  publish-homebrew-tap:", 1)[0]

        self.assertIn("Smoke install published APT package", publish_debian_job)
        self.assertIn("python -m tools.release publish-deb --output-dir release --require-enabled", publish_debian_job)
        self.assertIn("https://apt.valkyrianlabs.com/pubkey.gpg", publish_debian_job)
        self.assertIn("sudo -n apt update", publish_debian_job)
        self.assertIn("sudo -n apt install -y pmdocs", publish_debian_job)
        self.assertIn("pmdocs --version", publish_debian_job)


if __name__ == "__main__":
    unittest.main()
