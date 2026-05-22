from __future__ import annotations

from pathlib import Path
import unittest

from tools.release.changelog.models import CategoryContext, CommitInfo, DiffSnippet, FileChange, ReleaseContext
from tools.release.changelog.payload import (
    AI_SEMANTIC_PAYLOAD_SCHEMA_VERSION,
    AI_PAYLOAD_SCHEMA_VERSION,
    PayloadBuildConfig,
    PayloadLimits,
    build_ai_payload,
    build_semantic_ai_payload,
    render_ai_payload_json,
    render_semantic_ai_payload_json,
)


FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _load_fixture(name: str) -> str:
    return (FIXTURES_DIR / name).read_text(encoding="utf-8")


def _multi_category_context() -> ReleaseContext:
    debian = CategoryContext(
        name="debian",
        commit_count=1,
        insertions=2,
        deletions=1,
        commits=[
            CommitInfo(
                sha="aaaaaaaabbbbbbbb1",
                subject="Adjust package install destinations",
                body="",
                files=["debian/install"],
                insertions=2,
                deletions=1,
                categories=["debian"],
            ),
        ],
        files=[
            FileChange(
                path="debian/install",
                category="debian",
                subscopes=("install",),
                insertions=2,
                deletions=1,
                commit_count=1,
                score=6.2,
                flags=("packaging",),
            ),
        ],
        snippets=[],
        detected_themes=["packaging"],
    )

    tools = CategoryContext(
        name="tools",
        commit_count=2,
        insertions=14,
        deletions=4,
        commits=[
            CommitInfo(
                sha="bbbbbbbbcccccccc2",
                subject="Refine release payload determinism",
                body="",
                files=["tools/release/changelog/payload.py"],
                insertions=9,
                deletions=2,
                categories=["tools"],
            ),
            CommitInfo(
                sha="ccccccccdddddddd3",
                subject="Expand release CLI payload command tests",
                body="",
                files=["tools/release/tests/test_cli_changelog.py"],
                insertions=5,
                deletions=2,
                categories=["tools"],
            ),
        ],
        files=[
            FileChange(
                path="tools/release/changelog/payload.py",
                category="tools",
                subscopes=("release", "changelog"),
                insertions=9,
                deletions=2,
                commit_count=1,
                score=14.6,
                flags=("release-tooling",),
            ),
            FileChange(
                path="tools/release/tests/test_cli_changelog.py",
                category="tools",
                subscopes=("release", "tests"),
                insertions=5,
                deletions=2,
                commit_count=1,
                score=10.1,
                flags=("release-tooling",),
            ),
        ],
        snippets=[
            DiffSnippet(
                path="tools/release/changelog/payload.py",
                category="tools",
                subscopes=("release", "changelog"),
                score=8.4,
                reason="Selected from high-scoring tools file; flags: release-tooling",
                patch="@@ -20,6 +20,14 @@\n+def build_ai_payload(...):\n+    return payload",
                flags=("release-tooling",),
            ),
        ],
        detected_themes=["release-automation", "tools"],
    )

    core = CategoryContext(
        name="core",
        commit_count=3,
        insertions=48,
        deletions=16,
        commits=[
            CommitInfo(
                sha="ddddddddeeeeeeee4",
                subject="Harden websocket server handshake flow",
                body="",
                files=["core/protocols/websocket/server.cpp"],
                insertions=22,
                deletions=7,
                categories=["core"],
            ),
            CommitInfo(
                sha="eeeeeeeeffffffff5",
                subject="Improve fuse daemon mount cleanup on shutdown",
                body="",
                files=["core/fuse/mount_service.cpp"],
                insertions=18,
                deletions=6,
                categories=["core"],
            ),
            CommitInfo(
                sha="ffffffff111111116",
                subject="Refine usage parser aliases for vh shell commands",
                body="",
                files=["core/usage/parser.cpp"],
                insertions=8,
                deletions=3,
                categories=["core"],
            ),
        ],
        files=[
            FileChange(
                path="core/protocols/websocket/server.cpp",
                category="core",
                subscopes=("protocols", "websocket"),
                insertions=22,
                deletions=7,
                commit_count=1,
                score=19.2,
                flags=("implementation",),
            ),
            FileChange(
                path="core/fuse/mount_service.cpp",
                category="core",
                subscopes=("fuse", "mount_service.cpp"),
                insertions=18,
                deletions=6,
                commit_count=1,
                score=18.4,
                flags=("filesystem", "implementation"),
            ),
            FileChange(
                path="core/usage/parser.cpp",
                category="core",
                subscopes=("usage", "parser.cpp"),
                insertions=8,
                deletions=3,
                commit_count=1,
                score=11.8,
                flags=("implementation",),
            ),
        ],
        snippets=[
            DiffSnippet(
                path="core/protocols/websocket/server.cpp",
                category="core",
                subscopes=("protocols", "websocket"),
                score=9.8,
                reason="Selected from high-scoring core file; flags: implementation",
                patch=(
                    "@@ -101,6 +101,10 @@\n"
                    "+if (!validate_client_nonce(request)) {\n"
                    "+    return handshake_error(\"invalid nonce\");\n"
                    "+}\n"
                ),
                flags=("implementation",),
            ),
            DiffSnippet(
                path="core/fuse/mount_service.cpp",
                category="core",
                subscopes=("fuse", "mount_service.cpp"),
                score=9.1,
                reason="Selected from high-scoring core file; flags: filesystem, implementation",
                patch=(
                    "@@ -44,7 +44,12 @@\n"
                    "-cleanup_mount_point(path);\n"
                    "+if (is_mount_active(path)) {\n"
                    "+    cleanup_mount_point(path);\n"
                    "+}\n"
                ),
                flags=("filesystem", "implementation"),
            ),
        ],
        detected_themes=["filesystem", "core", "protocols"],
    )

    meta = CategoryContext(
        name="meta",
        commit_count=1,
        insertions=0,
        deletions=0,
        commits=[
            CommitInfo(
                sha="11111111222222227",
                subject="Touch README heading",
                body="",
                files=["README.md"],
                insertions=0,
                deletions=0,
                categories=["meta"],
            ),
        ],
        files=[
            FileChange(
                path="README.md",
                category="meta",
                subscopes=("README.md",),
                insertions=0,
                deletions=0,
                commit_count=1,
                score=1.2,
                flags=(),
            ),
        ],
        snippets=[],
        detected_themes=[],
    )

    return ReleaseContext(
        version="2.4.0",
        previous_tag="v2.3.1",
        head_sha="1234567890abcdef",
        commit_count=7,
        categories={"meta": meta, "core": core, "debian": debian, "tools": tools},
        cross_cutting_notes=[],
    )


def _truncation_context() -> ReleaseContext:
    core = CategoryContext(
        name="core",
        commit_count=5,
        insertions=110,
        deletions=40,
        commits=[
            CommitInfo(
                sha="22222222333333338",
                subject="Very long subject alpha for truncation behavior checks",
                body="",
                files=["core/src/runtime/alpha.cpp"],
                insertions=30,
                deletions=8,
                categories=["core"],
            ),
            CommitInfo(
                sha="33333333444444449",
                subject="Very long subject beta for truncation behavior checks",
                body="",
                files=["core/src/runtime/beta.cpp"],
                insertions=25,
                deletions=7,
                categories=["core"],
            ),
            CommitInfo(
                sha="4444444455555555a",
                subject="Very long subject gamma for truncation behavior checks",
                body="",
                files=["core/src/runtime/gamma.cpp"],
                insertions=18,
                deletions=9,
                categories=["core"],
            ),
            CommitInfo(
                sha="5555555566666666b",
                subject="Very long subject delta for truncation behavior checks",
                body="",
                files=["core/src/runtime/delta.cpp"],
                insertions=21,
                deletions=6,
                categories=["core"],
            ),
            CommitInfo(
                sha="6666666677777777c",
                subject="Very long subject epsilon for truncation behavior checks",
                body="",
                files=["core/src/runtime/epsilon.cpp"],
                insertions=16,
                deletions=10,
                categories=["core"],
            ),
        ],
        files=[
            FileChange(
                path="core/src/runtime/alpha.cpp",
                category="core",
                subscopes=("src", "runtime"),
                insertions=30,
                deletions=8,
                commit_count=2,
                score=21.1,
                flags=("implementation",),
            ),
            FileChange(
                path="core/src/runtime/beta.cpp",
                category="core",
                subscopes=("src", "runtime"),
                insertions=25,
                deletions=7,
                commit_count=2,
                score=20.4,
                flags=("implementation",),
            ),
            FileChange(
                path="core/src/runtime/gamma.cpp",
                category="core",
                subscopes=("src", "runtime"),
                insertions=18,
                deletions=9,
                commit_count=1,
                score=18.8,
                flags=("implementation",),
            ),
            FileChange(
                path="core/src/runtime/delta.cpp",
                category="core",
                subscopes=("src", "runtime"),
                insertions=21,
                deletions=6,
                commit_count=1,
                score=18.1,
                flags=("implementation",),
            ),
        ],
        snippets=[
            DiffSnippet(
                path="core/src/runtime/alpha.cpp",
                category="core",
                subscopes=("src", "runtime"),
                score=10.2,
                reason="Very long snippet reason alpha that should be clipped for payload compactness",
                patch=(
                    "@@ -1,8 +1,12 @@\n"
                    "+line1\n"
                    "+line2\n"
                    "+line3\n"
                    "+line4\n"
                    "+line5\n"
                    "+line6\n"
                ),
                flags=("implementation",),
            ),
            DiffSnippet(
                path="core/src/runtime/beta.cpp",
                category="core",
                subscopes=("src", "runtime"),
                score=9.7,
                reason="Very long snippet reason beta that should be clipped for payload compactness",
                patch="@@ -1,2 +1,2 @@\n+only one line\n",
                flags=("implementation",),
            ),
            DiffSnippet(
                path="core/src/runtime/gamma.cpp",
                category="core",
                subscopes=("src", "runtime"),
                score=9.1,
                reason="Very long snippet reason gamma that should be clipped for payload compactness",
                patch="@@ -1,2 +1,2 @@\n+only one line\n",
                flags=("implementation",),
            ),
        ],
        detected_themes=["core", "runtime"],
    )

    meta = CategoryContext(
        name="meta",
        commit_count=1,
        insertions=0,
        deletions=0,
        commits=[],
        files=[],
        snippets=[],
        detected_themes=[],
    )

    return ReleaseContext(
        version="2.4.1",
        previous_tag="v2.4.0",
        head_sha="fedcba0987654321",
        commit_count=6,
        categories={"meta": meta, "core": core},
        cross_cutting_notes=[],
    )


def _semantic_selection_context() -> ReleaseContext:
    tools = CategoryContext(
        name="tools",
        commit_count=2,
        insertions=12,
        deletions=3,
        commits=[
            CommitInfo(
                sha="99999999000000001",
                subject="Refine CLI compare command arguments",
                body="",
                files=["tools/release/cli.py"],
                insertions=8,
                deletions=2,
                categories=["tools"],
            ),
            CommitInfo(
                sha="99999999000000002",
                subject="Import cleanup in helper module",
                body="",
                files=["tools/release/helpers.py"],
                insertions=4,
                deletions=1,
                categories=["tools"],
            ),
        ],
        files=[
            FileChange(
                path="tools/release/cli.py",
                category="tools",
                subscopes=("release", "cli"),
                insertions=8,
                deletions=2,
                commit_count=1,
                score=10.0,
                flags=("release-tooling",),
            ),
            FileChange(
                path="tools/release/helpers.py",
                category="tools",
                subscopes=("release",),
                insertions=4,
                deletions=1,
                commit_count=1,
                score=16.0,
                flags=("release-tooling",),
            ),
        ],
        snippets=[
            DiffSnippet(
                path="tools/release/helpers.py",
                category="tools",
                subscopes=("release",),
                score=16.0,
                reason="Selected from high-scoring tools file; flags: release-tooling",
                patch=(
                    "@@ -1,4 +1,4 @@\n"
                    "+import os\n"
                    "+from pathlib import Path\n"
                    "-import sys\n"
                ),
                flags=("release-tooling",),
            ),
            DiffSnippet(
                path="tools/release/cli.py",
                category="tools",
                subscopes=("release", "cli"),
                score=8.0,
                reason="Selected from high-scoring tools file; flags: release-tooling",
                patch=(
                    "@@ -40,6 +40,10 @@\n"
                    "+compare = subparsers.add_parser(\"ai-compare\")\n"
                    "+compare.add_argument(\"--ai-profiles\", required=True)\n"
                    "+compare.add_argument(\"--output-name\")\n"
                ),
                flags=("release-tooling",),
            ),
        ],
        detected_themes=["release-automation", "tools"],
    )
    return ReleaseContext(
        version="2.5.0",
        previous_tag="v2.4.9",
        head_sha="feedfacecafebeef",
        commit_count=2,
        categories={"tools": tools},
        cross_cutting_notes=[],
    )


def _derived_artifact_contamination_context() -> ReleaseContext:
    derived_commit = CommitInfo(
        sha="abc1111111111111",
        subject="Generate release artifacts for 0.34.0",
        body="Refresh generated changelog outputs for previous release 0.34.0.",
        files=[
            "debian/changelog",
            ".changelog_scratch/comparisons/0.34.0-openai-comparison.md",
        ],
        insertions=240,
        deletions=20,
        categories=["debian", "tools"],
    )
    semantic_commit = CommitInfo(
        sha="def2222222222222",
        subject="Tighten OpenAI triage schema validation for compare runs",
        body="Align compare path triage parsing with current categories contract.",
        files=["tools/release/changelog/ai/stages/triage.py"],
        insertions=28,
        deletions=8,
        categories=["tools"],
    )
    tools = CategoryContext(
        name="tools",
        commit_count=2,
        insertions=268,
        deletions=28,
        commits=[derived_commit, semantic_commit],
        files=[
            FileChange(
                path=".changelog_scratch/comparisons/0.34.0-openai-comparison.md",
                category="tools",
                subscopes=("comparisons",),
                insertions=240,
                deletions=20,
                commit_count=1,
                score=6.0,
                flags=("release-tooling",),
            ),
            FileChange(
                path="tools/release/changelog/ai/stages/triage.py",
                category="tools",
                subscopes=("release", "changelog"),
                insertions=28,
                deletions=8,
                commit_count=1,
                score=18.0,
                flags=("release-tooling",),
            ),
        ],
        snippets=[
            DiffSnippet(
                path="debian/changelog",
                category="tools",
                subscopes=("debian",),
                score=12.0,
                reason="Generated artifact hunk that should be excluded",
                patch="@@ -1,2 +1,4 @@\n+vaulthalla (0.34.0) unstable; urgency=medium",
                flags=("packaging",),
            ),
            DiffSnippet(
                path="tools/release/changelog/ai/stages/triage.py",
                category="tools",
                subscopes=("release", "changelog"),
                score=16.0,
                reason="Schema contract update",
                patch="@@ -10,6 +10,10 @@\n+if not categories:\n+    raise ValueError(\"missing categories\")",
                flags=("release-tooling",),
            ),
        ],
        detected_themes=["release-automation", "packaging"],
    )
    return ReleaseContext(
        version="0.34.1",
        previous_tag="v0.34.0",
        head_sha="beadbeadbeadbead",
        commit_count=2,
        categories={"tools": tools},
        commits=[derived_commit, semantic_commit],
        cross_cutting_notes=[],
    )


def _cross_category_overlap_context() -> ReleaseContext:
    shared = CommitInfo(
        sha="aaaabbbbccccdddd",
        subject="Add ai-compare workflow capture and deploy helper updates",
        body="Coordinates compare command output capture and deploy helper cleanup.",
        files=["tools/release/cli.py", "deploy/bin/install.sh"],
        insertions=34,
        deletions=9,
        categories=["deploy", "tools"],
    )
    tools_only = CommitInfo(
        sha="eeeeffff00001111",
        subject="Refine triage projection fields for semantic payload",
        body="",
        files=["tools/release/changelog/ai/prompts/triage.py"],
        insertions=14,
        deletions=4,
        categories=["tools"],
    )
    deploy_only = CommitInfo(
        sha="2222333344445555",
        subject="Harden teardown cleanup ordering",
        body="",
        files=["deploy/bin/teardown.sh"],
        insertions=10,
        deletions=3,
        categories=["deploy"],
    )
    tools = CategoryContext(
        name="tools",
        commit_count=2,
        insertions=48,
        deletions=13,
        commits=[shared, tools_only],
        files=[],
        snippets=[],
        detected_themes=["release-automation"],
    )
    deploy = CategoryContext(
        name="deploy",
        commit_count=2,
        insertions=44,
        deletions=12,
        commits=[shared, deploy_only],
        files=[],
        snippets=[],
        detected_themes=["service-management"],
    )
    return ReleaseContext(
        version="0.34.1",
        previous_tag="v0.34.0",
        head_sha="facefacefaceface",
        commit_count=3,
        categories={"tools": tools, "deploy": deploy},
        commits=[shared, tools_only, deploy_only],
        cross_cutting_notes=[],
    )


def _version_only_web_context() -> ReleaseContext:
    version_only_commit = CommitInfo(
        sha="9999aaaabbbbcccc",
        subject="bump version to 0.34.0; update changelog",
        body="bump version 0.34.0",
        files=["web/package.json"],
        insertions=1,
        deletions=1,
        categories=["web"],
    )
    web = CategoryContext(
        name="web",
        commit_count=1,
        insertions=1,
        deletions=1,
        commits=[version_only_commit],
        files=[
            FileChange(
                path="web/package.json",
                category="web",
                subscopes=("package.json",),
                insertions=1,
                deletions=1,
                commit_count=1,
                score=4.0,
                flags=("frontend",),
            )
        ],
        snippets=[
            DiffSnippet(
                path="web/package.json",
                category="web",
                subscopes=("package.json",),
                score=5.0,
                reason="version bump",
                patch='@@ -1,3 +1,3 @@\n-  "version": "0.33.0"\n+  "version": "0.34.1"',
                flags=("frontend",),
            )
        ],
        detected_themes=["web"],
    )
    return ReleaseContext(
        version="0.34.1",
        previous_tag="v0.34.0",
        head_sha="1234123412341234",
        commit_count=1,
        categories={"web": web},
        commits=[version_only_commit],
        cross_cutting_notes=[],
    )


def _packaging_with_meaningful_remainder_context() -> ReleaseContext:
    commit = CommitInfo(
        sha="abcdabcd11112222",
        subject="bump version to 0.34.0; update changelog and improve package metadata",
        body="update changelog; ensure package metadata includes architecture constraints",
        files=["debian/control"],
        insertions=8,
        deletions=2,
        categories=["debian"],
    )
    debian = CategoryContext(
        name="debian",
        commit_count=1,
        insertions=8,
        deletions=2,
        commits=[commit],
        files=[
            FileChange(
                path="debian/control",
                category="debian",
                subscopes=("control",),
                insertions=8,
                deletions=2,
                commit_count=1,
                score=9.0,
                flags=("packaging",),
            )
        ],
        snippets=[
            DiffSnippet(
                path="debian/control",
                category="debian",
                subscopes=("control",),
                score=9.0,
                reason="package metadata change",
                patch="@@ -8,6 +8,8 @@\n+Architecture: amd64 arm64\n+Depends: python3 (>= 3.11)",
                flags=("packaging",),
            )
        ],
        detected_themes=["packaging"],
    )
    return ReleaseContext(
        version="0.34.1",
        previous_tag="v0.34.0",
        head_sha="9999888877776666",
        commit_count=1,
        categories={"debian": debian},
        commits=[commit],
        cross_cutting_notes=[],
    )


class PayloadContractTests(unittest.TestCase):
    maxDiff = None

    def test_schema_and_stable_default_payload_fixture(self) -> None:
        payload = build_ai_payload(_multi_category_context())
        rendered = render_ai_payload_json(payload)
        self.assertEqual(rendered, _load_fixture("payload_multi_category.json"))

        self.assertEqual(payload["schema_version"], AI_PAYLOAD_SCHEMA_VERSION)
        self.assertEqual([item["name"] for item in payload["categories"]], ["debian", "tools", "core", "meta"])
        self.assertEqual(payload["generation"]["truncation"]["any_truncation"], False)

    def test_truncation_rules_fixture(self) -> None:
        config = PayloadBuildConfig(
            limits=PayloadLimits(
                max_categories=1,
                max_commits_per_category=2,
                max_files_per_category=2,
                max_snippets_per_category=1,
                max_snippet_lines=3,
                max_snippet_chars=60,
                max_commit_subject_chars=24,
                max_snippet_reason_chars=28,
            ),
            include_weak_categories=True,
        )
        payload = build_ai_payload(_truncation_context(), config=config)
        rendered = render_ai_payload_json(payload)
        self.assertEqual(rendered, _load_fixture("payload_truncated.json"))

        truncation = payload["generation"]["truncation"]
        self.assertEqual(truncation["categories_truncated_by_limit"], ["meta"])
        self.assertIn("core", truncation["categories_with_evidence_truncated"])
        self.assertTrue(truncation["any_truncation"])

    def test_include_weak_categories_toggle(self) -> None:
        context = _multi_category_context()

        with_weak = build_ai_payload(context, config=PayloadBuildConfig(include_weak_categories=True))
        without_weak = build_ai_payload(context, config=PayloadBuildConfig(include_weak_categories=False))

        self.assertIn("meta", [item["name"] for item in with_weak["categories"]])
        self.assertNotIn("meta", [item["name"] for item in without_weak["categories"]])
        self.assertIn(
            "Weak-signal categories omitted by configuration: `debian`, `meta`",
            without_weak["notes"],
        )

    def test_payload_json_is_byte_stable(self) -> None:
        context = _truncation_context()
        config = PayloadBuildConfig(
            limits=PayloadLimits(
                max_categories=1,
                max_commits_per_category=2,
                max_files_per_category=2,
                max_snippets_per_category=1,
                max_snippet_lines=3,
                max_snippet_chars=60,
                max_commit_subject_chars=24,
                max_snippet_reason_chars=28,
            )
        )
        first = render_ai_payload_json(build_ai_payload(context, config=config))
        second = render_ai_payload_json(build_ai_payload(context, config=config))
        self.assertEqual(first, second)

    def test_semantic_payload_has_distinct_model_facing_shape(self) -> None:
        payload = build_semantic_ai_payload(_multi_category_context())

        self.assertEqual(payload["schema_version"], AI_SEMANTIC_PAYLOAD_SCHEMA_VERSION)
        self.assertEqual(payload["version"], "2.4.0")
        self.assertEqual([item["name"] for item in payload["categories"]], ["debian", "tools", "core", "meta"])
        self.assertEqual(len(payload["all_commits"]), 7)
        self.assertIn("subject", payload["all_commits"][0])
        self.assertIn("weight", payload["all_commits"][0])
        self.assertIn("weight_score", payload["all_commits"][0])
        core = payload["categories"][2]
        self.assertIn("summary_hint", core)
        self.assertIn("key_commits", core)
        self.assertEqual(len(core["key_commits"]), 3)
        self.assertIn("candidate_commits", core)
        self.assertEqual(len(core["candidate_commits"]), 3)
        self.assertIn("changed_files", core["candidate_commits"][0])
        self.assertIn("supporting_files", core)
        self.assertIn("semantic_hunks", core)
        self.assertIn("kind", core["semantic_hunks"][0])
        self.assertIn("why_selected", core["semantic_hunks"][0])
        self.assertNotIn("truncation", core)
        self.assertNotIn("score", core)

    def test_semantic_summary_hint_is_semantic_not_count_led(self) -> None:
        payload = build_semantic_ai_payload(_multi_category_context())
        tools = payload["categories"][1]

        self.assertIn("covering", tools["summary_hint"])
        self.assertNotIn("commits", tools["summary_hint"])
        self.assertNotIn("+", tools["summary_hint"])

    def test_semantic_selection_prefers_meaningful_hunks_over_import_noise(self) -> None:
        config = PayloadBuildConfig(limits=PayloadLimits(max_snippets_per_category=1))
        payload = build_semantic_ai_payload(_semantic_selection_context(), config=config)
        tools = payload["categories"][0]
        selected = tools["semantic_hunks"][0]

        self.assertEqual(selected["path"], "tools/release/cli.py")
        self.assertEqual(selected["kind"], "command-surface")
        self.assertIn("command-line surface changes", selected["why_selected"])
        self.assertIn("add_parser", selected["why_selected"])

    def test_semantic_hunks_propagate_region_metadata_when_available(self) -> None:
        context = _semantic_selection_context()
        context.categories["tools"].snippets[1] = DiffSnippet(
            path="tools/release/cli.py",
            category="tools",
            subscopes=("release", "cli"),
            score=8.0,
            reason="Selected from high-scoring tools file",
            patch=(
                "@@ -40,6 +40,10 @@ def build_parser(subparsers):\n"
                "+compare = subparsers.add_parser(\"ai-compare\")\n"
            ),
            flags=("release-tooling",),
            region_kind="function",
            region_label="def build_parser",
            hunk_count=1,
            changed_lines=1,
            meaningful_lines=1,
        )
        config = PayloadBuildConfig(limits=PayloadLimits(max_snippets_per_category=1))
        payload = build_semantic_ai_payload(context, config=config)
        selected = payload["categories"][0]["semantic_hunks"][0]
        self.assertEqual(selected["region_type"], "function")
        self.assertEqual(selected["context_label"], "def build_parser")

    def test_semantic_excerpt_prefers_context_rich_regions(self) -> None:
        context = _semantic_selection_context()
        context.categories["tools"].snippets[1] = DiffSnippet(
            path="tools/release/cli.py",
            category="tools",
            subscopes=("release", "cli"),
            score=8.0,
            reason="Context-first region capture",
            patch=(
                "@@ -38,6 +38,14 @@ def build_parser(subparsers):\n"
                " compare = subparsers.add_parser(\"ai-compare\")\n"
                " compare.set_defaults(handler=run_ai_compare)\n"
                "+compare.add_argument(\"--ai-profiles\", required=True)\n"
                "+compare.add_argument(\"--output-name\")\n"
                " return compare\n"
            ),
            flags=("release-tooling",),
            region_kind="function",
            region_label="def build_parser",
            hunk_count=1,
            changed_lines=2,
            meaningful_lines=2,
        )
        config = PayloadBuildConfig(limits=PayloadLimits(max_snippets_per_category=1, max_snippet_lines=120))
        payload = build_semantic_ai_payload(context, config=config)
        excerpt = payload["categories"][0]["semantic_hunks"][0]["excerpt"]
        self.assertIn("compare.set_defaults(handler=run_ai_compare)", excerpt)
        self.assertIn("+compare.add_argument(\"--ai-profiles\", required=True)", excerpt)

    def test_semantic_kind_declaration_region_not_mislabeled_config(self) -> None:
        context = _semantic_selection_context()
        context.categories["tools"].snippets[1] = DiffSnippet(
            path="core/include/command_registry.hpp",
            category="tools",
            subscopes=("core", "include"),
            score=9.2,
            reason="Data-structure declaration updates for command usage registry",
            patch=(
                "@@ -10,4 +10,10 @@ class CommandRegistry {\n"
                "+struct CommandUsageEntry {\n"
                "+    std::string name;\n"
                "+    std::string summary;\n"
                "+};\n"
                "+void RegisterUsageEntries(const std::vector<CommandUsageEntry>& entries);\n"
            ),
            flags=("api-surface",),
            region_kind="declaration",
            region_label="struct CommandUsageEntry",
            hunk_count=1,
            changed_lines=6,
            meaningful_lines=6,
        )
        config = PayloadBuildConfig(limits=PayloadLimits(max_snippets_per_category=1))
        payload = build_semantic_ai_payload(context, config=config)
        selected = payload["categories"][0]["semantic_hunks"][0]
        self.assertEqual(selected["kind"], "implementation-change")
        self.assertEqual(selected["region_type"], "declaration")

    def test_semantic_kind_deletion_heavy_command_setup_not_tests_contract(self) -> None:
        context = _semantic_selection_context()
        context.categories["tools"].snippets[1] = DiffSnippet(
            path="tools/release/tests/test_cli_changelog.py",
            category="tools",
            subscopes=("release", "tests"),
            score=8.8,
            reason="Delete legacy compare parser setup in test fixture",
            patch=(
                "@@ -40,20 +40,3 @@ def configure_parser_fixture(parser):\n"
                "-subparsers = parser.add_subparsers(dest=\"cmd\")\n"
                "-compare = subparsers.add_parser(\"ai-compare\")\n"
                "-compare.add_argument(\"--ai-profiles\", required=True)\n"
                "-compare.add_argument(\"--output-name\")\n"
                "-compare.set_defaults(handler=run_ai_compare)\n"
                "+return parser\n"
            ),
            flags=("release-tooling",),
            region_kind="test",
            region_label="configure_parser_fixture",
            hunk_count=1,
            changed_lines=6,
            meaningful_lines=6,
        )
        config = PayloadBuildConfig(limits=PayloadLimits(max_snippets_per_category=1))
        payload = build_semantic_ai_payload(context, config=config)
        selected = payload["categories"][0]["semantic_hunks"][0]
        self.assertEqual(selected["kind"], "command-surface")

    def test_semantic_payload_json_is_byte_stable(self) -> None:
        context = _multi_category_context()
        first = render_semantic_ai_payload_json(build_semantic_ai_payload(context))
        second = render_semantic_ai_payload_json(build_semantic_ai_payload(context))
        self.assertEqual(first, second)

    def test_semantic_payload_preserves_commit_body_in_candidate_corpus(self) -> None:
        commit = CommitInfo(
            sha="abcdabcdabcdabcd",
            subject="Carry detailed commit body into semantic candidates",
            body="Preserve detailed commit context for downstream triage.",
            files=["tools/release/changelog/payload.py"],
            insertions=12,
            deletions=3,
            categories=["tools"],
        )
        context = ReleaseContext(
            version="2.5.1",
            previous_tag="v2.5.0",
            head_sha="abcd1234abcd1234",
            commit_count=1,
            categories={
                "tools": CategoryContext(
                    name="tools",
                    commit_count=1,
                    insertions=12,
                    deletions=3,
                    commits=[commit],
                    files=[
                        FileChange(
                            path="tools/release/changelog/payload.py",
                            category="tools",
                            subscopes=("release", "changelog"),
                            insertions=12,
                            deletions=3,
                            commit_count=1,
                            score=9.8,
                            flags=("release-tooling",),
                        )
                    ],
                    snippets=[
                        DiffSnippet(
                            path="tools/release/changelog/payload.py",
                            category="tools",
                            subscopes=("release", "changelog"),
                            score=7.2,
                            reason="Selected semantic commit body preservation hunk",
                            patch="@@ -1,2 +1,3 @@\n+candidate commit bodies are preserved",
                            flags=("release-tooling",),
                        )
                    ],
                    detected_themes=["release-automation"],
                )
            },
            commits=[commit],
            cross_cutting_notes=[],
        )
        payload = build_semantic_ai_payload(context)
        all_commits = payload["all_commits"]
        self.assertTrue(any(item.get("body") for item in all_commits))

    def test_semantic_payload_excludes_generated_artifacts_and_stale_release_commit(self) -> None:
        payload = build_semantic_ai_payload(_derived_artifact_contamination_context())
        category = payload["categories"][0]

        self.assertNotIn("Generate release artifacts for 0.34.0", category["key_commits"])
        self.assertTrue(all(item["sha"] != "abc1111111111111" for item in payload["all_commits"]))
        self.assertTrue(all(path != "debian/changelog" for path in category["supporting_files"]))
        self.assertTrue(all(hunk["path"] != "debian/changelog" for hunk in category["semantic_hunks"]))

    def test_semantic_category_commit_candidates_reduce_cross_category_duplicate_bleed(self) -> None:
        payload = build_semantic_ai_payload(_cross_category_overlap_context())
        categories = {item["name"]: item for item in payload["categories"]}
        tools_candidates = [item["sha"] for item in categories["tools"]["candidate_commits"]]
        deploy_candidates = [item["sha"] for item in categories["deploy"]["candidate_commits"]]

        self.assertIn("aaaabbbbccccdddd", tools_candidates)
        self.assertNotIn("aaaabbbbccccdddd", deploy_candidates)

    def test_semantic_commit_text_cleanup_preserves_meaningful_remainder(self) -> None:
        payload = build_semantic_ai_payload(_packaging_with_meaningful_remainder_context())
        category = payload["categories"][0]

        self.assertIn("improve package metadata", category["key_commits"][0].lower())
        self.assertNotIn("bump version", category["key_commits"][0].lower())
        self.assertNotIn("update changelog", category["key_commits"][0].lower())

    def test_semantic_version_only_hunks_and_boilerplate_category_is_omitted(self) -> None:
        payload = build_semantic_ai_payload(_version_only_web_context())

        self.assertEqual(len(payload["categories"]), 0)
        self.assertEqual(len(payload["all_commits"]), 0)


if __name__ == "__main__":
    unittest.main()
