from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from tools.release.packaging.homebrew import prepare_homebrew_formula


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _make_repo_layout(repo_root: Path) -> None:
    _write(repo_root / "VERSION", "1.2.3\n")
    _write(repo_root / "meson.build", "project('payload-markdown-docs', 'cpp', version: '1.2.3')\n")
    _write(repo_root / "package.json", '{"name":"@valkyrianlabs/payload-markdown-docs","version":"1.2.3"}\n')
    _write(repo_root / "debian" / "changelog", "pmdocs (1.2.3-1) unstable; urgency=medium\n")
    _write(
        repo_root / "homebrew" / "Formula" / "pmdocs.rb",
        (
            "class Pmdocs < Formula\n"
            "  url \"https://github.com/valkyrianlabs/payload-markdown-docs/archive/refs/tags/v1.2.3.tar.gz\"\n"
            "  sha256 \"TODO_REPLACE_WITH_RELEASE_ARCHIVE_SHA256\"\n"
            "end\n"
        ),
    )


class HomebrewPackagingTests(unittest.TestCase):
    def test_source_formula_uses_homebrew_dependency_order(self) -> None:
        repo_root = Path(__file__).resolve().parents[4]
        formula = (repo_root / "homebrew" / "Formula" / "pmdocs.rb").read_text(encoding="utf-8")

        depends_lines = [
            line.strip()
            for line in formula.splitlines()
            if line.strip().startswith("depends_on ")
        ]

        self.assertEqual(
            depends_lines,
            [
                'depends_on "cli11" => :build',
                'depends_on "cmake" => :build',
                'depends_on "doctest" => :build',
                'depends_on "meson" => :build',
                'depends_on "ninja" => :build',
                'depends_on "nlohmann-json" => :build',
                'depends_on "pkgconf" => :build',
                'depends_on "curl"',
                'depends_on "openssl@3"',
            ],
        )

    def test_prepare_formula_writes_sha_and_stages_formula(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir()
            _make_repo_layout(repo_root)

            result = prepare_homebrew_formula(
                repo_root=repo_root,
                output_dir="release",
                sha256="a" * 64,
            )

            formula = (repo_root / "homebrew" / "Formula" / "pmdocs.rb").read_text(encoding="utf-8")
            self.assertIn('sha256 "' + "a" * 64 + '"', formula)
            self.assertIsNotNone(result.staged_formula)
            assert result.staged_formula is not None
            self.assertTrue(result.staged_formula.is_file())

    def test_prepare_formula_dry_run_does_not_replace_placeholder(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir()
            _make_repo_layout(repo_root)

            result = prepare_homebrew_formula(
                repo_root=repo_root,
                output_dir="release",
                dry_run=True,
            )

            formula = (repo_root / "homebrew" / "Formula" / "pmdocs.rb").read_text(encoding="utf-8")
            self.assertIn("TODO_REPLACE_WITH_RELEASE_ARCHIVE_SHA256", formula)
            self.assertTrue(result.dry_run)

    def test_prepare_formula_requires_real_sha_for_write(self) -> None:
        with TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir) / "repo"
            repo_root.mkdir()
            _make_repo_layout(repo_root)

            with self.assertRaisesRegex(ValueError, "sha256 is still a placeholder"):
                _ = prepare_homebrew_formula(repo_root=repo_root, output_dir="release")


if __name__ == "__main__":
    unittest.main()
