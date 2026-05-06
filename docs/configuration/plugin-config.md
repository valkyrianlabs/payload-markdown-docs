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
    githubOidc: {
      audience: 'payload-markdown-docs',
    },
  },

  target: {
    type: 'docsCollection',
    enableDrafts: true,
  },

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
  both on the same endpoint. Source-specific keys and OIDC allowlists should
  live on docs sets in Payload Admin.
- `target` configures the dedicated generated docs collection.
- `sources` is a legacy fallback source allow-list when a docs set is not
  found. Prefer docs sets for normal CMS-managed deployments.
- `sync` controls write, publish, and delete authority.
- `routing` configures route collision checks.
- `collections` customizes infrastructure collection slugs.

See [sync config](/configuration/sync-config) and [routing config](/configuration/routing-config) for the safety gates.
