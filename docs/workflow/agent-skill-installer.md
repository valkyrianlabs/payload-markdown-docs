---
title: Agent Skill Installer
navTitle: Agent Skill
description: Install local AI-agent guidance for maintaining payload-markdown-docs documentation.
order: 340
status: published
tags:
  - workflow
  - agents
---

# Agent Skill Installer

The agent skill installer writes a local AI-agent-readable workflow pack into a consuming project.

```bash
pnpm exec payload-markdown-docs install skill --codex
```

Alias:

```bash
pnpm exec payload-markdown-docs install ai-skill --codex
```

:::callout {variant="info" title="Local guidance only"}
The installer writes Markdown guidance files. It does not sync docs, call Payload, fetch remote docs, or run package manager commands.
:::

## Output Tree

Default output:

```text
.agents/skills/payload-markdown-docs/
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

The installed skill also teaches agents to create and maintain
`docs/index.ai.yml`. That manifest is source-controlled with the Markdown docs,
controls the generated raw Markdown export such as `/plugins/payload-markdown.md`,
and is not rendered as a human docs page or shown in human docs navigation.

## Options

```bash
pnpm exec payload-markdown-docs install skill --codex \
  --out .agents/skills/payload-markdown-docs \
  --docs-root ./docs \
  --package-manager pnpm
```

Use `--dry-run` to preview files and `--force` to overwrite existing skill files.

## What The Skill Teaches

- maintain docs in repo-local Markdown files
- use supported frontmatter only
- follow plain Markdown formatting expectations
- use supported `payload-markdown` directives
- keep internal links root-relative inside the docs set
- create and maintain `docs/index.ai.yml` from the actual docs files present
- use `docs/index.ai.yml` as the preferred ordering source for the `.md` export
- run validate and plan before finishing
- use signed dry-run/sync push only when explicitly requested
- respect server-owned sync, publish, and hard-delete gates
- avoid unsupported features and invented directives

:::details {title="Future ideas"}
Future commands may update or verify installed skills, detect drift against newer docs, generate reference pages from canonical docs, or support additional agent targets such as Claude and Cursor.
:::
