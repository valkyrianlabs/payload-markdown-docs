from __future__ import annotations

from pathlib import Path
import unittest


class DebianRulesContractTests(unittest.TestCase):
    def _repo_root(self) -> Path:
        return Path(__file__).resolve().parents[4]

    def test_debian_rules_uses_repo_root_meson_entrypoint(self) -> None:
        rules = (self._repo_root() / "debian" / "rules").read_text(encoding="utf-8")

        self.assertIn("dh $@ --buildsystem=meson", rules)
        self.assertIn("dh_auto_install --destdir=debian/tmp", rules)
        self.assertNotIn("web/.next", rules)
        self.assertNotIn("systemctl", rules)

    def test_root_meson_installs_native_binary_and_skill_data(self) -> None:
        meson = (self._repo_root() / "meson.build").read_text(encoding="utf-8")
        cli_meson = (self._repo_root() / "cli" / "meson.build").read_text(encoding="utf-8")

        self.assertIn("executable(\n  'pmdocs'", cli_meson)
        self.assertIn("install: true", cli_meson)
        self.assertIn("install_subdir(", meson)
        self.assertIn("'skills/payload-markdown-docs'", meson)
        self.assertIn("install_dir: pmdocs_data_dir / 'skills'", meson)
        self.assertIn("if get_option('install_skill_data')", meson)

    def test_debian_install_manifest_tracks_only_native_payload(self) -> None:
        install_manifest = (self._repo_root() / "debian" / "pmdocs.install").read_text(encoding="utf-8")

        self.assertIn("usr/bin/pmdocs", install_manifest)
        self.assertIn("usr/share/pmdocs/skills/payload-markdown-docs", install_manifest)
        self.assertNotIn("lib/systemd/system", install_manifest)
        self.assertNotIn("usr/share/pmdocs-web", install_manifest)

    def test_debian_control_is_native_cli_only(self) -> None:
        control = (self._repo_root() / "debian" / "control").read_text(encoding="utf-8")

        self.assertIn("Source: pmdocs", control)
        self.assertIn("Package: pmdocs", control)
        self.assertIn("libcurl4-openssl-dev", control)
        self.assertIn("libssl-dev", control)
        self.assertNotIn("nodejs", control)
        self.assertNotIn("postgresql", control)
        self.assertNotIn("nginx", control)
        self.assertNotIn("swtpm", control)


if __name__ == "__main__":
    unittest.main()
