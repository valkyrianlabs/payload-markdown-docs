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

- `ed25519` for signed requests with public keys stored in Access records.
  A key can sync every docs set unless its Access record lists
  `Allowed docs sets`; unscoped keys log a warning on use.
- `github-oidc` for GitHub Actions workflows trusted through Access owner or
  repository records, with per-docs-set branch, repository, tag-ref, workflow
  ref, and pull-request rules.

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
paths, synced asset routes, and common docs sitemap tags through `next/cache`.
This keeps production App Router pages from serving stale generated docs or raw
AI assets after `push --publish`.

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

## Dry-Run Audit Records

Every dry run records a sync run by default. Set `sync.auditDryRuns: false` to
record applied syncs only. Dry runs still consume their nonce.

## Delete Behavior

`deleteBehavior` can be:

- `archive`
- `ignore`
- `draft`
- `delete`

Hard delete requires `allowHardDelete: true`.

Removals take effect on the public site in every sync, including syncs without
`--publish`: `archive` and `draft` write the published record so a doc removed
from Git stops being served immediately. `draft` additionally unpublishes it.

An archived doc releases its route. Its stored route becomes
`archived:<id>:<route>`, so another file can take over the URL (for example
`guide.md` becoming `guide/index.md`, or two docs swapping `slug:` values).
When the file comes back, the archived record is reactivated on its real route.

A sync is applied in a single database transaction when the Payload database
adapter supports transactions (Postgres, SQLite, MongoDB replica sets). If any
write fails, no docs, assets, or docs-set changes from that sync are kept, and
the sync run is recorded as `failed`.

A sync is rejected with `409 route_collision` before any write when a route it
needs is still held by a doc it cannot release: a doc owned by another docs
set, or a published doc of the same set whose published version this sync does
not update (for example a non-`--publish` sync that moves `guide.md` away from
`/guide` while a new file claims `/guide`). Run the change as a `--publish`
sync instead.

:::details {title="Recommended default"}
Use `deleteBehavior: 'archive'` and `allowHardDelete: false`. Archive keeps records available for review and avoids accidental destructive syncs.
:::
