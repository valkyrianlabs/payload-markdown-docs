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

In `Docs Globals > Access`, create a GitHub OIDC record:

- `type`: GitHub OIDC
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
```

Markdown docs become manifest `files`. Skills become manifest `assets`, so skill
files do not need docs frontmatter. AI discovery files are generated from synced
docs, docs set metadata, dependencies, and skills.

## Install An Agent Skill

In the docs set target application, install local agent skills so Codex or
Claude has project-specific guidance for package structure, supported
frontmatter, validation, sync safety rules, and Payload Markdown authoring.

```bash
pmdocs install skill --agent codex
pmdocs install skill --agent claude
```

The Codex installer writes `.agents/skills/payload-markdown-docs/` and
`.agents/skills/payload-markdown/`. The Claude installer writes
`.claude/skills/payload-markdown-docs/` and
`.claude/skills/payload-markdown/`. These installs do not sync docs, call
Payload, or publish content.

## Install Public Asset Routes

If the consuming Next app should serve generated `/llms.txt`, `/llms-full.txt`,
docs-set `llms` files, or skill URLs outside `/api`, commit the generated route
files:

```bash
pmdocs install routes --payload-app "src/app/(payload)"
```

Those route files delegate to the plugin-owned asset handlers. Without them, a
frontend catch-all can return HTML 404 pages even when `/api/...` asset URLs
work.

## Validate Local Docs

```bash
pmdocs validate --source main-docs
```

## Generate A Manifest

```bash
pmdocs manifest --source main-docs --pretty
```

## Preview A Plan

```bash
pmdocs plan --source main-docs
```

## Push From GitHub Actions

```bash
pmdocs push \
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
