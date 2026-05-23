from __future__ import annotations

import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from tools.release.packaging.debian import build_debian_package
from tools.release.version.models import Version
from tools.release.version.validate import ReleasePaths, ReleaseState, VersionReadResult


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _make_repo_layout(repo_root: Path) -> None:
    _write(repo_root / "VERSION", "1.2.3\n")
    _write(repo_root / "meson.build", "project('payload-markdown-docs', 'cpp', version: '1.2.3')\n")
    _write(repo_root / "package.json", '{"name":"@valkyrianlabs/payload-markdown-docs","version":"1.2.3"}\n')
    _write(repo_root / "debian" / "changelog", "pmdocs (1.2.3-1) unstable; urgency=medium\n")
    _write(repo_root / "debian" / "control", "Source: pmdocs\n")
    _write(repo_root / "debian" / "rules", "#!/usr/bin/make -f\n")
    _write(repo_root / "debian" / "source" / "format", "3.0 (quilt)\n")
    _write(
        repo_root / "homebrew" / "Formula" / "pmdocs.rb",
        (
            "class Pmdocs < Formula\n"
            "  url \"https://github.com/valkyrianlabs/payload-markdown-docs/archive/refs/tags/v1.2.3.tar.gz\"\n"
            "  sha256 \"TODO_REPLACE_WITH_RELEASE_ARCHIVE_SHA256\"\n"
            "end\n"
        ),
    )


def _synced_state(repo_root: Path) -> ReleaseState:
    return ReleaseState(
        paths=ReleasePaths.from_repo_root(repo_root),
        versions=VersionReadResult(canonical=Version(1, 2, 3)),
        issues=(),
    )


class DebianPackagingTests(unittest.TestCase):
    def test_dry_run_reports_plan_without_running_build(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir()
            _make_repo_layout(repo_root)

            with (
                patch(
                    "tools.release.packaging.debian.require_synced_release_state",
                    return_value=_synced_state(repo_root),
                ),
                patch("tools.release.packaging.debian.subprocess.run") as run_build,
            ):
                result = build_debian_package(repo_root=repo_root, dry_run=True)

            self.assertTrue(result.dry_run)
            self.assertEqual(result.command, ("dpkg-buildpackage", "-us", "-uc", "-b"))
            self.assertEqual(result.output_dir.resolve(), (repo_root / "release").resolve())
            self.assertEqual(result.package_name, "pmdocs")
            self.assertEqual(result.artifacts, ())
            run_build.assert_not_called()

    def test_unsynced_release_state_fails_clearly(self) -> None:
        with self.assertRaisesRegex(ValueError, "out of sync"):
            with patch(
                "tools.release.packaging.debian.require_synced_release_state",
                side_effect=ValueError("Managed release files are out of sync with VERSION."),
            ):
                _ = build_debian_package(repo_root=".")

    def test_missing_debian_prerequisite_fails(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir()
            _write(repo_root / "debian" / "changelog", "pmdocs (1.2.3-1) unstable; urgency=medium\n")

            with self.assertRaisesRegex(ValueError, "prerequisites are missing"):
                with patch(
                    "tools.release.packaging.debian.require_synced_release_state",
                    return_value=_synced_state(repo_root),
                ):
                    _ = build_debian_package(repo_root=repo_root, dry_run=True)

    def test_successful_build_collects_artifacts_and_writes_log(self) -> None:
        with TemporaryDirectory() as temp_dir:
            parent = Path(temp_dir)
            repo_root = parent / "repo"
            repo_root.mkdir()
            _make_repo_layout(repo_root)

            for filename in (
                "pmdocs_1.2.3-1_amd64.deb",
                "pmdocs_1.2.3-1_amd64.buildinfo",
                "pmdocs_1.2.3-1_amd64.changes",
            ):
                (parent / filename).write_text("artifact\n", encoding="utf-8")

            deb_build = subprocess.CompletedProcess(
                args=["dpkg-buildpackage", "-us", "-uc", "-b"],
                returncode=0,
                stdout="build ok\n",
                stderr="",
            )

            with (
                patch(
                    "tools.release.packaging.debian.require_synced_release_state",
                    return_value=_synced_state(repo_root),
                ),
                patch(
                    "tools.release.packaging.debian.shutil.which",
                    side_effect=lambda tool: f"/usr/bin/{tool}",
                ),
                patch("tools.release.packaging.debian.subprocess.run", return_value=deb_build),
            ):
                result = build_debian_package(repo_root=repo_root)

            artifact_names = sorted(path.name for path in result.artifacts)
            self.assertEqual(
                artifact_names,
                sorted(
                    [
                        "pmdocs_1.2.3-1_amd64.buildinfo",
                        "pmdocs_1.2.3-1_amd64.changes",
                        "pmdocs_1.2.3-1_amd64.deb",
                    ]
                ),
            )
            self.assertIsNone(result.web_artifact)
            self.assertIsNotNone(result.build_log)
            assert result.build_log is not None
            self.assertTrue(result.build_log.is_file())
            self.assertIn("build ok", result.build_log.read_text(encoding="utf-8"))

    def test_build_failure_raises_and_writes_log(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir()
            _make_repo_layout(repo_root)
            output_dir = repo_root / "release"

            deb_build = subprocess.CompletedProcess(
                args=["dpkg-buildpackage", "-us", "-uc", "-b"],
                returncode=2,
                stdout="",
                stderr="dpkg-buildpackage: error: failure",
            )

            with self.assertRaisesRegex(ValueError, "Debian build failed with exit code 2"):
                with (
                    patch(
                        "tools.release.packaging.debian.require_synced_release_state",
                        return_value=_synced_state(repo_root),
                    ),
                    patch(
                        "tools.release.packaging.debian.shutil.which",
                        side_effect=lambda tool: f"/usr/bin/{tool}",
                    ),
                    patch("tools.release.packaging.debian.subprocess.run", return_value=deb_build),
                ):
                    _ = build_debian_package(repo_root=repo_root, output_dir=output_dir)

            self.assertTrue((output_dir / "build-deb.log").is_file())

    def test_missing_build_tool_fails_clearly(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir()
            _make_repo_layout(repo_root)

            with self.assertRaisesRegex(ValueError, "Required build tool `dpkg-buildpackage`"):
                with (
                    patch(
                        "tools.release.packaging.debian.require_synced_release_state",
                        return_value=_synced_state(repo_root),
                    ),
                    patch("tools.release.packaging.debian.shutil.which", return_value=None),
                ):
                    _ = build_debian_package(repo_root=repo_root)


if __name__ == "__main__":
    unittest.main()
