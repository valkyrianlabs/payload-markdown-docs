from __future__ import annotations

import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from tools.release.packaging.publication import (
    DebianPublicationSettings,
    _upload_file_to_nexus_with_curl,
    publish_debian_artifacts,
    resolve_debian_publication_settings,
    select_debian_publication_artifacts,
)


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


class DebianPublicationSettingsTests(unittest.TestCase):
    def test_settings_default_to_disabled(self) -> None:
        settings = resolve_debian_publication_settings(env={})
        self.assertEqual(settings.mode, "disabled")
        self.assertEqual(settings.nexus_repo_url, "")

    def test_settings_fail_when_mode_is_invalid(self) -> None:
        with self.assertRaisesRegex(ValueError, "Unsupported release publication mode"):
            _ = resolve_debian_publication_settings(mode="invalid", env={})

    def test_settings_fail_when_nexus_mode_missing_required_env(self) -> None:
        with self.assertRaisesRegex(ValueError, "NEXUS_REPO_URL, NEXUS_USER, NEXUS_PASS"):
            _ = resolve_debian_publication_settings(mode="nexus", env={})

    def test_settings_fail_when_required_publication_uses_nexus_without_credentials(self) -> None:
        with self.assertRaisesRegex(ValueError, "required Nexus configuration is missing"):
            _ = resolve_debian_publication_settings(
                mode="nexus",
                env={
                    "NEXUS_REPO_URL": "https://nexus.example/repository/vaulthalla-debian",
                    "NEXUS_USER": "",
                    "NEXUS_PASS": "",
                },
            )

    def test_settings_fail_when_nexus_url_is_not_absolute_http(self) -> None:
        with self.assertRaisesRegex(ValueError, "NEXUS_REPO_URL must be an absolute http"):
            _ = resolve_debian_publication_settings(
                mode="nexus",
                env={
                    "NEXUS_REPO_URL": "/relative/path",
                    "NEXUS_USER": "ci-user",
                    "NEXUS_PASS": "secret",
                },
            )


class DebianPublicationTests(unittest.TestCase):
    def _settings_disabled(self) -> DebianPublicationSettings:
        return DebianPublicationSettings(
            mode="disabled",
            nexus_repo_url="",
            nexus_user="",
            nexus_password="",
        )

    def _settings_nexus(self) -> DebianPublicationSettings:
        return DebianPublicationSettings(
            mode="nexus",
            nexus_repo_url="https://nexus.example/repository/vaulthalla-debian",
            nexus_user="ci-user",
            nexus_password="secret",
        )

    def test_select_debian_publication_artifacts_fails_when_no_deb_exists(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)

            with self.assertRaisesRegex(ValueError, "no Debian package artifacts were found"):
                _ = select_debian_publication_artifacts(output_dir=output_dir)

    def test_select_debian_publication_artifacts_only_returns_deb_files(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "vaulthalla_1.2.3-1_amd64.deb", "deb")
            _write(output_dir / "vaulthalla_1.2.3-1_amd64.changes", "changes")
            _write(output_dir / "vaulthalla_1.2.3-1_amd64.buildinfo", "buildinfo")

            artifacts = select_debian_publication_artifacts(output_dir=output_dir)
            self.assertEqual([path.name for path in artifacts], ["vaulthalla_1.2.3-1_amd64.deb"])

    def test_publish_returns_skipped_result_when_disabled(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "vaulthalla_1.2.3-1_amd64.deb", "deb")

            result = publish_debian_artifacts(
                output_dir=output_dir,
                settings=self._settings_disabled(),
            )

            self.assertFalse(result.enabled)
            self.assertEqual(result.mode, "disabled")
            self.assertIn("disabled", result.skipped_reason or "")
            self.assertEqual(len(result.artifacts), 1)
            self.assertEqual(result.target_urls, ())

    def test_publish_required_fails_when_mode_disabled(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "vaulthalla_1.2.3-1_amd64.deb", "deb")

            with self.assertRaisesRegex(ValueError, "publication is required.*RELEASE_PUBLISH_MODE is disabled"):
                _ = publish_debian_artifacts(
                    output_dir=output_dir,
                    settings=self._settings_disabled(),
                    require_enabled=True,
                )

    def test_publish_disabled_mode_skips_cleanly_when_output_dir_is_missing(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release-missing"
            result = publish_debian_artifacts(
                output_dir=output_dir,
                settings=self._settings_disabled(),
            )

            self.assertFalse(result.enabled)
            self.assertEqual(result.artifacts, ())
            self.assertEqual(result.target_urls, ())

    def test_publish_dry_run_validates_targets_without_upload(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "vaulthalla_1.2.3-1_amd64.deb", "deb")

            upload_calls: list[tuple[Path, str, str, str]] = []

            def _uploader(artifact: Path, target_url: str, username: str, password: str) -> None:
                upload_calls.append((artifact, target_url, username, password))

            result = publish_debian_artifacts(
                output_dir=output_dir,
                settings=self._settings_nexus(),
                dry_run=True,
                uploader=_uploader,
            )

            self.assertTrue(result.enabled)
            self.assertTrue(result.dry_run)
            self.assertEqual(upload_calls, [])
            self.assertEqual(
                result.target_urls,
                ("https://nexus.example/repository/vaulthalla-debian",),
            )

    def test_publish_uploads_all_selected_debs_in_sorted_order(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "vaulthalla_1.2.3-1_arm64.deb", "deb")
            _write(output_dir / "vaulthalla_1.2.3-1_amd64.deb", "deb")

            upload_calls: list[tuple[Path, str, str, str]] = []

            def _uploader(artifact: Path, target_url: str, username: str, password: str) -> None:
                upload_calls.append((artifact, target_url, username, password))

            result = publish_debian_artifacts(
                output_dir=output_dir,
                settings=self._settings_nexus(),
                dry_run=False,
                uploader=_uploader,
            )

            self.assertTrue(result.enabled)
            self.assertFalse(result.dry_run)
            self.assertEqual(len(result.artifacts), 2)
            self.assertEqual(
                [call[0].name for call in upload_calls],
                [
                    "vaulthalla_1.2.3-1_amd64.deb",
                    "vaulthalla_1.2.3-1_arm64.deb",
                ],
            )
            self.assertEqual(
                [call[1] for call in upload_calls],
                [
                    "https://nexus.example/repository/vaulthalla-debian",
                    "https://nexus.example/repository/vaulthalla-debian",
                ],
            )
            self.assertEqual(
                [call[2] for call in upload_calls],
                ["ci-user", "ci-user"],
            )
            self.assertEqual(
                [call[3] for call in upload_calls],
                ["secret", "secret"],
            )

    def test_publish_required_succeeds_with_valid_nexus_config(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "vaulthalla_1.2.3-1_amd64.deb", "deb")

            upload_calls: list[tuple[Path, str, str, str]] = []

            def _uploader(artifact: Path, target_url: str, username: str, password: str) -> None:
                upload_calls.append((artifact, target_url, username, password))

            result = publish_debian_artifacts(
                output_dir=output_dir,
                settings=self._settings_nexus(),
                require_enabled=True,
                uploader=_uploader,
            )

            self.assertTrue(result.enabled)
            self.assertEqual(len(upload_calls), 1)

    def test_publication_target_url_is_not_filename_appended(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "vaulthalla_1.2.3-1_amd64.deb", "deb")

            result = publish_debian_artifacts(
                output_dir=output_dir,
                settings=self._settings_nexus(),
                dry_run=True,
            )

            self.assertEqual(len(result.target_urls), 1)
            self.assertEqual(result.target_urls[0], "https://nexus.example/repository/vaulthalla-debian")
            self.assertNotIn("vaulthalla_1.2.3-1_amd64.deb", result.target_urls[0])

    def test_curl_upload_uses_post_binary_base_url_shape(self) -> None:
        artifact = Path("/tmp/vaulthalla_1.2.3-1_amd64.deb")
        target_url = "https://nexus.example/repository/vaulthalla-debian"

        with patch(
            "tools.release.packaging.publication.subprocess.run",
            return_value=subprocess.CompletedProcess(args=("curl",), returncode=0, stdout="", stderr=""),
        ) as run:
            _upload_file_to_nexus_with_curl(artifact, target_url, "ci-user", "secret")

        run.assert_called_once()
        command = run.call_args.args[0]
        self.assertIn("--data-binary", command)
        self.assertIn(f"@{artifact}", command)
        self.assertIn("Content-Type: multipart/form-data", command)
        self.assertNotIn("--upload-file", command)
        self.assertEqual(command[-1], target_url)

    def test_curl_upload_failure_reports_upload_mode_and_no_append(self) -> None:
        artifact = Path("/tmp/vaulthalla_1.2.3-1_amd64.deb")
        target_url = "https://nexus.example/repository/vaulthalla-debian"

        with (
            patch(
                "tools.release.packaging.publication.subprocess.run",
                return_value=subprocess.CompletedProcess(args=("curl",), returncode=22, stdout="", stderr="HTTP 405"),
            ),
            self.assertRaisesRegex(ValueError, "upload_mode=post-binary-to-base-url, append_filename=no"),
        ):
            _upload_file_to_nexus_with_curl(artifact, target_url, "ci-user", "secret")


if __name__ == "__main__":
    unittest.main()
