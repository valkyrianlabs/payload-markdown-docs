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

- `docs-groups`
- `docs-sets`
- `docs`
- `docs-sync-runs`
- `docs-sync-nonces`

## Recommended Server Config

```ts
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

:::callout {variant="warning" title="Writes are opt-in"}
`mode: "sync"` requests are rejected unless the server has `sync.allowWrites: true`. Publish requests are rejected unless `sync.allowPublish: true` and drafts are enabled for the dedicated docs collection.
:::

Next, create keys with [keygen](/getting-started/keygen), then follow the [quick start](/getting-started/quick-start).
