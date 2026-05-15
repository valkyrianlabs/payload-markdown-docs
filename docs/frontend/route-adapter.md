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

The route adapter is for rendered human docs pages. It does not serve raw
`.txt` or `.md` AI assets.

Native agent skill artifacts live outside generated docs records under
`skills/<source>/<agent>/`. When `payload-markdown-docs push` syncs those files,
the plugin stores them as static assets and serves them through asset handlers
such as
`/plugins/payload-markdown-docs/skills/codex`,
`/plugins/payload-markdown-docs/skills/codex/SKILL.md`, and
`/plugins/payload-markdown-docs/skills/claude`.

In a Next App Router app, public raw asset URLs need filesystem route files that
delegate to the asset handlers:

```bash
pnpm exec payload-markdown-docs install routes --payload-app "src/app/(payload)"
```

If public asset route files are missing, the frontend catch-all may return
rendered 404 HTML even though `/api/...` asset URLs work. The `/api/...` routes
are implementation/internal fallback routes, not the public canonical URLs.
