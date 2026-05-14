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

This quick start assumes your Markdown lives in `./docs` and your docs set slug
is `main-docs`.

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

## Install An Agent Skill

In the docs set target application, install a local agent skill so Codex or
Claude has project-specific guidance for maintaining Markdown docs, supported
frontmatter, validation, and sync safety rules.

```bash
pnpm exec payload-markdown-docs install skill --agent codex
pnpm exec payload-markdown-docs install skill --agent claude
```

The Codex installer writes `.agents/skills/payload-markdown-docs/` and creates
or updates `AGENTS.md`. The Claude installer writes
`.claude/skills/payload-markdown-docs/` and does not modify `AGENTS.md` by
default. Neither install syncs docs, calls Payload, or publishes content.

## Validate Local Docs

```bash
pnpm exec payload-markdown-docs validate ./docs --source main-docs
```

## Generate A Manifest

```bash
pnpm exec payload-markdown-docs manifest ./docs --source main-docs --pretty
```

## Preview A Plan

```bash
pnpm exec payload-markdown-docs plan ./docs --source main-docs
```

## Push From GitHub Actions

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc \
  --sync
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
