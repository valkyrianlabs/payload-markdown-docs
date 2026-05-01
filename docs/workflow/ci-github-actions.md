---
title: GitHub Actions
navTitle: GitHub Actions
description: Validate, dry-run, sync, and publish docs from GitHub Actions.
order: 310
status: published
tags:
  - workflow
  - ci
---

# GitHub Actions

The recommended CI workflow validates docs on every docs change, dry-runs signed syncs on pull requests, and syncs or publishes from `main`.

:::toc {title="On this page" depth="3" theme="compact"}
:::

## Required Secrets

- `DOCS_SYNC_ENDPOINT`
- `DOCS_SYNC_PRIVATE_KEY`

The server must have the matching public key configured under the same key id.

## Workflow Example

See `examples/github-actions/publish-docs.yml` in this repository.

Important commands:

```bash
pnpm exec payload-markdown-docs validate ./docs --source main-docs
```

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --dry-run
```

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --sync \
  --publish
```

:::callout {variant="warning" title="Server gates still apply"}
The publish job succeeds only when the server has `sync.allowWrites: true`, `sync.allowPublish: true`, and `target.enableDrafts: true`.
:::

See [signed push](/workflow/signed-push) for request signing details.
