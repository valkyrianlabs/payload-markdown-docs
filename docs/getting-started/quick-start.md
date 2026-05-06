---
title: Quick Start
navTitle: Quick Start
description: Run the default docs workflow from local Markdown to signed sync.
order: 20
status: published
tags:
  - getting-started
---

# Quick Start

This quick start assumes your docs live in `./docs` and your Payload server is configured with a docs set source id named `main-docs`.

:::toc {title="On this page" depth="3" theme="compact"}
:::

## Create A Docs Set

In Payload Admin, create a docs set with:

- `title`: Payload Markdown Docs
- `sourceId`: `main-docs`
- `sourceRoot`: `docs`
- `routeBase`: `/plugins/payload-markdown-docs`
- `auth.ed25519.keys`: add `keyId: github-actions-main` and the public key, or
  use `auth.githubOidc` for GitHub Actions

The endpoint resolves incoming manifests by `source.id`. When a docs set with
that `sourceId` exists, the docs set route base owns generated routes and the
docs set auth policy decides which credentials may update it.

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

## Push A Signed Dry Run

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-file .docs-sync/docs-sync-private.pem \
  --dry-run
```

## Apply A Sync

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --sync
```

:::details {title="Why dry-run first?"}
Dry-runs verify the signature, body hash, timestamp, nonce, manifest, route derivation, route collisions, and sync plan without mutating docs records. They are the right default for pull requests.
:::

To publish during sync, add `--publish` and make sure the server allows publishing. See [publishing](/workflow/publishing).
