from __future__ import annotations

import argparse
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
import unittest
from unittest.mock import patch

from tools.release import cli
from tools.release.cli_tools.commands.debian import cmd_publish_deb, cmd_validate_release_artifacts, cmd_build_deb
from tools.release.packaging import DebianBuildResult, DebianPublicationResult


class CliBuildDebParsingTests(unittest.TestCase):
    def test_build_deb_parser_defaults(self) -> None:
        parser = cli.build_parser()
        parsed = parser.parse_args(["build-deb"])

        self.assertEqual(parsed.command, "build-deb")
        self.assertEqual(parsed.output_dir, "release")
        self.assertFalse(parsed.dry_run)
        self.assertTrue(callable(parsed.func))

    def test_build_deb_parser_flags(self) -> None:
        parser = cli.build_parser()
        parsed = parser.parse_args(["build-deb", "--output-dir", "/tmp/out", "--dry-run"])

        self.assertEqual(parsed.command, "build-deb")
        self.assertEqual(parsed.output_dir, "/tmp/out")
        self.assertTrue(parsed.dry_run)

    def test_validate_release_artifacts_parser_flags(self) -> None:
        parser = cli.build_parser()
        parsed = parser.parse_args(["validate-release-artifacts", "--output-dir", "/tmp/release", "--skip-changelog"])

        self.assertEqual(parsed.command, "validate-release-artifacts")
        self.assertEqual(parsed.output_dir, "/tmp/release")
        self.assertTrue(parsed.skip_changelog)
        self.assertTrue(callable(parsed.func))

    def test_publish_deb_parser_flags(self) -> None:
        parser = cli.build_parser()
        parsed = parser.parse_args(
            [
                "publish-deb",
                "--output-dir",
                "/tmp/release",
                "--mode",
                "nexus",
                "--nexus-repo-url",
                "https://nexus.example/repository/vaulthalla-debian",
                "--nexus-user",
                "ci-user",
                "--nexus-pass",
                "secret",
                "--dry-run",
                "--require-enabled",
            ]
        )

        self.assertEqual(parsed.command, "publish-deb")
        self.assertEqual(parsed.output_dir, "/tmp/release")
        self.assertEqual(parsed.mode, "nexus")
        self.assertEqual(parsed.nexus_repo_url, "https://nexus.example/repository/vaulthalla-debian")
        self.assertEqual(parsed.nexus_user, "ci-user")
        self.assertEqual(parsed.nexus_pass, "secret")
        self.assertTrue(parsed.dry_run)
        self.assertTrue(parsed.require_enabled)
        self.assertTrue(callable(parsed.func))


class CliBuildDebCommandTests(unittest.TestCase):
    @staticmethod
    def _args(*, repo_root: str = ".", output_dir: str = "release", dry_run: bool = False) -> argparse.Namespace:
        return argparse.Namespace(repo_root=repo_root, output_dir=output_dir, dry_run=dry_run)

    def test_cmd_build_deb_dry_run_prints_plan(self) -> None:
        args = self._args(dry_run=True)
        out = StringIO()
        fake_result = DebianBuildResult(
            repo_root=Path("/tmp/repo"),
            output_dir=Path("/tmp/repo/release"),
            command=("dpkg-buildpackage", "-us", "-uc", "-b"),
            dry_run=True,
            package_name="vaulthalla",
            package_version="1.2.3-1",
            artifacts=(),
            build_log=None,
        )

        with (
            patch("tools.release.cli_tools.commands.debian.build_debian_package", return_value=fake_result) as build_deb,
            redirect_stdout(out),
        ):
            rc = cmd_build_deb(args)

        self.assertEqual(rc, 0)
        build_deb.assert_called_once()
        rendered = out.getvalue()
        self.assertIn("Debian build plan", rendered)
        self.assertIn("Dry run only", rendered)

    def test_cmd_build_deb_success_prints_artifacts(self) -> None:
        args = self._args(dry_run=False)
        out = StringIO()
        fake_result = DebianBuildResult(
            repo_root=Path("/tmp/repo"),
            output_dir=Path("/tmp/repo/release"),
            command=("dpkg-buildpackage", "-us", "-uc", "-b"),
            dry_run=False,
            package_name="vaulthalla",
            package_version="1.2.3-1",
            artifacts=(Path("/tmp/repo/release/vaulthalla_1.2.3-1_amd64.deb"),),
            build_log=Path("/tmp/repo/release/build-deb.log"),
        )

        with (
            patch("tools.release.cli_tools.commands.debian.build_debian_package", return_value=fake_result),
            redirect_stdout(out),
        ):
            rc = cmd_build_deb(args)

        self.assertEqual(rc, 0)
        rendered = out.getvalue()
        self.assertIn("Artifacts", rendered)
        self.assertIn("vaulthalla_1.2.3-1_amd64.deb", rendered)
        self.assertIn("build-deb.log", rendered)

    def test_main_reports_build_deb_error_cleanly(self) -> None:
        err = StringIO()
        with (
            patch("tools.release.cli_tools.commands.debian.build_debian_package", side_effect=ValueError("build failed")),
            patch("sys.stderr", new=err),
        ):
            rc = cli.main(["build-deb"])

        self.assertEqual(rc, 1)
        self.assertIn("ERROR: build failed", err.getvalue())

    def test_validate_release_artifacts_command_prints_summary(self) -> None:
        args = argparse.Namespace(repo_root=".", output_dir="release", skip_changelog=False)
        out = StringIO()

        fake_result = type(
            "_Validation",
            (),
            {
                "output_dir": Path("/tmp/repo/release"),
                "debian_artifacts": (Path("/tmp/repo/release/pkg.deb"),),
                "web_artifacts": (Path("/tmp/repo/release/web.tar.gz"),),
                "changelog_artifacts": (
                    Path("/tmp/repo/release/changelog.release.md"),
                    Path("/tmp/repo/release/changelog.raw.md"),
                    Path("/tmp/repo/release/changelog.payload.json"),
                ),
            },
        )()

        with (
            patch("tools.release.cli_tools.commands.debian.validate_release_artifacts", return_value=fake_result) as validate,
            redirect_stdout(out),
        ):
            rc = cmd_validate_release_artifacts(args)

        self.assertEqual(rc, 0)
        validate.assert_called_once()
        rendered = out.getvalue()
        self.assertIn("Release artifact validation", rendered)
        self.assertIn("Status:            OK", rendered)

    def test_publish_deb_command_reports_skipped_when_disabled(self) -> None:
        args = argparse.Namespace(
            repo_root=".",
            output_dir="release",
            mode="disabled",
            nexus_repo_url=None,
            nexus_user=None,
            nexus_pass=None,
            dry_run=False,
            require_enabled=False,
        )
        out = StringIO()
        fake_settings = type(
            "_Settings",
            (),
            {
                "mode": "disabled",
                "nexus_repo_url": "",
                "nexus_user": "",
                "nexus_password": "",
            },
        )()
        fake_result = DebianPublicationResult(
            output_dir=Path("/tmp/repo/release"),
            mode="disabled",
            enabled=False,
            dry_run=False,
            artifacts=(Path("/tmp/repo/release/vaulthalla_1.2.3-1_amd64.deb"),),
            target_urls=(),
            skipped_reason="Publication mode is disabled.",
        )

        with (
            patch(
                "tools.release.cli_tools.commands.debian.resolve_debian_publication_settings",
                return_value=fake_settings,
            ),
            patch(
                "tools.release.cli_tools.commands.debian.publish_debian_artifacts",
                return_value=fake_result,
            ) as publish,
            redirect_stdout(out),
        ):
            rc = cmd_publish_deb(args)

        self.assertEqual(rc, 0)
        publish.assert_called_once()
        kwargs = publish.call_args.kwargs
        self.assertEqual(kwargs["settings"], fake_settings)
        self.assertEqual(kwargs["dry_run"], False)
        self.assertEqual(kwargs["require_enabled"], False)
        self.assertIsInstance(kwargs["output_dir"], Path)
        self.assertEqual(kwargs["output_dir"].name, "release")
        rendered = out.getvalue()
        self.assertIn("Debian publication", rendered)
        self.assertIn("Publication required: no", rendered)
        self.assertIn("Status:            SKIPPED", rendered)
        self.assertIn("Publication mode is disabled.", rendered)

    def test_publish_deb_command_reports_published_targets(self) -> None:
        args = argparse.Namespace(
            repo_root=".",
            output_dir="release",
            mode="nexus",
            nexus_repo_url=None,
            nexus_user=None,
            nexus_pass=None,
            dry_run=False,
            require_enabled=True,
        )
        out = StringIO()
        fake_settings = type(
            "_Settings",
            (),
            {
                "mode": "nexus",
                "nexus_repo_url": "https://nexus.example/repository/vaulthalla-debian",
                "nexus_user": "ci-user",
                "nexus_password": "secret",
            },
        )()
        fake_result = DebianPublicationResult(
            output_dir=Path("/tmp/repo/release"),
            mode="nexus",
            enabled=True,
            dry_run=False,
            artifacts=(Path("/tmp/repo/release/vaulthalla_1.2.3-1_amd64.deb"),),
            target_urls=("https://nexus.example/repository/vaulthalla-debian",),
            skipped_reason=None,
        )

        with (
            patch("tools.release.cli_tools.commands.debian.resolve_debian_publication_settings", return_value=fake_settings),
            patch("tools.release.cli_tools.commands.debian.publish_debian_artifacts", return_value=fake_result) as publish,
            redirect_stdout(out),
        ):
            rc = cmd_publish_deb(args)

        self.assertEqual(rc, 0)
        publish.assert_called_once()
        kwargs = publish.call_args.kwargs
        self.assertEqual(kwargs["settings"], fake_settings)
        self.assertEqual(kwargs["dry_run"], False)
        self.assertEqual(kwargs["require_enabled"], True)
        self.assertIsInstance(kwargs["output_dir"], Path)
        self.assertEqual(kwargs["output_dir"].name, "release")
        rendered = out.getvalue()
        self.assertIn("Publication required: yes", rendered)
        self.assertIn("Mode:              nexus", rendered)
        self.assertIn("Target URLs:       1", rendered)
        self.assertIn("Status:            PUBLISHED", rendered)

    def test_publish_deb_required_disabled_errors_cleanly(self) -> None:
        err = StringIO()
        with (
            patch(
                "tools.release.cli_tools.commands.debian.resolve_debian_publication_settings",
                return_value=type(
                    "_Settings",
                    (),
                    {
                        "mode": "disabled",
                        "nexus_repo_url": "",
                        "nexus_user": "",
                        "nexus_password": "",
                    },
                )(),
            ),
            patch(
                "tools.release.cli_tools.commands.debian.publish_debian_artifacts",
                side_effect=ValueError("Debian publication is required for this run, but RELEASE_PUBLISH_MODE is disabled."),
            ),
            patch("sys.stderr", new=err),
        ):
            rc = cli.main(["publish-deb", "--require-enabled", "--output-dir", "/tmp/release"])

        self.assertEqual(rc, 1)
        self.assertIn("publication is required", err.getvalue().lower())


if __name__ == "__main__":
    unittest.main()
