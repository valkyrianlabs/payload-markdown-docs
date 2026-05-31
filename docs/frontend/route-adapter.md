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

The `/next` export lets an existing Next slug route render generated docs
before falling back to normal Pages rendering. The plugin reads generated docs,
docs sets, and docs groups; it does not mutate your Pages collection or create
public frontend routes for you.

The usual pattern is:

1. normalize the incoming Next route params with `getPayloadMarkdownDocsRoutePath`
2. call `resolvePayloadMarkdownDocsRoute`
3. render `PayloadMarkdownDocsPage` when a docs route matches
4. fall back to your existing Pages query and renderer

:::callout {variant="info" title="Prefer one catch-all route when possible"}
If your Pages route can be changed, a single `[[...slug]]` route is the
simplest integration. It can render top-level Pages, nested Pages, docs group
indexes, docs set indexes, and generated docs pages from one place.
:::

```tsx
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'

import {
  PayloadMarkdownDocsPage,
  getPayloadMarkdownDocsRoutePath,
  resolvePayloadMarkdownDocsRoute,
} from '@valkyrianlabs/payload-markdown-docs/next'

export const dynamic = 'force-dynamic'

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug = [] } = await params
  const path = getPayloadMarkdownDocsRoutePath({ path: slug })
  const payload = await getPayload({ config })

  const resolved = await resolvePayloadMarkdownDocsRoute({
    payload,
    path,
  })

  if (resolved) {
    return <PayloadMarkdownDocsPage resolved={resolved} />
  }

  // Replace this with your normal Pages collection lookup.
  const page = await queryPageByPath({ path })

  if (page) {
    return <RenderPage page={page} />
  }

  notFound()
}
```

`queryPageByPath` and `RenderPage` are placeholders for your app's existing
Pages loader and renderer.

`path` accepts a normalized route string, a single `[slug]` string, or a
`[...slug]` / `[[...slug]]` string array. `slug` remains supported on
`resolvePayloadMarkdownDocsRoute`, but `path` is clearer for new integrations.

## Existing Slug Routes

If your site already has `app/(frontend)/[slug]/page.tsx`, call the resolver at
the top of that route before querying Pages. This covers top-level docs routes
such as `/plugins` or `/payload-markdown-docs`.

Generated docs are usually nested below a docs set route base, so a one-segment
`[slug]` route cannot match every docs page. Add a catch-all route such as
`app/(frontend)/[...slug]/page.tsx`, or replace the Pages route with one
`app/(frontend)/[[...slug]]/page.tsx` route when that is feasible.

Use the same resolver-first flow in both route files:

```tsx
const resolved = await resolvePayloadMarkdownDocsRoute({
  payload,
  path,
  includeDrafts: draft,
})

if (resolved) {
  return <PayloadMarkdownDocsPage resolved={resolved} />
}
```

Then run your normal Pages fallback. In a flat Pages collection, that may be a
lookup by `slug`. In a path-based Pages collection, use the normalized path
string.

## With Nested Docs Pages

When your Pages collection uses `@payloadcms/plugin-nested-docs`, query fallback
Pages by their full route path instead of only the final slug. A common approach
is to store a `fullPath` field from the nested-docs breadcrumbs:

```ts
import type { CollectionBeforeChangeHook } from 'payload'

import type { Page } from '@/payload-types'

export const populateFullPath: CollectionBeforeChangeHook<Page> = ({ data }) => {
  const url = data?.breadcrumbs?.at(-1)?.url

  if (url) {
    data.fullPath = url
  }

  return data
}
```

Add `fullPath` as an indexed field on Pages and populate it before change. Your
catch-all route can then resolve docs first and fall back to:

```ts
const result = await payload.find({
  collection: 'pages',
  limit: 1,
  pagination: false,
  where: {
    fullPath: {
      equals: path,
    },
  },
})
```

This keeps docs routing and nested Page routing independent. The docs adapter
does not need the Pages `fullPath` field; only your fallback Pages query does.

## Caching

Production App Router pages can otherwise cache generated docs output. The sync
endpoint revalidates generated docs paths after successful writes, but
`dynamic = 'force-dynamic'` is the simplest option when the app prefers always
fresh docs reads.

## Metadata

In `generateMetadata`, resolve docs first and fall back to the Pages metadata
helper only when the route is not a docs route:

```ts
import type { Metadata } from 'next'

import {
  generatePayloadMarkdownDocsMetadata,
  getPayloadMarkdownDocsRoutePath,
} from '@valkyrianlabs/payload-markdown-docs/next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}): Promise<Metadata> {
  const { slug = [] } = await params
  const path = getPayloadMarkdownDocsRoutePath({ path: slug })
  const payload = await getPayload({ config })

  const docsMetadata = await generatePayloadMarkdownDocsMetadata({
    payload,
    path,
  })

  if (docsMetadata) {
    return docsMetadata
  }

  const page = await queryPageByPath({ path })

  return generatePageMetadata({ page })
}
```

## Resolution Order

The helper resolves:

1. exact generated docs records
2. docs set index routes
3. docs group index routes when `pageMode` is `auto`
4. `null` for normal fallback routes

See [metadata](/frontend/metadata), [dynamic sitemap](/frontend/sitemap), and
[sidebar](/frontend/sidebar).

## Agent Skill Files

The route adapter is for rendered human docs pages. It does not serve raw
`.txt` or `.md` AI assets.

Native agent skill artifacts live outside generated docs records under
`skills/<source>/<agent>/`. When `pmdocs push` syncs those files,
the plugin stores them as raw asset records and serves them through asset handlers
such as
`/plugins/payload-markdown-docs/skills/codex`,
`/plugins/payload-markdown-docs/skills/codex/SKILL.md`, and
`/plugins/payload-markdown-docs/skills/codex.zip`. The extensionless agent route
is a generated Markdown directory index; raw files remain under
`/skills/<agent>/<path...>`.

In a Next App Router app, public raw asset URLs need filesystem route files that
delegate to the asset handlers:

```bash
pmdocs install routes --payload-app "src/app/(payload)"
```

If public asset route files are missing, the frontend catch-all may return
rendered 404 HTML even though `/api/...` asset URLs work. The `/api/...` routes
are implementation/internal fallback routes, not the public canonical URLs.
