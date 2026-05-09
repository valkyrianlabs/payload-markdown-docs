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

An enabled plugin injects the default docs infrastructure and registers the sync
endpoint. A disabled plugin is an exact no-op.

:::toc {title="On this page" depth="3" theme="compact"}
:::

## Recommended Config

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
  },
})
```

## Main Sections

- `auth` enables sync request verification modes. Use `githubOidc`, `ed25519`,
  or both on the same endpoint.
- `target` configures the dedicated generated docs collection.
- `sync` controls write, publish, and delete authority.
- `routing` configures route collision checks.
- `collections` customizes infrastructure collection slugs.

GitHub trust belongs in `Docs Globals > Trusted`. Ed25519 public keys belong in
`Docs Globals > Keys`. Docs packages belong in `Docs Globals > Sets`.

See [sync config](/configuration/sync-config) and [routing config](/configuration/routing-config) for the safety gates.

## Hero Images

Generated docs records include an optional `heroImage` upload field. It uses the
`media` collection by default.

Add extra upload collections when your app stores docs imagery elsewhere:

```ts
payloadMarkdownDocs({
  target: {
    heroImage: {
      additionalMediaCollections: ['docs-media'],
    },
  },
})
```

Set `target.heroImage: false` to omit the field.
