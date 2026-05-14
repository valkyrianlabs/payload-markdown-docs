---
title: Route Adapter
navTitle: Route Adapter
description: Resolve and render docs routes from a Next/Payload route layer.
order: 400
status: published
tags:
  - frontend
  - routing
---

# Route Adapter

The `/next` export lets a Next route resolve generated docs routes without mutating the Pages collection.

```tsx
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'

import {
  PayloadMarkdownDocsPage,
  resolvePayloadMarkdownDocsRoute,
} from '@valkyrianlabs/payload-markdown-docs/next'

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  const payload = await getPayload({ config })

  const resolved = await resolvePayloadMarkdownDocsRoute({
    payload,
    slug,
  })

  if (resolved) {
    return <PayloadMarkdownDocsPage resolved={resolved} />
  }

  notFound()
}
```

## Fallback To Pages

In a real app, replace `notFound()` with your normal Pages collection lookup when `resolved` is `null`.

:::callout {variant="info" title="Read-only"}
The route adapter reads generated docs records, docs sets, and docs groups. It does not create Pages, mutate Pages, or sync docs.
:::

## Resolution Order

The helper resolves:

1. exact generated docs records
2. docs set index routes
3. docs group index routes when `serveIndex` is enabled
4. `null` for normal fallback routes

See [metadata](/frontend/metadata), [dynamic sitemap](/frontend/sitemap), and
[sidebar](/frontend/sidebar).

## Raw Markdown Export

Use `createPayloadMarkdownDocsMarkdownResponse` from the `/next` export for an
AI-facing `.md` route. It returns `text/markdown; charset=utf-8`, does not render
React, and assembles generated docs records according to `docs/index.ai.yml`
when that manifest was included in the docs sync.

The raw export must be served from a Next route handler. It is not a Payload
Page, it is not rendered by `PayloadMarkdownDocsPage`, and it is not created
automatically by the plugin.

For a known docs set output, add a static route at the exact `.md` URL:

```ts
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  createPayloadMarkdownDocsMarkdownResponse,
} from '@valkyrianlabs/payload-markdown-docs/next'

export async function GET() {
  const payload = await getPayload({ config })
  const response = await createPayloadMarkdownDocsMarkdownResponse({
    payload,
    path: '/plugins/payload-markdown-docs.md',
  })

  if (response) {
    return response
  }

  notFound()
}
```

Use the `path` form for static route handlers. Use the `slug` form only when the
route handler itself receives a catch-all `slug` parameter.

:::callout {variant="warning" title="Catch-all pages do not return Markdown"}
An App Router `page.tsx` can render React, but it cannot return a
`text/markdown` `Response`. If your human docs are handled by a catch-all page,
add a separate route handler for the raw `.md` output, or put AI exports under a
separate namespace such as `/ai/<docs-set>.md`.
:::
