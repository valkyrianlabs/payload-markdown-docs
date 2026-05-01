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

## Publish Modes

`defaultPublishMode` can be:

- `draft`
- `published`
- `preserve`

`published` requires `allowPublish: true`.

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
