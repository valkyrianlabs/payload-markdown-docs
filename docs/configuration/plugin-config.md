---
title: Plugin Config
navTitle: Plugin
description: Configure payloadMarkdownDocs for the dedicated docs workflow.
order: 200
status: published
tags:
  - configuration
---

# Plugin Config

`payloadMarkdownDocs()` is a Payload plugin factory.

```ts
import { payloadMarkdownDocs } from '@valkyrianlabs/payload-markdown-docs'

payloadMarkdownDocs({
  enabled: true,
})
```

An enabled plugin injects the default docs infrastructure and registers the sync endpoint. A disabled plugin is an exact no-op.

:::toc {title="On this page" depth="3" theme="compact"}
:::

## Complete Dedicated Docs Config

```ts
payloadMarkdownDocs({
  enabled: true,

  auth: {
    ed25519: {
      keys: [
        {
          id: 'github-actions-main',
          publicKey: process.env.DOCS_SYNC_PUBLIC_KEY!,
        },
      ],
    },
    githubOidc: {
      audience: 'payload-markdown-docs',
      allowedRepositories: ['valkyrianlabs/payload-markdown-docs'],
      allowedWorkflows: ['Release'],
    },
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

## Main Sections

- `auth` configures sync request verification. Use `ed25519`, `githubOidc`, or
  both on the same endpoint.
- `target` configures the dedicated generated docs collection.
- `sources` is a fallback source allow-list when a docs set is not found.
- `sync` controls write, publish, and delete authority.
- `routing` configures route collision checks.
- `collections` customizes infrastructure collection slugs.

See [sync config](/configuration/sync-config) and [routing config](/configuration/routing-config) for the safety gates.
