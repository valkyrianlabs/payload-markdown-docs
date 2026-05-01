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

Run `payload-markdown-docs validate ./docs --source main-docs`.

### Inspect a manifest

Run `payload-markdown-docs manifest ./docs --source main-docs --pretty`.

### Preview a plan

Run `payload-markdown-docs plan ./docs --source main-docs`.

:::

## Validate

```bash
pnpm exec payload-markdown-docs validate ./docs --source main-docs
```

Validation checks source paths, frontmatter, hashes, file limits, source id, and manifest shape.

## Manifest

```bash
pnpm exec payload-markdown-docs manifest ./docs --source main-docs --pretty
```

The manifest is JSON. It includes file content and SHA-256 hashes, but it does not include server-owned target collection or field names.

## Plan

```bash
pnpm exec payload-markdown-docs plan ./docs --source main-docs
```

Without `--existing`, local planning assumes an empty target and reports creates. Server-side dry-runs can plan against current Payload records.

See [CLI reference](/reference/cli).
