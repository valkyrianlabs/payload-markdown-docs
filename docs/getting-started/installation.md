---
title: Installation
navTitle: Install
description: Install payload-markdown-docs and register the Payload plugin.
order: 10
status: published
tags:
  - getting-started
---

# Installation

Install both the docs workflow package and the Markdown content package:

```bash
pnpm add @valkyrianlabs/payload-markdown-docs @valkyrianlabs/payload-markdown
```

`payload-markdown-docs` depends conceptually on `payload-markdown` for Markdown fields and rendering. It does not duplicate the renderer.

## Minimal Plugin Registration

```ts
import { payloadMarkdownDocs } from '@valkyrianlabs/payload-markdown-docs'
import { buildConfig } from 'payload'

export default buildConfig({
  plugins: [
    payloadMarkdownDocs({
      enabled: true,
    }),
  ],
})
```

An enabled plugin registers the default docs infrastructure:

- `docs-sets`
- `docs-groups`
- `docs-access`
- `docs`
- `docs-sync-runs`
- `docs-sync-nonces`

## Recommended Server Config

```ts
payloadMarkdownDocs({
  auth: {
    githubOidc: true,
  },

  target: {
    enableDrafts: true,
  },

  sync: {
    allowWrites: true,
    allowPublish: true,
    allowHardDelete: false,
    deleteBehavior: 'archive',
  },
})
```

Create a docs set in Payload Admin for each docs package. The docs set slug is
the sync source. Routes are derived from the optional group and slug. GitHub OIDC
trust records and Ed25519 keys live in `Docs Globals > Access`.

:::callout {variant="warning" title="Writes are opt-in"}
`mode: "sync"` requests are rejected unless the server has `sync.allowWrites: true`. Publish requests are rejected unless `sync.allowPublish: true` and drafts are enabled for the dedicated docs collection.
:::

Next, create keys with [keygen](/getting-started/keygen), then follow the [quick start](/getting-started/quick-start).
