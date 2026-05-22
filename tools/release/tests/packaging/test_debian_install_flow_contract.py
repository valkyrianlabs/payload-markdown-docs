from __future__ import annotations

from pathlib import Path
import unittest


class DebianInstallFlowContractTests(unittest.TestCase):
    def _repo_root(self) -> Path:
        return Path(__file__).resolve().parents[4]

    def test_native_package_has_no_maintainer_script_side_effects(self) -> None:
        debian = self._repo_root() / "debian"

        for script_name in ("preinst", "postinst", "prerm", "postrm", "templates", "config"):
            self.assertFalse((debian / script_name).exists(), script_name)

    def test_debian_readme_documents_local_build_and_smoke_check(self) -> None:
        readme = (self._repo_root() / "debian" / "README.md").read_text(encoding="utf-8")

        required = (
            "dpkg-buildpackage -us -uc -b",
            "python3 -m tools.release build-deb --output-dir release",
            "python3 -m tools.release validate-release-artifacts --output-dir release --skip-changelog",
            "sudo apt install ./release/pmdocs_",
            "pmdocs --version",
            "pmdocs doctor",
            "pmdocs validate ./dev/docs-fixtures/basic --source payload-markdown-docs",
            "pmdocs skill install --dry-run",
            "Nexus-backed apt repository",
        )
        for fragment in required:
            self.assertIn(fragment, readme)

    def test_debian_readme_keeps_runtime_service_stack_out_of_scope(self) -> None:
        readme = (self._repo_root() / "debian" / "README.md").read_text(encoding="utf-8")

        forbidden = (
            "postgresql",
            "nginx",
            "systemctl",
            "debconf",
            "vaulthalla",
        )
        for fragment in forbidden:
            self.assertNotIn(fragment, readme.lower())

    def test_top_level_control_description_mentions_native_push_and_keygen(self) -> None:
        control = (self._repo_root() / "debian" / "control").read_text(encoding="utf-8")

        self.assertIn("Ed25519 key generation", control)
        self.assertIn("signed docs push", control)
        self.assertNotIn("remain in the npm CLI", control)


if __name__ == "__main__":
    unittest.main()
