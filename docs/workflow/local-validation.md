---
title: Local Validation
navTitle: Validation
description: Validate, manifest, and plan docs changes before pushing.
order: 300
status: published
tags:
  - workflow
  - cli
---

# Local Validation

Local validation is the fastest feedback loop for docs authors and agents.

:::steps {variant="cards" layout="stack" numbered stepTheme="glass"}

### Validate

Run `payload-markdown-docs validate --source main-docs`.

### Inspect a manifest

Run `payload-markdown-docs manifest --source main-docs --pretty`.

### Preview a plan

Run `payload-markdown-docs plan --source main-docs`.

:::

## Validate

```bash
pnpm exec payload-markdown-docs validate --source main-docs
```

Validation checks source paths, frontmatter, asset paths, hashes, file limits,
docs set slug, and manifest shape.

## Manifest

```bash
pnpm exec payload-markdown-docs manifest --source main-docs --pretty
```

The manifest is JSON. Human docs are emitted as `files`; skills and optional
custom static fallback files are emitted as `assets`. Skills are optional: a
missing default `./skills` directory is skipped, while an explicitly supplied
missing `--skills <path>` is treated as a configuration error. The manifest
includes content and SHA-256 hashes, but it does not include server-owned target
collection or field names.

## Plan

```bash
pnpm exec payload-markdown-docs plan --source main-docs
```

Without `--existing`, local planning assumes an empty target and reports creates. Server-side dry-runs can plan against current Payload records.

See [CLI reference](/reference/cli).
