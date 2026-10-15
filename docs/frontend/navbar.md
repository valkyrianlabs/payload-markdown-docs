---
title: Docs Navbar
navTitle: Navbar
description: Render or adapt nested docs group and docs set navigation.
order: 430
status: published
tags:
  - frontend
  - navigation
---

# Docs Navbar

Use the `/next` navigation helpers when a site header needs links into generated
docs groups and docs sets.

## Drop-In Navbar

`PayloadMarkdownDocsNavbar` is the default docs navigation UI. It reads docs
groups and docs sets, renders nested navigation, and does not require your
existing CMSLink component.

```tsx
import { PayloadMarkdownDocsNavbar } from 'payload-markdown-docs/next'
import type { Payload } from 'payload'

export function DocsNav({ payload }: { payload: Payload }) {
  return (
    <PayloadMarkdownDocsNavbar
      classNames={{
        root: 'docs-nav',
        activeLink: 'is-active',
      }}
      currentPath="/plugins/payload-markdown-docs"
      payload={payload}
    />
  )
}
```

Use `renderLink` when the app needs a framework link component, tracking, or
custom link props.

## Headless Tree

Use `getPayloadMarkdownDocsNavItems` when the app owns the markup.

```ts
import { getPayloadMarkdownDocsNavItems } from 'payload-markdown-docs/next'

const docsNav = await getPayloadMarkdownDocsNavItems({
  payload,
})
```

The helper returns a serializable tree sorted by:

1. `order`
2. label

Top-level items are:

- docs groups without a parent
- docs sets without a group

Child groups and grouped docs sets are nested under their parent group.

## Header Adapter

Use `appendPayloadMarkdownDocsHeaderNavItems` when the app already has a Header
global with `navItems`.

```ts
import { appendPayloadMarkdownDocsHeaderNavItems } from 'payload-markdown-docs/next'

const navItems = await appendPayloadMarkdownDocsHeaderNavItems({
  existingItems: header.navItems ?? [],
  maxItems: 8,
  payload,
})
```

Capacity only applies to top-level docs entries. When a top-level group fits,
its child groups and docs sets stay intact.

The adapter emits custom URL links by default. This is the safest mode for
existing CMSLink implementations.

```ts
import { getPayloadMarkdownDocsHeaderNavItems } from 'payload-markdown-docs/next'

const docsItems = await getPayloadMarkdownDocsHeaderNavItems({
  mode: 'url',
  payload,
})
```

Use relationship mode only when the frontend renderer understands docs
relationships.

```ts
import { getPayloadMarkdownDocsHeaderNavItems } from 'payload-markdown-docs/next'

const docsItems = await getPayloadMarkdownDocsHeaderNavItems({
  mode: 'relationship',
  payload,
})
```

## Caching

`getPayloadMarkdownDocsNavItems` (and the header adapters and
`PayloadMarkdownDocsNavbar`, which use it) caches its docs set and docs group
query in the Next data cache with `unstable_cache`, tagged
`PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG` (`payload-markdown-docs:nav`). The cache
key covers the collection slugs, `fetchLimit` and `overrideAccess`; `maxItems`,
`availableSlots` and `existingItems` are applied after the cached read, so
different header layouts share one entry.

Next records the tag on every prerendered page that rendered the nav, and the
plugin expires it immediately (`revalidateTag(tag, { expire: 0 })`) whenever a
docs set or docs group is created, changed or deleted and after every applied
sync. Statically prerendered pages with the docs nav in their header are
regenerated on the next request, with no site-level revalidation code.

- `includeDrafts: true` (and Next draft mode) is never cached, so drafts stay live.
- Pass `cache: false` to read directly. Outside a Next runtime (scripts, tests)
  the helper falls back to a direct read on its own.
- To expire the nav from your own code, call
  `revalidateTag(PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG, { expire: 0 })`.
