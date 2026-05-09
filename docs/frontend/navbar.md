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
import { PayloadMarkdownDocsNavbar } from '@valkyrianlabs/payload-markdown-docs/next'
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
import { getPayloadMarkdownDocsNavItems } from '@valkyrianlabs/payload-markdown-docs/next'

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
import { appendPayloadMarkdownDocsHeaderNavItems } from '@valkyrianlabs/payload-markdown-docs/next'

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
import { getPayloadMarkdownDocsHeaderNavItems } from '@valkyrianlabs/payload-markdown-docs/next'

const docsItems = await getPayloadMarkdownDocsHeaderNavItems({
  mode: 'url',
  payload,
})
```

Use relationship mode only when the frontend renderer understands docs
relationships.

```ts
import { getPayloadMarkdownDocsHeaderNavItems } from '@valkyrianlabs/payload-markdown-docs/next'

const docsItems = await getPayloadMarkdownDocsHeaderNavItems({
  mode: 'relationship',
  payload,
})
```
