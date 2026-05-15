---
title: Public API
navTitle: Public API
description: v1 package export surfaces for payload-markdown-docs.
order: 610
status: published
tags:
  - reference
  - api
---

# Public API

`@valkyrianlabs/payload-markdown-docs` exposes a small v1 package surface.

## Root

Use the root package for Payload plugin configuration only:

```ts
import { payloadMarkdownDocs } from '@valkyrianlabs/payload-markdown-docs'
```

The root export also includes public plugin config types such as
`PayloadMarkdownDocsConfig`, auth, sync, target, routing, collection, endpoint,
and block install selection types.

## `/next`

Use `/next` in frontend/server route code:

```ts
import {
  PayloadMarkdownDocsPage,
  getDocsForSitemap,
  resolvePayloadMarkdownDocsRoute,
} from '@valkyrianlabs/payload-markdown-docs/next'
```

This surface owns route resolution, page rendering, metadata, sitemap helpers,
navigation helpers, marketing render components, and the public asset route
handler factory.

## `/admin`

Use `/admin` only for the Payload import map component:

```ts
import { DocsSetManager } from '@valkyrianlabs/payload-markdown-docs/admin'
```

Admin data loaders and URL helpers are internal.

## `/blocks`

Use `/blocks` for optional manual Payload block installation:

```ts
import {
  DocsCTABlock,
  DocsPreviewBlock,
  ctaButtonsField,
} from '@valkyrianlabs/payload-markdown-docs/blocks'
```

Sync planning, security, routing internals, hashing, frontmatter parsing, and
manifest builders are internal package implementation details.
