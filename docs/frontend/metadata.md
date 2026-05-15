---
title: Metadata Helper
navTitle: Metadata
description: Generate Next-compatible metadata from resolved docs routes.
order: 410
status: published
tags:
  - frontend
  - metadata
---

# Metadata Helper

Use metadata helpers from the `/next` export after resolving a docs route.

```ts
import {
  getPayloadMarkdownDocsMetadata,
  resolvePayloadMarkdownDocsRoute,
} from '@valkyrianlabs/payload-markdown-docs/next'

const resolved = await resolvePayloadMarkdownDocsRoute({
  payload,
  slug,
})

const metadata = resolved
  ? getPayloadMarkdownDocsMetadata(resolved)
  : {}
```

Metadata returns root `title` / `description` plus OpenGraph and Twitter fields
when values are available. It uses:

- doc title and description
- docs set `openGraph.title`, `openGraph.description`, and `openGraph.image`
- docs set nav title, title, and description
- docs group title and description

Docs pages inherit the docs set OpenGraph image unless the resolved doc has a
hero image. Doc title and description override docs set OpenGraph title and
description. Twitter metadata uses `summary_large_image` when an image is
available.

See [overrides](/admin/overrides) for per-doc SEO fields.
