from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from tools.release import cli


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _make_repo(repo_root: Path, *, canonical: str, debian_full: str) -> None:
    _write(repo_root / "VERSION", f"{canonical}\n")
    _write(
        repo_root / "meson.build",
        (
            "project('vaulthalla', 'cpp',\n"
            f"  version: '{canonical}'\n"
            ")\n"
        ),
    )
    _write(
        repo_root / "web" / "package.json",
        (
            "{\n"
            "  \"name\": \"vaulthalla-web\",\n"
            f"  \"version\": \"{canonical}\"\n"
            "}\n"
        ),
    )
    _write(
        repo_root / "debian" / "changelog",
        (
            f"vaulthalla ({debian_full}) unstable; urgency=medium\n\n"
            "  * test entry\n\n"
            " -- Test User <test@example.com>  Sun, 19 Apr 2026 00:00:00 +0000\n"
        ),
    )


def _seed_scratch(repo_root: Path) -> None:
    _write(repo_root / ".changelog_scratch" / "changelog.draft.md", "# draft\n")
    _write(repo_root / ".changelog_scratch" / "changelog.raw.md", "# raw\n")


def _run_cli(argv: list[str]) -> tuple[int, str, str]:
    out = StringIO()
    err = StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        rc = cli.main(argv)
    return rc, out.getvalue(), err.getvalue()


class CliVersionSyncTests(unittest.TestCase):
    def test_sync_no_change_when_only_debian_revision_suffix_differs_from_version_string(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir(parents=True, exist_ok=True)
            _make_repo(repo_root, canonical="0.29.0", debian_full="0.29.0-1")

            before = (repo_root / "debian" / "changelog").read_text(encoding="utf-8")
            rc_sync, out_sync, err_sync = _run_cli(["--repo-root", str(repo_root), "sync"])
            self.assertEqual(rc_sync, 0, msg=err_sync or out_sync)
            after = (repo_root / "debian" / "changelog").read_text(encoding="utf-8")

            self.assertEqual(before, after)

    def test_sync_updates_debian_upstream_and_preserves_revision(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir(parents=True, exist_ok=True)
            _make_repo(repo_root, canonical="0.28.1", debian_full="0.28.0-7")

            rc_check, _, _ = _run_cli(["--repo-root", str(repo_root), "check"])
            self.assertEqual(rc_check, 1)

            rc_sync, out_sync, err_sync = _run_cli(["--repo-root", str(repo_root), "sync"])
            self.assertEqual(rc_sync, 0, msg=err_sync or out_sync)

            header = (repo_root / "debian" / "changelog").read_text(encoding="utf-8").splitlines()[0]
            self.assertEqual(header, "vaulthalla (0.28.1-7) unstable; urgency=medium")

            rc_check_after, _, _ = _run_cli(["--repo-root", str(repo_root), "check"])
            self.assertEqual(rc_check_after, 0)

    def test_sync_then_bump_minor_succeeds(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir(parents=True, exist_ok=True)
            _make_repo(repo_root, canonical="0.29.0", debian_full="0.29.0-1")

            rc_sync, out_sync, err_sync = _run_cli(["--repo-root", str(repo_root), "sync"])
            self.assertEqual(rc_sync, 0, msg=err_sync or out_sync)

            rc_bump, out_bump, err_bump = _run_cli(["--repo-root", str(repo_root), "bump", "minor"])
            self.assertEqual(rc_bump, 0, msg=err_bump or out_bump)
            self.assertIn("Target version:    0.30.0", out_bump)

            version_value = (repo_root / "VERSION").read_text(encoding="utf-8").strip()
            header = (repo_root / "debian" / "changelog").read_text(encoding="utf-8").splitlines()[0]
            self.assertEqual(version_value, "0.30.0")
            self.assertEqual(header, "vaulthalla (0.30.0-1) unstable; urgency=medium")

    def test_bump_clears_changelog_scratch_artifacts(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir(parents=True, exist_ok=True)
            _make_repo(repo_root, canonical="0.29.0", debian_full="0.29.0-1")
            _seed_scratch(repo_root)

            self.assertTrue((repo_root / ".changelog_scratch" / "changelog.draft.md").is_file())
            rc_bump, out_bump, err_bump = _run_cli(["--repo-root", str(repo_root), "bump", "patch"])
            self.assertEqual(rc_bump, 0, msg=err_bump or out_bump)
            self.assertFalse((repo_root / ".changelog_scratch").exists())

    def test_sync_clears_changelog_scratch_when_upstream_version_changes(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir(parents=True, exist_ok=True)
            _make_repo(repo_root, canonical="0.29.1", debian_full="0.29.0-1")
            _seed_scratch(repo_root)

            rc_sync, out_sync, err_sync = _run_cli(["--repo-root", str(repo_root), "sync"])
            self.assertEqual(rc_sync, 0, msg=err_sync or out_sync)
            self.assertFalse((repo_root / ".changelog_scratch").exists())

    def test_sync_can_override_debian_revision(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir(parents=True, exist_ok=True)
            _make_repo(repo_root, canonical="0.28.1", debian_full="0.28.0-5")

            rc_sync, out_sync, err_sync = _run_cli(
                ["--repo-root", str(repo_root), "sync", "--debian-revision", "3"]
            )
            self.assertEqual(rc_sync, 0, msg=err_sync or out_sync)

            header = (repo_root / "debian" / "changelog").read_text(encoding="utf-8").splitlines()[0]
            self.assertEqual(header, "vaulthalla (0.28.1-3) unstable; urgency=medium")

    def test_check_passes_when_upstream_matches_and_revision_differs(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir(parents=True, exist_ok=True)
            _make_repo(repo_root, canonical="0.29.0", debian_full="0.29.0-9")

            rc_check, out_check, err_check = _run_cli(["--repo-root", str(repo_root), "check"])
            self.assertEqual(rc_check, 0, msg=err_check or out_check)
            self.assertIn("Status:            OK", out_check)

    def test_check_fails_when_debian_upstream_mismatch_exists(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir(parents=True, exist_ok=True)
            _make_repo(repo_root, canonical="0.29.1", debian_full="0.29.0-1")

            rc_check, out_check, _ = _run_cli(["--repo-root", str(repo_root), "check"])
            self.assertEqual(rc_check, 1)
            self.assertIn("[upstream mismatch]", out_check)

    def test_regression_guard_validation_does_not_compare_full_debian_version_string(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir(parents=True, exist_ok=True)
            _make_repo(repo_root, canonical="0.29.0", debian_full="0.29.0-42")

            rc_check, out_check, err_check = _run_cli(["--repo-root", str(repo_root), "check"])
            self.assertEqual(rc_check, 0, msg=err_check or out_check)
            self.assertNotIn("[upstream mismatch]", out_check)


if __name__ == "__main__":
    unittest.main()
