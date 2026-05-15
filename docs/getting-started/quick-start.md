---
title: Quick Start
navTitle: Quick Start
description: Run the default docs workflow from local Markdown to GitHub Actions sync.
order: 20
status: published
tags:
  - getting-started
---

# Quick Start

This quick start assumes the conventional docs package layout and a docs set
slug of `main-docs`.

:::toc {title="On this page" depth="3" theme="compact"}
:::

## Create Admin Records

In `Docs Globals > Sets`, create:

- `title`: Main Docs
- `slug`: `main-docs`
- `branch`: `main`
- optional `group`: a group such as `plugins` when you want nested routes

In `Docs Globals > Trusted`, create:

- `owner`: your GitHub owner or organization
- `limitRepos`: off for the normal owner-level trust model

The set slug is the manifest source. The route base is derived from the
optional group and the set slug.

## Source Layout

```text
docs/
  index.md
skills/
  main-docs/
    codex/
      SKILL.md
    claude/
      SKILL.md
llms.txt
llms-full.txt
```

Markdown docs become manifest `files`. Skills and root AI discovery files become
manifest `assets`, so skill files do not need docs frontmatter.

## Install An Agent Skill

In the docs set target application, install local agent skills so Codex or
Claude has project-specific guidance for package structure, supported
frontmatter, validation, sync safety rules, and Payload Markdown authoring.

```bash
pnpm exec payload-markdown-docs install skill --agent codex
pnpm exec payload-markdown-docs install skill --agent claude
```

The Codex installer writes `.agents/skills/payload-markdown-docs/`,
`.agents/skills/payload-markdown/`, and creates or updates `AGENTS.md`. The
Claude installer writes `.claude/skills/payload-markdown-docs/` plus
`.claude/skills/payload-markdown/` and does not modify `AGENTS.md` by default.
Neither install syncs docs, calls Payload, or publishes content.

## Install Public Asset Routes

If the consuming Next app should serve `/llms.txt`, `/llms-full.txt`, or
docs-set skill URLs outside `/api`, commit the generated route files:

```bash
pnpm exec payload-markdown-docs install routes --payload-app "src/app/(payload)"
```

Those route files delegate to the plugin-owned asset handlers. Without them, a
frontend catch-all can return HTML 404 pages even when `/api/...` asset URLs
work.

## Validate Local Docs

```bash
pnpm exec payload-markdown-docs validate --source main-docs
```

## Generate A Manifest

```bash
pnpm exec payload-markdown-docs manifest --source main-docs --pretty
```

## Preview A Plan

```bash
pnpm exec payload-markdown-docs plan --source main-docs
```

## Push From GitHub Actions

```bash
pnpm exec payload-markdown-docs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc
```

When the docs set slug matches the repository name, `--source` can be omitted in
GitHub Actions and the CLI infers it from `GITHUB_REPOSITORY`.

:::details {title="Why dry-run first?"}
Dry-runs verify authentication, replay protection, the manifest, route
derivation, route collisions, and the sync plan without mutating docs records.
They are the right default for pull requests.
:::

To publish during sync, add `--publish` and make sure the server allows
publishing. See [publishing](/workflow/publishing).
