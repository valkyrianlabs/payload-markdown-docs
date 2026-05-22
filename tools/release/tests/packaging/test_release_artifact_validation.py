from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from tools.release.packaging.debian import validate_release_artifacts


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


class ReleaseArtifactValidationTests(unittest.TestCase):
    def _valid_debian_members(self) -> set[str]:
        return {
            "usr/bin/vaulthalla-server",
            "usr/bin/vaulthalla-cli",
            "usr/bin/vaulthalla",
            "usr/bin/vh",
            "etc/vaulthalla/config.yaml",
            "etc/vaulthalla/config_template.yaml.in",
            "lib/systemd/system/vaulthalla.service",
            "lib/systemd/system/vaulthalla-cli.service",
            "lib/systemd/system/vaulthalla-cli.socket",
            "lib/systemd/system/vaulthalla-web.service",
            "lib/systemd/system/vaulthalla-swtpm.service",
            "usr/share/doc/vaulthalla/LICENSE.gz",
            "usr/share/doc/vaulthalla/copyright",
            "usr/share/vaulthalla/nginx/vaulthalla",
            "usr/share/vaulthalla/psql/000_schema.sql",
            "usr/share/vaulthalla-web/server.js",
            "usr/share/vaulthalla-web/.next/static/chunks/main.js",
            "usr/share/man/man1/vh.1.gz",
            "usr/lib/x86_64-linux-gnu/libvaulthalla.a",
            "usr/lib/x86_64-linux-gnu/libvhusage.a",
            "usr/lib/x86_64-linux-gnu/udev/rules.d/60-vaulthalla-tpm.rules",
            "usr/lib/x86_64-linux-gnu/tmpfiles.d/vaulthalla.conf",
        }

    def _write_valid_web_archive(self, path: Path) -> None:
        import tarfile

        with tarfile.open(path, "w:gz") as tar:
            from io import BytesIO

            root = tarfile.TarInfo("vaulthalla-web/")
            root.type = tarfile.DIRTYPE
            tar.addfile(root)

            server = tarfile.TarInfo("vaulthalla-web/server.js")
            payload = b"console.log('ok')\n"
            server.size = len(payload)
            tar.addfile(server, BytesIO(payload))

            static_dir = tarfile.TarInfo("vaulthalla-web/.next/static/")
            static_dir.type = tarfile.DIRTYPE
            tar.addfile(static_dir)

            static = tarfile.TarInfo("vaulthalla-web/.next/static/chunks/main.js")
            static_payload = b"chunk\n"
            static.size = len(static_payload)
            tar.addfile(static, BytesIO(static_payload))

    def test_validation_passes_when_expected_artifacts_exist(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "vaulthalla_1.2.3-1_amd64.deb", "deb")
            self._write_valid_web_archive(output_dir / "vaulthalla-web_1.2.3-1_next-standalone.tar.gz")
            _write(output_dir / "changelog.release.md", "# release")
            _write(output_dir / "changelog.raw.md", "# raw")
            _write(output_dir / "changelog.payload.json", '{"schema_version":"x"}')
            _write(output_dir / "changelog.semantic_payload.json", '{"schema_version":"semantic"}')
            _write(output_dir / "changelog.context.json", '{"schema_version":"context"}')

            with patch(
                "tools.release.packaging.debian._read_debian_package_members",
                return_value=self._valid_debian_members(),
            ):
                result = validate_release_artifacts(output_dir=output_dir, require_changelog=True)

            self.assertEqual(result.output_dir, output_dir.resolve())
            self.assertEqual(len(result.debian_artifacts), 1)
            self.assertEqual(len(result.web_artifacts), 1)
            self.assertEqual(len(result.changelog_artifacts), 5)

    def test_validation_reports_missing_outputs_clearly(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "changelog.raw.md", "# raw")

            with self.assertRaisesRegex(ValueError, "Missing expected outputs"):
                _ = validate_release_artifacts(output_dir=output_dir, require_changelog=True)

    def test_validation_can_skip_changelog_checks(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "vaulthalla_1.2.3-1_amd64.deb", "deb")
            self._write_valid_web_archive(output_dir / "vaulthalla-web_1.2.3-1_next-standalone.tar.gz")

            with patch(
                "tools.release.packaging.debian._read_debian_package_members",
                return_value=self._valid_debian_members(),
            ):
                result = validate_release_artifacts(output_dir=output_dir, require_changelog=False)
            self.assertEqual(len(result.debian_artifacts), 1)
            self.assertEqual(len(result.web_artifacts), 1)

    def test_validation_fails_when_debian_package_missing_required_payload(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "vaulthalla_1.2.3-1_amd64.deb", "deb")
            self._write_valid_web_archive(output_dir / "vaulthalla-web_1.2.3-1_next-standalone.tar.gz")
            _write(output_dir / "changelog.release.md", "# release")
            _write(output_dir / "changelog.raw.md", "# raw")
            _write(output_dir / "changelog.payload.json", '{"schema_version":"x"}')
            _write(output_dir / "changelog.semantic_payload.json", '{"schema_version":"semantic"}')
            _write(output_dir / "changelog.context.json", '{"schema_version":"context"}')

            members = self._valid_debian_members()
            members.remove("usr/bin/vaulthalla-cli")
            with (
                patch("tools.release.packaging.debian._read_debian_package_members", return_value=members),
                self.assertRaisesRegex(ValueError, r"\[debian package\].*vaulthalla-cli"),
            ):
                _ = validate_release_artifacts(output_dir=output_dir, require_changelog=True)

    def test_validation_fails_when_web_archive_missing_runtime_entry(self) -> None:
        import tarfile
        from io import BytesIO

        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "vaulthalla_1.2.3-1_amd64.deb", "deb")
            bad_archive = output_dir / "vaulthalla-web_1.2.3-1_next-standalone.tar.gz"
            with tarfile.open(bad_archive, "w:gz") as tar:
                root = tarfile.TarInfo("vaulthalla-web/")
                root.type = tarfile.DIRTYPE
                tar.addfile(root)
                static = tarfile.TarInfo("vaulthalla-web/.next/static/chunks/main.js")
                payload = b"chunk\n"
                static.size = len(payload)
                tar.addfile(static, BytesIO(payload))
            _write(output_dir / "changelog.release.md", "# release")
            _write(output_dir / "changelog.raw.md", "# raw")
            _write(output_dir / "changelog.payload.json", '{"schema_version":"x"}')
            _write(output_dir / "changelog.semantic_payload.json", '{"schema_version":"semantic"}')
            _write(output_dir / "changelog.context.json", '{"schema_version":"context"}')

            with (
                patch(
                    "tools.release.packaging.debian._read_debian_package_members",
                    return_value=self._valid_debian_members(),
                ),
                self.assertRaisesRegex(ValueError, r"\[web artifact\].*server\.js"),
            ):
                _ = validate_release_artifacts(output_dir=output_dir, require_changelog=True)

    def test_validation_accepts_uncompressed_debian_license_doc_too(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "vaulthalla_1.2.3-1_amd64.deb", "deb")
            self._write_valid_web_archive(output_dir / "vaulthalla-web_1.2.3-1_next-standalone.tar.gz")
            _write(output_dir / "changelog.release.md", "# release")
            _write(output_dir / "changelog.raw.md", "# raw")
            _write(output_dir / "changelog.payload.json", '{"schema_version":"x"}')
            _write(output_dir / "changelog.semantic_payload.json", '{"schema_version":"semantic"}')
            _write(output_dir / "changelog.context.json", '{"schema_version":"context"}')

            members = self._valid_debian_members()
            members.remove("usr/share/doc/vaulthalla/LICENSE.gz")
            members.add("usr/share/doc/vaulthalla/LICENSE")
            with patch("tools.release.packaging.debian._read_debian_package_members", return_value=members):
                result = validate_release_artifacts(output_dir=output_dir, require_changelog=True)

            self.assertEqual(len(result.debian_artifacts), 1)


if __name__ == "__main__":
    unittest.main()
