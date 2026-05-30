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

The installer copies this plugin's native agent workflow pack into a consuming
project.

Codex:

```bash
pmdocs install skill --agent codex
pmdocs install skill --codex
```

Claude:

```bash
pmdocs install skill --agent claude
pmdocs install skill --claude
```

:::callout {variant="info" title="Local guidance only"}
The installer writes Markdown guidance files. It does not sync docs, call
Payload, fetch remote docs, or run package manager commands.
:::

## Output Trees

Codex default output:

```text
.agents/
  skills/
    payload-markdown-docs/
      SKILL.md
      reference/
        docs-package.md
        frontmatter.md
        workflow.md
        sync.md
        routing.md
        admin.md
        troubleshooting.md
      examples/
        github-actions.md
    payload-markdown/
      SKILL.md
      reference/
        payload-markdown-directives.md
        formatting.md
        quality.md
      examples/
        docs-page.md
```

Claude default output:

```text
.claude/
  skills/
    payload-markdown-docs/
      SKILL.md
      reference/
        docs-package.md
        frontmatter.md
        workflow.md
        sync.md
        routing.md
        admin.md
        troubleshooting.md
      examples/
        github-actions.md
    payload-markdown/
      SKILL.md
      reference/
        payload-markdown-directives.md
        formatting.md
        quality.md
      examples/
        docs-page.md
```

The canonical `payload-markdown-docs` source artifacts live in this package:

```text
skills/payload-markdown-docs/codex/
skills/payload-markdown-docs/claude/
```

The companion `payload-markdown` skill source is copied from the installed
dependency during native CLI packaging:

```text
node_modules/@valkyrianlabs/payload-markdown/skills/payload-markdown/codex/
node_modules/@valkyrianlabs/payload-markdown/skills/payload-markdown/claude/
```

The installed native `pmdocs` package writes both skills next to each other so
renderer directive guidance is available through the same agent skill root.

`install skill` installs local agent guidance only. It does not publish skills,
sync docs, install public routes, or call Payload.

## Publishing Skill Assets

Those directories are safe to publish through the docs site. After
`pmdocs push` syncs them as assets, the plugin serves standard
skill routes and generated docs-set AI discovery routes:

```text
/plugins/payload-markdown-docs/llms.txt
/plugins/payload-markdown-docs/llms-full.txt
/plugins/payload-markdown-docs/skills/codex
/plugins/payload-markdown-docs/skills/codex/SKILL.md
/plugins/payload-markdown-docs/skills/codex.zip
/plugins/payload-markdown-docs/skills/codex/reference
/plugins/payload-markdown-docs/skills/claude
/plugins/payload-markdown-docs/skills/claude/SKILL.md
/plugins/payload-markdown-docs/skills/claude.zip
/plugins/payload-markdown-docs/skills/codex/reference/workflow.md
```

`pmdocs push` syncs these skill artifacts by convention when they
live under `./skills/<source>/`. They are sent as manifest `assets`, not as docs
records, so skill files do not need docs frontmatter.

The public skill route contract is:

```text
/<group...>/<set>/skills/<agent>
/<group...>/<set>/skills/<agent>/<directory>
/<group...>/<set>/skills/<agent>/SKILL.md
/<group...>/<set>/skills/<agent>.zip
/<group...>/<set>/skills/<agent>/<path...>
```

`/skills/<agent>` serves a generated Markdown directory index for the synced
skill bundle. `/skills/<agent>/<directory>` also serves a generated Markdown
directory index when matching skill files exist below that prefix.
`/skills/<agent>/SKILL.md` and `/skills/<agent>/<path...>` serve raw synced
skill artifacts. `/skills/<agent>.zip` is generated on demand from the current
synced text skill artifacts for that docs set; ZIP files are not uploaded,
stored, or synced as static ZIP assets. Auto-resolved skill CTA buttons use the
ZIP route by default.

The source layout remains `./skills/<sourceId>/<agent>/...`. Generated archives
strip that distributor prefix and expand to `<sourceId>/SKILL.md` plus
supporting files. For example,
`skills/payload-markdown-docs/codex/reference/workflow.md` is bundled as
`payload-markdown-docs/reference/workflow.md`.

Generated `llms.txt` and `llms-full.txt` entries expose the skill index, raw
`SKILL.md`, and ZIP archive routes. Public URL generation prefers
`NEXT_PUBLIC_SERVER_URL`, then public site/Vercel URL environment values, before
falling back to forwarded request headers, Payload `serverURL`, or `req.url`.
Production output should not contain `localhost` when a public origin is
configured.

## Installing Public Asset Routes

For Next apps where the frontend catch-all owns those root URLs, install the
public asset route files once:

```bash
pmdocs install routes --payload-app "src/app/(payload)"
```

Commit and deploy the generated files. If they are missing, `/api/...` asset
URLs can work while public `/llms.txt` and `/skills` URLs return HTML 404 pages.

## Discovery

Raw agent artifacts are not listed in `sitemap.xml` by default. Use
`includeSkills: true` when stored skill asset routes should appear in the docs
sitemap, or pass explicit `additionalRoutes` for routes that are not synced
assets. Use `includeLlms: true` only when `llms.txt` and `llms-full.txt` routes
should be crawler-discoverable. The plugin also owns top-level `/llms.txt` and
`/llms-full.txt` handlers generated from synced docs, docs set metadata,
dependencies, and skills, while agents can consume native skill files directly
through public route files.

`sitemap.xml` is crawler discovery, `llms.txt` is an AI-readable entrypoint, and
skills are native workflow artifacts.

## Options

```bash
pmdocs install skill --agent codex \
  --out .agents/skills/payload-markdown-docs \
  --docs-root ./docs \
  --package-manager pnpm
```

Use `--dry-run` to preview files and `--force` to overwrite changed existing
skill files. Unchanged existing files are accepted. When `--out` is set, it
selects the `payload-markdown-docs` output directory; the `payload-markdown`
companion is installed as a sibling directory.

## What The Skills Teach

- maintain docs in repo-local Markdown files
- understand docs package layout, manifest `files`, and manifest `assets`
- use `.md` files only unless future config explicitly enables another format
- use supported payload-markdown-docs frontmatter only
- defer Payload Markdown directive and formatting details to the companion
  `payload-markdown` skill
- keep internal links route-aware and root-relative inside the docs set
- run validate before finishing docs edits
- run plan when sync behavior matters
- use `push` only when explicitly requested
- use `--dry-run` only for explicit dry-run checks
- respect server-owned sync, publish, and hard-delete gates
- avoid unsupported features and invented directives

The source split is deliberate: `/docs` is human documentation source rendered
with Payload Markdown, while `/skills` is the agent-native workflow package.
