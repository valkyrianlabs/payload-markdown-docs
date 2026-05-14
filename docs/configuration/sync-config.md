---
title: Sync Config
navTitle: Sync
description: Configure write, publish, archive, draft, and hard-delete behavior.
order: 220
status: published
tags:
  - configuration
  - sync
---

# Sync Config

Sync behavior is server-owned.

:::callout {variant="warning" title="The request may ask. The server decides."}
The manifest can request `mode: "sync"` or `publish: true`, but the plugin applies writes or publishing only when server config allows it.
:::

## Write Gate

```ts
sync: {
  allowWrites: true,
}
```

Without `allowWrites: true`, `mode: "sync"` is rejected.

## Auth Is Separate

`sync` controls whether accepted requests may write or publish. `auth` controls whether a request is accepted.

Supported auth modes:

- `ed25519` for signed requests with docs-set public keys.
- `github-oidc` for GitHub Actions workflows with docs-set repository/ref
  allowlists.

See [GitHub OIDC](/configuration/github-oidc) and [signed push](/workflow/signed-push).

## Publish Gate

```ts
target: {
  type: 'docsCollection',
  enableDrafts: true,
},
sync: {
  allowPublish: true,
}
```

Publishing requires both a draft-enabled dedicated docs collection and `allowPublish: true`.
When `--publish` is not requested, synced generated docs are written as drafts.

## Cache Revalidation

After a successful sync, the endpoint attempts to revalidate generated docs
paths and common docs sitemap tags through `next/cache`. This keeps production
App Router pages from serving stale generated docs after `push --publish`.

Disable path revalidation or provide app-specific tags when needed.

```ts
sync: {
  allowWrites: true,
  allowPublish: true,
  revalidate: {
    paths: true,
    tags: ['payload-markdown-docs', 'sitemap', 'sitemap:docs'],
  },
}
```

Use `revalidate: false` only when the app handles docs cache invalidation
elsewhere.

## Delete Behavior

`deleteBehavior` can be:

- `archive`
- `ignore`
- `draft`
- `delete`

Hard delete requires `allowHardDelete: true`.

:::details {title="Recommended default"}
Use `deleteBehavior: 'archive'` and `allowHardDelete: false`. Archive keeps records available for review and avoids accidental destructive syncs.
:::
