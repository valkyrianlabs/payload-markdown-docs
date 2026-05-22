from __future__ import annotations

from pathlib import Path
import unittest


class DebianInstallFlowContractTests(unittest.TestCase):
    def _repo_root(self) -> Path:
        return Path(__file__).resolve().parents[4]

    def test_phase2_removes_routine_debconf_scaffolding(self) -> None:
        repo = self._repo_root()
        self.assertFalse((repo / "debian" / "templates").exists())
        self.assertFalse((repo / "debian" / "config").exists())

    def test_postinst_uses_env_overrides_and_no_db_get_prompts(self) -> None:
        postinst = (self._repo_root() / "debian" / "postinst").read_text(encoding="utf-8")
        required_fragments = (
            "VH_SKIP_DB_BOOTSTRAP",
            "VH_SKIP_NGINX_CONFIG",
            "bootstrap_db_if_safe()",
            "configure_nginx_if_safe()",
            "ensure_fuse_allow_other()",
            "FUSE config: enabled user_allow_other in /etc/fuse.conf",
            "configure_swtpm_apparmor_override_if_possible",
            "SWTPM_BASE_DIR=\"/var/lib/swtpm\"",
            "SWTPM_STATE_DIR=\"${SWTPM_BASE_DIR}/vaulthalla\"",
            "DB_BOOTSTRAP_STATUS=",
            "NGINX_CONFIG_STATUS=",
            "skipped (psql not installed; install PostgreSQL or configure remote DB)",
            "Super-admin ownership: deferred to first CLI use",
        )
        for fragment in required_fragments:
            self.assertIn(fragment, postinst)

        forbidden_fragments = (
            "db_get ",
            "Template:",
            "seed_superadmin_uid",
            "ensure_superadmin_user_in_group",
        )
        for fragment in forbidden_fragments:
            self.assertNotIn(fragment, postinst)

    def test_postinst_mount_root_is_best_effort_and_upgrade_safe(self) -> None:
        postinst = (self._repo_root() / "debian" / "postinst").read_text(encoding="utf-8")
        required_fragments = (
            "is_mountpoint()",
            "ensure_mount_root()",
            "FUSE mount roots can reject chown/chmod while live or stale",
            "Mount root ${path}: mounted; leaving owner/mode unchanged.",
            "Mount root ${path}: exists; leaving owner/mode unchanged.",
            "Could not prepare mount root ${path}; continuing.",
            'ensure_mount_root /mnt/vaulthalla 0755 "$DB_USER" "$DB_USER"',
        )
        for fragment in required_fragments:
            self.assertIn(fragment, postinst)

        forbidden_fragments = (
            "[ -d /mnt/vaulthalla ] || create_dir /mnt/vaulthalla",
            'create_dir /mnt/vaulthalla 0755 "$DB_USER" "$DB_USER"',
        )
        for fragment in forbidden_fragments:
            self.assertNotIn(fragment, postinst)

    def test_postinst_tss_membership_failure_is_nonfatal(self) -> None:
        postinst = (self._repo_root() / "debian" / "postinst").read_text(encoding="utf-8")
        required_fragments = (
            "warn_nonfatal()",
            "if ! addgroup --system tss; then",
            "Failed to create 'tss' group; continuing without package-time TPM group membership.",
            'if ! adduser "$DB_USER" tss; then',
            "Failed to add '${DB_USER}' to 'tss'; continuing because systemd supplies SupplementaryGroups=tss.",
        )
        for fragment in required_fragments:
            self.assertIn(fragment, postinst)

    def test_postinst_optional_runtime_setup_warns_instead_of_aborting(self) -> None:
        postinst = (self._repo_root() / "debian" / "postinst").read_text(encoding="utf-8")
        required_fragments = (
            "Could not create ${fuse_conf}; skipping FUSE allow_other configuration.",
            "Could not update ${fuse_conf}; skipping FUSE allow_other configuration.",
            "Could not append to ${fuse_conf}; skipping FUSE allow_other configuration.",
            "Could not align owner for ${target}; leaving unchanged.",
            "Could not align mode for ${target}; leaving unchanged.",
            "Web cache: could not prepare ${CACHE_DIR}; leaving cache setup unchanged.",
            "Web cache: could not create ${CACHE_LINK}; leaving cache setup unchanged.",
            "skipped (failed preparing nginx site directories)",
            "skipped (failed installing nginx site template)",
            "skipped (failed enabling nginx site)",
            'rm -f "$NGINX_SITE_ENABLED" || true',
        )
        for fragment in required_fragments:
            self.assertIn(fragment, postinst)

    def test_postinst_restarts_only_active_vaulthalla_units_on_upgrade(self) -> None:
        postinst = (self._repo_root() / "debian" / "postinst").read_text(encoding="utf-8")
        body_start = postinst.index("configure_systemd_units() {")
        body_end = postinst.index('\n}\n\ncase "$1" in', body_start)
        body = postinst[body_start:body_end]
        upgrade_body = body[body.index("if is_upgrade; then"):body.index("safe_systemctl preset")]

        required_upgrade_fragments = (
            "Systemd: upgrade detected; restarting active Vaulthalla units only.",
            'safe_systemctl try-restart "$SWTPM_SYSTEMD_UNIT"',
            'safe_systemctl try-restart "$CORE_SYSTEMD_UNIT"',
            'safe_systemctl try-restart "$CLI_SOCKET_SYSTEMD_UNIT"',
            'safe_systemctl try-restart "$CLI_SYSTEMD_UNIT"',
            'safe_systemctl try-restart "$WEB_SYSTEMD_UNIT"',
        )
        for fragment in required_upgrade_fragments:
            self.assertIn(fragment, upgrade_body)

        self.assertNotIn("enable --now", upgrade_body)
        self.assertNotIn("daemon-reexec", body)
        self.assertLess(
            body.index('safe_systemctl try-restart "$SWTPM_SYSTEMD_UNIT"'),
            body.index('safe_systemctl try-restart "$CORE_SYSTEMD_UNIT"'),
        )
        self.assertLess(
            body.index('safe_systemctl try-restart "$CORE_SYSTEMD_UNIT"'),
            body.index('safe_systemctl try-restart "$WEB_SYSTEMD_UNIT"'),
        )

    def test_postinst_swtpm_backend_does_not_start_disabled_unit_on_upgrade(self) -> None:
        postinst = (self._repo_root() / "debian" / "postinst").read_text(encoding="utf-8")
        body_start = postinst.index("configure_tpm_backend_if_safe() {")
        body_end = postinst.index("\n}\n\nis_noninteractive_context", body_start)
        body = postinst[body_start:body_end]

        self.assertIn("active unit restart is handled by configure_systemd_units", body)
        self.assertLess(
            body.index("if is_upgrade; then"),
            body.index("if ! has_command systemctl; then"),
        )
        self.assertLess(
            body.index("if is_upgrade; then"),
            body.index("if start_and_validate_swtpm_service; then"),
        )

    def test_postinst_fresh_install_still_enables_services(self) -> None:
        postinst = (self._repo_root() / "debian" / "postinst").read_text(encoding="utf-8")
        body_start = postinst.index("configure_systemd_units() {")
        body_end = postinst.index('\n}\n\ncase "$1" in', body_start)
        body = postinst[body_start:body_end]
        fresh_body = body[body.index("safe_systemctl preset") :]

        required_fresh_fragments = (
            'safe_systemctl preset "$CORE_SYSTEMD_UNIT"',
            'safe_systemctl preset "$CLI_SOCKET_SYSTEMD_UNIT"',
            'safe_systemctl preset "$CLI_SYSTEMD_UNIT"',
            'safe_systemctl preset "$WEB_SYSTEMD_UNIT"',
            'safe_systemctl preset "$SWTPM_SYSTEMD_UNIT"',
            'safe_systemctl enable --now "$CORE_SYSTEMD_UNIT"',
            'safe_systemctl enable --now "$CLI_SOCKET_SYSTEMD_UNIT"',
            'safe_systemctl enable --now "$CLI_SYSTEMD_UNIT"',
            'safe_systemctl enable --now "$WEB_SYSTEMD_UNIT"',
        )
        for fragment in required_fresh_fragments:
            self.assertIn(fragment, fresh_body)

    def test_prerm_and_postrm_cleanup_legacy_superadmin_seed_only_as_legacy(self) -> None:
        repo = self._repo_root()
        prerm = (repo / "debian" / "prerm").read_text(encoding="utf-8")
        postrm = (repo / "debian" / "postrm").read_text(encoding="utf-8")
        self.assertIn("LEGACY_PENDING_SUPERADMIN_UID_FILE", prerm)
        self.assertIn("LEGACY_PENDING_SUPERADMIN_UID_FILE", postrm)
        self.assertNotIn("/usr/share/debconf/confmodule", postrm)
        self.assertNotIn("db_purge", postrm)

    def test_prerm_uses_bounded_service_stops_with_frontend_first_order(self) -> None:
        prerm = (self._repo_root() / "debian" / "prerm").read_text(encoding="utf-8")
        required_fragments = (
            "SYSTEMCTL_STOP_WAIT_SECONDS",
            "run_systemctl_quiet()",
            "stop_service_bounded()",
            "systemctl --system $* failed; continuing.",
            "stop --no-block",
            "safe_systemctl kill \"$unit\"",
            "safe_systemctl reset-failed \"$unit\"",
            "stop_service_bounded \"$WEB_SYSTEMD_UNIT\"",
            "stop_service_bounded \"$CLI_SOCKET_SYSTEMD_UNIT\"",
            "stop_service_bounded \"$CLI_SYSTEMD_UNIT\"",
            "stop_service_bounded \"$CORE_SYSTEMD_UNIT\"",
            "stop_service_bounded \"$SWTPM_SYSTEMD_UNIT\"",
        )
        for fragment in required_fragments:
            self.assertIn(fragment, prerm)

        self.assertLess(
            prerm.index('stop_service_bounded "$WEB_SYSTEMD_UNIT"'),
            prerm.index('stop_service_bounded "$CORE_SYSTEMD_UNIT"'),
        )

    def test_control_uses_recommends_for_postgresql_and_nginx(self) -> None:
        control = (self._repo_root() / "debian" / "control").read_text(encoding="utf-8")
        self.assertIn("Depends:\n adduser,\n nodejs,\n openssl,", control)
        self.assertIn("Recommends:\n postgresql,\n nginx", control)
        self.assertIn("swtpm,", control)
        self.assertIn("swtpm-tools", control)
        self.assertNotIn("Depends:\n adduser,\n nodejs,\n postgresql,", control)

    def test_readme_documents_phase3_cli_integration_followups(self) -> None:
        readme = (self._repo_root() / "debian" / "README.Debian").read_text(encoding="utf-8")
        required = (
            "apt install vaulthalla",
            "apt install --no-install-recommends vaulthalla",
            "VH_SKIP_DB_BOOTSTRAP=1 sudo -E apt install vaulthalla",
            "VH_SKIP_NGINX_CONFIG=1 sudo -E apt install vaulthalla",
            "vh setup db",
            "vh setup remote-db",
            "vh setup nginx",
            "vh setup nginx --certbot --domain",
            "vh teardown nginx",
            "canonical final deployment path",
            "/usr/share/vaulthalla/psql",
            "/var/lib/vaulthalla/nginx_site_managed",
            "TPM backend behavior",
            "systemctl status vaulthalla-swtpm.service",
        )
        for fragment in required:
            self.assertIn(fragment, readme)

    def test_readme_documents_needrestart_service_restart_boundary(self) -> None:
        readme = (self._repo_root() / "debian" / "README.Debian").read_text(encoding="utf-8")
        required = (
            "APT upgrade service restart boundary",
            "Vaulthalla restarts only active Vaulthalla units",
            "Unrelated service restarts during `apt upgrade` are controlled by host-level apt",
            "hooks such as `needrestart`, not by the Vaulthalla package.",
            "needrestart",
            "nexus.service",
            "/etc/needrestart/conf.d/local.conf",
            "$nrconf{override_rc}->{qr(^nexus\\.service$)} = 0;",
            "Vaulthalla does not ship third-party restart policy",
            "Sonatype Nexus",
        )
        for fragment in required:
            self.assertIn(fragment, readme)

    def test_top_level_readme_matches_low_prompt_install_contract(self) -> None:
        readme = (self._repo_root() / "README.md").read_text(encoding="utf-8")
        required = (
            "sudo apt install vaulthalla",
            "sudo apt install --no-install-recommends vaulthalla",
            "VH_SKIP_DB_BOOTSTRAP=1 sudo -E apt install vaulthalla",
            "VH_SKIP_NGINX_CONFIG=1 sudo -E apt install vaulthalla",
            "vh setup db",
            "vh setup remote-db",
            "vh setup nginx",
            "sudo vh setup nginx --domain <domain> --certbot",
            "vh teardown nginx",
            "The CLI is the control plane.",
        )
        forbidden = (
            "Debian Install Prompts",
            "Initialize PostgreSQL database?",
            "Super-admin Linux UID",
        )
        for fragment in required:
            self.assertIn(fragment, readme)
        for fragment in forbidden:
            self.assertNotIn(fragment, readme)

    def test_shell_usage_and_command_registry_include_setup_and_teardown(self) -> None:
        repo = self._repo_root()
        usages_hpp = (repo / "core" / "usage" / "include" / "usages.hpp").read_text(encoding="utf-8")
        usage_manager = (repo / "core" / "usage" / "src" / "UsageManager.cpp").read_text(encoding="utf-8")
        commands_hpp = (repo / "core" / "include" / "protocols" / "shell" / "commands" / "all.hpp").read_text(encoding="utf-8")
        commands_cpp = (repo / "core" / "src" / "protocols" / "shell" / "commands" / "all.cpp").read_text(encoding="utf-8")

        self.assertIn("namespace setup", usages_hpp)
        self.assertIn("namespace teardown", usages_hpp)
        self.assertIn("registerBook(setup::get", usage_manager)
        self.assertIn("registerBook(teardown::get", usage_manager)
        self.assertIn("registerSetupCommands", commands_hpp)
        self.assertIn("registerTeardownCommands", commands_hpp)
        self.assertIn("registerSetupCommands(r);", commands_cpp)
        self.assertIn("registerTeardownCommands(r);", commands_cpp)


if __name__ == "__main__":
    unittest.main()
