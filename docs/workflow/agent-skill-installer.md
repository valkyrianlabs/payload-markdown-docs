---
title: Agent Skill Installer
navTitle: Agent Skill
description: Install native agent workflow packs for maintaining payload-markdown-docs documentation.
order: 340
status: published
tags:
  - workflow
  - agents
---

# Agent Skill Installer

The installer copies native agent workflow packs from the package `skills/`
directory into a consuming project.

Codex:

```bash
pnpm exec payload-markdown-docs install skill --agent codex
pnpm exec payload-markdown-docs install skill --codex
```

Claude:

```bash
pnpm exec payload-markdown-docs install skill --agent claude
pnpm exec payload-markdown-docs install skill --claude
```

Alias:

```bash
pnpm exec payload-markdown-docs install ai-skill --agent codex
pnpm exec payload-markdown-docs install ai-skill --agent claude
```

:::callout {variant="info" title="Local guidance only"}
The installer writes Markdown guidance files. Codex installs create or update
`AGENTS.md` by default so Codex can discover the skill. Claude installs do not
touch `AGENTS.md` by default. The installer does not sync docs, call Payload,
fetch remote docs, or run package manager commands.
:::

## Output Trees

Codex default output:

```text
.agents/
  skills/
    payload-markdown-docs/
      SKILL.md
      reference/
        payload-markdown-directives.md
        formatting.md
        frontmatter.md
        workflow.md
        sync.md
        routing.md
        admin.md
        troubleshooting.md
      examples/
        docs-page.md
        github-actions.md
AGENTS.md
```

Claude default output:

```text
.claude/
  skills/
    payload-markdown-docs/
      SKILL.md
      reference/
        payload-markdown-directives.md
        formatting.md
        frontmatter.md
        workflow.md
        sync.md
        routing.md
        admin.md
        troubleshooting.md
      examples/
        docs-page.md
        github-actions.md
```

The canonical source artifacts live in the package repository:

```text
skills/payload-markdown-docs/codex/
skills/payload-markdown-docs/claude/
```

`install skill` installs local agent guidance only. It does not publish skills,
sync docs, install public routes, or call Payload.

## Publishing Skill Assets

Those directories are safe to publish through the docs site. After
`payload-markdown-docs push` syncs them as assets, the plugin serves the
standard routes:

```text
/plugins/payload-markdown-docs/llms.txt
/plugins/payload-markdown-docs/llms-full.txt
/plugins/payload-markdown-docs/skills/codex
/plugins/payload-markdown-docs/skills/codex/SKILL.md
/plugins/payload-markdown-docs/skills/claude
/plugins/payload-markdown-docs/skills/claude/SKILL.md
/plugins/payload-markdown-docs/skills/codex/reference/workflow.md
```

`payload-markdown-docs push` publishes these skill artifacts by convention when
they live under `./skills/<source>/`. They are sent as manifest `assets`, not as
docs records, so skill files do not need docs frontmatter.

## Installing Public Asset Routes

For Next apps where the frontend catch-all owns those root URLs, install the
public asset route files once:

```bash
pnpm exec payload-markdown-docs install routes --payload-app "src/app/(payload)"
```

Commit and deploy the generated files. If they are missing, `/api/...` asset
URLs can work while public `/llms.txt` and `/skills` URLs return HTML 404 pages.

## Discovery

Include exposed skill artifacts in `sitemap.xml` with stored asset sitemap
coverage or the sitemap helper `additionalRoutes` option. The plugin also owns
top-level `/llms.txt` and `/llms-full.txt` asset handlers so crawlers can
discover the static AI entrypoints while agents can consume the native skill
files directly through public route files.

`sitemap.xml` is crawler discovery, `llms.txt` is an AI-readable entrypoint, and
skills are native workflow artifacts.

## Options

```bash
pnpm exec payload-markdown-docs install skill --agent codex \
  --out .agents/skills/payload-markdown-docs \
  --docs-root ./docs \
  --package-manager pnpm
```

Use `--dry-run` to preview files and `--force` to overwrite changed existing
skill files. Unchanged existing files are accepted.

## What The Skills Teach

- maintain docs in repo-local Markdown files
- use `.md` files only unless future config explicitly enables another format
- use supported frontmatter only
- follow plain Markdown formatting expectations first
- use supported `payload-markdown` directives only when useful
- keep internal links route-aware and root-relative inside the docs set
- run validate before finishing docs edits
- run plan when sync behavior matters
- use `push` only when explicitly requested
- use `--dry-run` only for explicit dry-run checks
- respect server-owned sync, publish, and hard-delete gates
- avoid unsupported features and invented directives

The source split is deliberate: `/docs` is human documentation source rendered
with Payload Markdown, while `/skills` is the agent-native workflow package.
