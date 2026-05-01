---
title: CLI Reference
navTitle: CLI
description: Commands and flags for payload-markdown-docs.
order: 600
status: published
tags:
  - reference
  - cli
---

# CLI Reference

The package exposes the `payload-markdown-docs` binary.

:::toc {title="On this page" depth="3" theme="compact"}
:::

## validate

```bash
payload-markdown-docs validate ./docs --source main-docs
```

Validates local Markdown files by building and validating an in-memory manifest.

## manifest

```bash
payload-markdown-docs manifest ./docs --source main-docs --pretty
```

Prints manifest JSON.

## plan

```bash
payload-markdown-docs plan ./docs --source main-docs
```

Plans against an optional local existing-records JSON file. Without `--existing`, all valid docs are planned as creates.

## keygen

```bash
payload-markdown-docs keygen --out .docs-sync
```

Generates Ed25519 PEM keys for signed sync.

## push

```bash
payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --dry-run
```

`push` supports `--dry-run`, `--sync`, and `--publish`. Dry-run is the default. Publishing and writes remain server-owned.

:::details {title="Common flags"}
- `--source <id>`
- `--route-base <route>`
- `--repository <repo>`
- `--branch <branch>`
- `--commit <sha>`
- `--json`
- `--pretty`
- `--max-files <number>`
- `--max-file-bytes <number>`
- `--max-total-bytes <number>`
:::
