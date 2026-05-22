from __future__ import annotations

from pathlib import Path
import unittest


class DebianRulesContractTests(unittest.TestCase):
    def test_debian_rules_uses_repo_root_meson_entrypoint(self) -> None:
        repo_root = Path(__file__).resolve().parents[4]
        rules_path = repo_root / "debian" / "rules"
        rules = rules_path.read_text(encoding="utf-8")

        self.assertIn(
            "dh_auto_configure -- -Dmanpage=true",
            rules,
        )
        self.assertIn(
            "dh_auto_install --destdir=debian/tmp",
            rules,
        )

    def test_debian_rules_leaves_static_payloads_to_meson(self) -> None:
        repo_root = Path(__file__).resolve().parents[4]
        rules = (repo_root / "debian" / "rules").read_text(encoding="utf-8")

        meson_owned_fragments = (
            "deploy/config/config.yaml",
            "deploy/config/config_template.yaml.in",
            "deploy/systemd/vaulthalla.service.in",
            "deploy/systemd/vaulthalla-cli.service.in",
            "deploy/systemd/vaulthalla-web.service.in",
            "deploy/systemd/vaulthalla-swtpm.service.in",
            "deploy/systemd/vaulthalla-cli.socket",
            "deploy/nginx/vaulthalla.conf",
            "deploy/psql/.",
            "deploy/lifecycle/main.py",
            "debian/vaulthalla.udev",
            "debian/tmpfiles.d/vaulthalla.conf",
        )
        for fragment in meson_owned_fragments:
            self.assertNotIn(fragment, rules)

        debian_assembled_fragments = (
            "cp -a web/.next/standalone/. debian/tmp/usr/share/vaulthalla-web/",
            "cp -a web/.next/static debian/tmp/usr/share/vaulthalla-web/.next/",
        )
        for fragment in debian_assembled_fragments:
            self.assertIn(fragment, rules)

    def test_root_meson_installs_static_runtime_payloads_when_enabled(self) -> None:
        repo_root = Path(__file__).resolve().parents[4]
        meson = (repo_root / "meson.build").read_text(encoding="utf-8")

        required_fragments = (
            "if get_option('install_data')",
            "install_emptydir(state_dir)",
            "install_emptydir(log_dir)",
            "'deploy/config/config.yaml'",
            "'deploy/config/config_template.yaml.in'",
            "install_subdir(\n        'deploy/psql'",
            "'deploy/nginx/vaulthalla.conf'",
            "'deploy/lifecycle/main.py'",
            "'deploy/systemd/vaulthalla-cli.socket'",
            "'debian/vaulthalla.udev'",
            "'debian/tmpfiles.d/vaulthalla.conf'",
            "install_symlink(\n        'vaulthalla'",
            "install_symlink(\n        'vh'",
        )
        for fragment in required_fragments:
            self.assertIn(fragment, meson)

    def test_debian_install_declares_meson_staged_payloads(self) -> None:
        repo_root = Path(__file__).resolve().parents[4]
        install_manifest = (repo_root / "debian" / "install").read_text(encoding="utf-8")

        self.assertIn("usr/lib/*/libvaulthalla.a usr/lib/libvaulthalla.a", install_manifest)
        self.assertIn("usr/lib/*/libvhusage.a usr/lib/libvhusage.a", install_manifest)
        self.assertIn("var/lib/vaulthalla", install_manifest)
        self.assertIn("var/log/vaulthalla", install_manifest)
        self.assertIn("usr/lib/udev/rules.d/60-vaulthalla-tpm.rules", install_manifest)
        self.assertIn("usr/lib/tmpfiles.d/vaulthalla.conf", install_manifest)
        self.assertIn(
            "lib/systemd/system/vaulthalla-web.service",
            install_manifest,
        )
        self.assertIn(
            "lib/systemd/system/vaulthalla-swtpm.service",
            install_manifest,
        )
        self.assertIn(
            "usr/share/vaulthalla/nginx/vaulthalla",
            install_manifest,
        )
        self.assertIn(
            "usr/share/vaulthalla/psql",
            install_manifest,
        )
        self.assertIn(
            "usr/share/vaulthalla-web usr/share/",
            install_manifest,
        )

    def test_debian_control_declares_web_runtime_and_proxy_expectations(self) -> None:
        repo_root = Path(__file__).resolve().parents[4]
        control = (repo_root / "debian" / "control").read_text(encoding="utf-8")

        self.assertIn("nodejs,", control)
        self.assertIn("openssl,", control)
        self.assertIn("Recommends:\n postgresql,\n nginx", control)
        self.assertIn("swtpm,", control)
        self.assertIn("swtpm-tools", control)
        self.assertIn("Depends:\n adduser,\n nodejs,\n openssl,", control)


if __name__ == "__main__":
    unittest.main()
