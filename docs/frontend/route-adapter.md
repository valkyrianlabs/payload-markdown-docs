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

export const dynamic = 'force-dynamic'

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

Production App Router pages can otherwise cache generated docs output. The sync
endpoint revalidates generated docs paths after successful writes, but
`dynamic = 'force-dynamic'` is the simplest option when the app prefers always
fresh docs reads.

## Resolution Order

The helper resolves:

1. exact generated docs records
2. docs set index routes
3. docs group index routes when `serveIndex` is enabled
4. `null` for normal fallback routes

See [metadata](/frontend/metadata), [dynamic sitemap](/frontend/sitemap), and
[sidebar](/frontend/sidebar).

## Agent Skill Files

The route adapter is for rendered human docs. Native agent skill artifacts live
outside the generated docs records under `skills/payload-markdown-docs/<agent>/`.
A site can later expose those files with a static route or public asset mount,
for example `/plugins/payload-markdown-docs/skills/codex/`.
