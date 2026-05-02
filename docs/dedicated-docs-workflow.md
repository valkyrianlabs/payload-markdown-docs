---
title: Dedicated Docs Sync Workflow
navTitle: Dedicated Workflow
description: Complete setup guide for syncing Git-backed docs into Payload docs sets.
order: 5
status: published
tags:
  - workflow
  - setup
---

# Dedicated Docs Sync Workflow

This guide covers the default workflow for syncing a Git-backed `docs/` folder into Payload-managed docs sets and generated docs records.

The client sends docs content. The Payload server decides which sources, collections, fields, lifecycle behavior, and publishing modes are allowed.

## Install

```bash
pnpm add @valkyrianlabs/payload-markdown-docs @valkyrianlabs/payload-markdown
```

## Server Configuration

Configure the plugin in `payload.config.ts` with Ed25519 auth, a draft-enabled dedicated docs collection, a known docs source, and explicit sync permissions.

```ts
import { payloadMarkdownDocs } from '@valkyrianlabs/payload-markdown-docs'

payloadMarkdownDocs({
  enabled: true,

  auth: {
    mode: 'ed25519',
    keys: [
      {
        id: 'github-actions-main',
        publicKey: process.env.DOCS_SYNC_PUBLIC_KEY!,
      },
    ],
  },

  target: {
    type: 'docsCollection',
    enableDrafts: true,
  },

  sources: [
    {
      id: 'main-docs',
      root: 'docs',
      routeBase: '/docs',
    },
  ],

  sync: {
    allowWrites: true,
    allowPublish: true,
    allowHardDelete: false,
    defaultPublishMode: 'draft',
    deleteBehavior: 'archive',
  },
})
```

The default endpoint is exposed at:

```text
/api/payload-markdown-docs/sync
```

By default, the plugin also adds `docs-groups` and `docs-sets`. Docs sets are the user-facing unit for source ids and route bases. Generated docs records are linked to docs sets and remain the internal records used for routing, search, and sync correctness.

The native route adapter can resolve and render generated docs routes from a Next/Payload catch-all route without creating one Page per Markdown file. It is read-only and does not mutate Pages.

The docs set edit view includes a read-only generated docs manager. Use it to review generated docs for the set, inspect sync/archive/draft state, see which docs have overrides, and open generated docs records when per-doc override editing is needed.

## Docs Source Tree

Keep project documentation in a local Markdown tree:

```text
docs/
  index.md
  getting-started/
    installation.md
  configuration/
    sync.md
```

Supported files are `.md` only. Paths must be relative, must not contain traversal, and must remain inside the configured source root.

## Key Generation

Generate an Ed25519 key pair:

```bash
pnpm exec payload-markdown-docs keygen --out .docs-sync
```

Use the generated keys this way:

- `docs-sync-public.pem` goes into Payload server config or a server environment variable such as `DOCS_SYNC_PUBLIC_KEY`.
- `docs-sync-private.pem` goes into a CI secret such as `DOCS_SYNC_PRIVATE_KEY`.
- Do not commit the private key.

## Local Validation

Validate the docs tree before any upload:

```bash
pnpm exec payload-markdown-docs validate ./docs --source main-docs
pnpm exec payload-markdown-docs manifest ./docs --source main-docs --pretty
pnpm exec payload-markdown-docs plan ./docs --source main-docs
```

`validate` catches path, frontmatter, hash, and manifest issues. `manifest` prints the JSON payload that will be signed. `plan` shows what would be created, updated, archived, drafted, deleted, or left unchanged against an optional existing-record input.

## Dry-Run Upload

Use dry-run before applying changes:

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-file .docs-sync/docs-sync-private.pem \
  --dry-run
```

The endpoint verifies the request signature, timestamp, nonce, body hash, manifest, source id, and server-side lifecycle policy. It returns a plan summary without changing docs records.

## Sync Upload

Apply docs changes only after server config enables writes:

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --sync
```

`--sync` requires:

```ts
sync: {
  allowWrites: true,
}
```

The server can create, update, reactivate, archive, draft, or hard-delete dedicated docs records according to server-owned config. It checks for manual edit conflicts before writing and records sync-run audit data.

## Publish

Publishing is a request from the client and a server-owned decision.

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --sync \
  --publish
```

`--publish` only works when:

```ts
target: {
  type: 'docsCollection',
  enableDrafts: true,
},
sync: {
  allowPublish: true,
}
```

Without those settings, the server rejects publish requests.

## Hard Delete

Archive is the safer default because it preserves missing docs records and sync metadata.

Hard delete requires explicit server configuration:

```ts
sync: {
  allowHardDelete: true,
  deleteBehavior: 'delete',
}
```

Hard delete applies only to managed dedicated docs records after conflict checks pass. It is not enabled by request body alone.

## GitHub Actions

See `examples/github-actions/publish-docs.yml` for a CI workflow that:

- validates docs
- dry-runs signed sync on pull requests
- syncs and publishes on pushes to `main`

Required secrets:

- `DOCS_SYNC_ENDPOINT`
- `DOCS_SYNC_PRIVATE_KEY`

The Payload server must have the matching public key configured for the `github-actions-main` key id.

## Native Route Adapter

Use the `/next` export from an existing route layer to resolve docs routes before falling back to your normal Pages collection route.

```tsx
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  PayloadMarkdownDocsPage,
  resolvePayloadMarkdownDocsRoute,
} from '@valkyrianlabs/payload-markdown-docs/next'

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const resolved = await resolvePayloadMarkdownDocsRoute({
    payload,
    slug,
  })

  if (resolved) {
    return <PayloadMarkdownDocsPage resolved={resolved} />
  }

  notFound()
}
```

The route adapter can resolve exact docs records, docs set index routes, and docs group index routes where `serveIndex` is enabled. It returns `null` for normal Page routes so your app can fall back to existing Page rendering.

## Docs Set Admin Manager

Open a docs set in Payload Admin to review its generated docs records from one central place. The manager is read-only and shows:

- route base
- sync summary
- total, archived, draft, published, hidden-from-nav, and override counts
- generated docs grouped by source path
- route, title, status, and override summary for each generated doc
- links to generated docs records for deeper editing

Per-doc override editing is currently done by opening the generated doc record. Inline override editing from the docs set manager is deferred to a later phase.

The manager does not sync docs, mutate Pages, or create one Page per Markdown file.

## Current Boundaries

Implemented for this workflow:

- dedicated docs collection
- docs groups and docs sets
- signed sync endpoint
- GitHub Actions OIDC auth
- local CLI validation, manifest, plan, keygen, and push
- native route adapter and frontend rendering helpers
- docs set admin manager
- agent skill installer
- sync writes behind `sync.allowWrites`
- publish behind `sync.allowPublish`
- hard delete behind `sync.allowHardDelete`
- nonce replay protection
- sync-run audit records

Not implemented yet:

- existing collection targets
- block targets
