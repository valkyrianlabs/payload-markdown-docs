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
            "usr/bin/pmdocs",
            "usr/share/doc/pmdocs/copyright",
            "usr/share/pmdocs/skills/payload-markdown-docs/codex/SKILL.md",
            "usr/share/pmdocs/skills/payload-markdown-docs/claude/SKILL.md",
            "usr/share/pmdocs/skills/payload-markdown/codex/SKILL.md",
            "usr/share/pmdocs/skills/payload-markdown/claude/SKILL.md",
        }

    def _write_homebrew_formula(self, path: Path, *, sha: str | None = None) -> None:
        _write(
            path,
            (
                "class Pmdocs < Formula\n"
                "  url \"https://github.com/valkyrianlabs/payload-markdown-docs/archive/refs/tags/v1.2.3.tar.gz\"\n"
                f"  sha256 \"{sha or 'a' * 64}\"\n"
                "end\n"
            ),
        )

    def _write_changelog_artifacts(self, output_dir: Path) -> None:
        _write(output_dir / "changelog.release.md", "# release")
        _write(output_dir / "changelog.raw.md", "# raw")
        _write(output_dir / "changelog.payload.json", '{"schema_version":"x"}')
        _write(output_dir / "changelog.semantic_payload.json", '{"schema_version":"semantic"}')
        _write(output_dir / "changelog.context.json", '{"schema_version":"context"}')

    def test_validation_passes_when_expected_artifacts_exist(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "pmdocs_1.2.3-1_amd64.deb", "deb")
            self._write_homebrew_formula(output_dir / "homebrew" / "Formula" / "pmdocs.rb")
            self._write_changelog_artifacts(output_dir)

            with patch(
                "tools.release.packaging.debian._read_debian_package_members",
                return_value=self._valid_debian_members(),
            ):
                result = validate_release_artifacts(
                    output_dir=output_dir,
                    require_changelog=True,
                    require_homebrew=True,
                )

            self.assertEqual(result.output_dir, output_dir.resolve())
            self.assertEqual(len(result.debian_artifacts), 1)
            self.assertEqual(len(result.homebrew_artifacts), 1)
            self.assertEqual(len(result.changelog_artifacts), 5)

    def test_validation_reports_missing_outputs_clearly(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "changelog.raw.md", "# raw")

            with self.assertRaisesRegex(ValueError, "Missing expected outputs"):
                _ = validate_release_artifacts(
                    output_dir=output_dir,
                    require_changelog=True,
                    require_homebrew=True,
                )

    def test_validation_can_skip_changelog_and_homebrew_checks(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "pmdocs_1.2.3-1_amd64.deb", "deb")
            self._write_homebrew_formula(
                output_dir / "homebrew" / "Formula" / "pmdocs.rb",
                sha="TODO_REPLACE_WITH_RELEASE_ARCHIVE_SHA256",
            )

            with patch(
                "tools.release.packaging.debian._read_debian_package_members",
                return_value=self._valid_debian_members(),
            ):
                result = validate_release_artifacts(
                    output_dir=output_dir,
                    require_changelog=False,
                    require_homebrew=False,
                )
            self.assertEqual(len(result.debian_artifacts), 1)
            self.assertEqual(len(result.homebrew_artifacts), 1)

    def test_validation_fails_when_debian_package_missing_required_payload(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "pmdocs_1.2.3-1_amd64.deb", "deb")
            self._write_homebrew_formula(output_dir / "homebrew" / "Formula" / "pmdocs.rb")
            self._write_changelog_artifacts(output_dir)

            members = self._valid_debian_members()
            members.remove("usr/bin/pmdocs")
            with (
                patch("tools.release.packaging.debian._read_debian_package_members", return_value=members),
                self.assertRaisesRegex(ValueError, r"\[debian package\].*pmdocs"),
            ):
                _ = validate_release_artifacts(
                    output_dir=output_dir,
                    require_changelog=True,
                    require_homebrew=True,
                )

    def test_validation_fails_when_homebrew_sha_placeholder_remains(self) -> None:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "release"
            output_dir.mkdir(parents=True, exist_ok=True)
            _write(output_dir / "pmdocs_1.2.3-1_amd64.deb", "deb")
            self._write_homebrew_formula(
                output_dir / "homebrew" / "Formula" / "pmdocs.rb",
                sha="TODO_REPLACE_WITH_RELEASE_ARCHIVE_SHA256",
            )
            self._write_changelog_artifacts(output_dir)

            with (
                patch(
                    "tools.release.packaging.debian._read_debian_package_members",
                    return_value=self._valid_debian_members(),
                ),
                self.assertRaisesRegex(ValueError, r"\[homebrew formula\].*placeholder"),
            ):
                _ = validate_release_artifacts(
                    output_dir=output_dir,
                    require_changelog=True,
                    require_homebrew=True,
                )


if __name__ == "__main__":
    unittest.main()
