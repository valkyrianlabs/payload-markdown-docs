import unittest

from tools.release.changelog.scoring import is_semantic_noise_path


class SemanticNoisePathTests(unittest.TestCase):
    def test_agent_tooling_paths_are_noise(self) -> None:
        for path in (
            "CLAUDE.md",
            ".claude/context/architecture.md",
            ".claude/skills/verify/scripts/verify.sh",
            ".claude/settings.json",
            ".codex/context/index.md",
            ".codex/scripts/verify.sh",
            ".agents/skills/payload-markdown/SKILL.md",
            "./.claude/scratch/plan.md",
        ):
            with self.subTest(path=path):
                self.assertTrue(is_semantic_noise_path(path))

    def test_changelog_scratch_is_noise(self) -> None:
        self.assertTrue(is_semantic_noise_path(".changelog_scratch/changelog.raw.md"))

    def test_product_paths_are_not_noise(self) -> None:
        for path in (
            "core/include/db/DBPool.hpp",
            "debian/postinst",
            "docs/vaults/sync.md",
            "web/src/stores/fsStore.ts",
            "tools/release/changelog/scoring.py",
            "docs/contributors/ai-assisted-contributions.md",
        ):
            with self.subTest(path=path):
                self.assertFalse(is_semantic_noise_path(path))


if __name__ == "__main__":
    unittest.main()
