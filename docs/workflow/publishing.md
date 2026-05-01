---
title: Publishing
description: Request published docs output safely from signed sync.
order: 330
status: published
tags:
  - workflow
  - publishing
---

# Publishing

Publishing is server-owned. The CLI can request publishing with `--publish`, but the server decides whether publishing is allowed.

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --sync \
  --publish
```

## Server Requirements

```ts
target: {
  type: 'docsCollection',
  enableDrafts: true,
},
sync: {
  allowWrites: true,
  allowPublish: true,
}
```

If publishing is not allowed, the endpoint returns a deterministic error.

:::details {title="Preserve mode"}
When `defaultPublishMode` is `preserve`, existing docs keep their current draft or published state unless the manifest requests publishing and the server allows it. New docs default to draft when drafts are enabled.
:::

## Hard Delete Is Separate

Publishing does not imply hard delete. Hard delete requires `sync.allowHardDelete: true` and `deleteBehavior: 'delete'`. Archive remains the safer default.
