---
title: Metadata Helper
navTitle: Metadata
description: Generate simple metadata from resolved docs routes.
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

Metadata uses:

- per-doc SEO overrides when present
- doc title and description
- docs set defaults
- docs group title and description

The helper intentionally stays simple. It does not build a full Open Graph system.

See [overrides](/admin/overrides) for per-doc SEO fields.
