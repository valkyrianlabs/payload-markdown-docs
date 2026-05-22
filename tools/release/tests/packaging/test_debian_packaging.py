from __future__ import annotations

import os
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
    _write(repo_root / "debian" / "changelog", "vaulthalla (1.2.3-1) unstable; urgency=medium\n")
    _write(repo_root / "debian" / "control", "Source: vaulthalla\n")
    _write(repo_root / "debian" / "rules", "#!/usr/bin/make -f\n")
    _write(repo_root / "debian" / "source" / "format", "3.0 (native)\n")
    _write(repo_root / "web" / "package.json", '{"name":"vaulthalla-web","version":"1.2.3"}\n')


def _make_web_build_outputs(repo_root: Path) -> None:
    _write(repo_root / "web" / ".next" / "standalone" / "server.js", "console.log('ok')\n")
    _write(repo_root / "web" / ".next" / "static" / "chunks" / "main.js", "chunk\n")
    _write(repo_root / "web" / "public" / "favicon.ico", "ico\n")


def _make_broken_standalone_symlink(repo_root: Path) -> None:
    link_path = repo_root / "web" / ".next" / "standalone" / "node_modules" / ".pnpm" / "node_modules" / "semver"
    link_path.parent.mkdir(parents=True, exist_ok=True)
    link_path.symlink_to(
        repo_root / "web" / ".next" / "standalone" / "node_modules" / ".pnpm" / "semver@0.0.0" / "node_modules" / "semver"
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
            _write(repo_root / "debian" / "changelog", "vaulthalla (1.2.3-1) unstable; urgency=medium\n")

            with self.assertRaisesRegex(ValueError, "prerequisites are missing"):
                with patch(
                    "tools.release.packaging.debian.require_synced_release_state",
                    return_value=_synced_state(repo_root),
                ):
                    _ = build_debian_package(repo_root=repo_root, dry_run=True)

    def test_missing_web_prerequisite_fails(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir()
            _write(repo_root / "debian" / "changelog", "vaulthalla (1.2.3-1) unstable; urgency=medium\n")
            _write(repo_root / "debian" / "control", "Source: vaulthalla\n")
            _write(repo_root / "debian" / "rules", "#!/usr/bin/make -f\n")
            _write(repo_root / "debian" / "source" / "format", "3.0 (native)\n")

            with self.assertRaisesRegex(ValueError, "Web packaging prerequisites are missing"):
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

            # dpkg-buildpackage outputs artifacts in repo_root.parent by default.
            for filename in (
                "vaulthalla_1.2.3-1_amd64.deb",
                "vaulthalla_1.2.3-1_amd64.buildinfo",
                "vaulthalla_1.2.3-1_amd64.changes",
            ):
                (parent / filename).write_text("artifact\n", encoding="utf-8")
            _make_web_build_outputs(repo_root)

            web_install = subprocess.CompletedProcess(
                args=["pnpm", "install", "--frozen-lockfile"],
                returncode=0,
                stdout="install ok\n",
                stderr="",
            )
            web_build = subprocess.CompletedProcess(
                args=["pnpm", "build"],
                returncode=0,
                stdout="build web ok\n",
                stderr="",
            )
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
                patch(
                    "tools.release.packaging.debian.subprocess.run",
                    side_effect=[web_install, web_build, deb_build],
                ),
            ):
                result = build_debian_package(repo_root=repo_root)

            artifact_names = sorted(path.name for path in result.artifacts)
            self.assertEqual(
                artifact_names,
                sorted(
                    [
                        "vaulthalla-web_1.2.3-1_next-standalone.tar.gz",
                        "vaulthalla_1.2.3-1_amd64.buildinfo",
                        "vaulthalla_1.2.3-1_amd64.changes",
                        "vaulthalla_1.2.3-1_amd64.deb",
                    ]
                ),
            )
            self.assertIsNotNone(result.web_artifact)
            assert result.web_artifact is not None
            self.assertEqual(result.web_artifact.name, "vaulthalla-web_1.2.3-1_next-standalone.tar.gz")
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
            _make_web_build_outputs(repo_root)

            web_install = subprocess.CompletedProcess(
                args=["pnpm", "install", "--frozen-lockfile"],
                returncode=0,
                stdout="install ok\n",
                stderr="",
            )
            web_build = subprocess.CompletedProcess(
                args=["pnpm", "build"],
                returncode=0,
                stdout="build web ok\n",
                stderr="",
            )
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
                    patch(
                        "tools.release.packaging.debian.subprocess.run",
                        side_effect=[web_install, web_build, deb_build],
                    ),
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

    def test_web_build_failure_raises_and_writes_log(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir()
            _make_repo_layout(repo_root)
            output_dir = repo_root / "release"

            web_install = subprocess.CompletedProcess(
                args=["pnpm", "install", "--frozen-lockfile"],
                returncode=0,
                stdout="install ok\n",
                stderr="",
            )
            web_build = subprocess.CompletedProcess(
                args=["pnpm", "build"],
                returncode=1,
                stdout="",
                stderr="next build failed",
            )

            with self.assertRaisesRegex(ValueError, "Web build failed with exit code 1"):
                with (
                    patch(
                        "tools.release.packaging.debian.require_synced_release_state",
                        return_value=_synced_state(repo_root),
                    ),
                    patch(
                        "tools.release.packaging.debian.shutil.which",
                        side_effect=lambda tool: f"/usr/bin/{tool}",
                    ),
                    patch(
                        "tools.release.packaging.debian.subprocess.run",
                        side_effect=[web_install, web_build],
                    ),
                ):
                    _ = build_debian_package(repo_root=repo_root, output_dir=output_dir)

            self.assertTrue((output_dir / "build-deb.log").is_file())

    def test_standalone_packaging_preserves_symlinks_and_handles_missing_link_targets(self) -> None:
        if os.name == "nt":
            self.skipTest("symlink semantics differ on Windows runners")

        with TemporaryDirectory() as temp_dir:
            parent = Path(temp_dir)
            repo_root = parent / "repo"
            repo_root.mkdir()
            _make_repo_layout(repo_root)
            _make_web_build_outputs(repo_root)
            _make_broken_standalone_symlink(repo_root)

            for filename in ("vaulthalla_1.2.3-1_amd64.deb",):
                (parent / filename).write_text("artifact\n", encoding="utf-8")

            web_install = subprocess.CompletedProcess(
                args=["pnpm", "install", "--frozen-lockfile"],
                returncode=0,
                stdout="install ok\n",
                stderr="",
            )
            web_build = subprocess.CompletedProcess(
                args=["pnpm", "build"],
                returncode=0,
                stdout="build web ok\n",
                stderr="",
            )
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
                patch(
                    "tools.release.packaging.debian.subprocess.run",
                    side_effect=[web_install, web_build, deb_build],
                ),
            ):
                result = build_debian_package(repo_root=repo_root)

            self.assertIsNotNone(result.web_artifact)
            assert result.web_artifact is not None
            self.assertTrue(result.web_artifact.is_file())


if __name__ == "__main__":
    unittest.main()
