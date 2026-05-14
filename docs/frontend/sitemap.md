---
title: Dynamic Sitemap Helper
navTitle: Sitemap
description: Add generated docs set URLs to a Next App Router sitemap.
order: 415
status: published
tags:
  - frontend
  - sitemap
---

# Dynamic Sitemap Helper

Use `getDocsForSitemap` from the `/next` export when a Next App Router site has
a dynamic `src/app/sitemap.ts` file.

The helper reads published docs sets, resolves group paths, includes the
generated docs records inside each set, prepends `siteUrl`, and returns a
ready-to-use `MetadataRoute.Sitemap` array.

```ts
import type { MetadataRoute } from 'next'

import config from '@payload-config'
import { getPayload } from 'payload'

import { getDocsForSitemap } from '@valkyrianlabs/payload-markdown-docs/next'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const payload = await getPayload({ config })
  return getDocsForSitemap({
    payload,
    siteUrl,
  })
}
```

## Combine With Other Routes

Most apps also include static routes, Pages collection routes, or other dynamic
content in the same sitemap.

```ts
import type { MetadataRoute } from 'next'

import config from '@payload-config'
import { getPayload } from 'payload'

import { getDocsForSitemap } from '@valkyrianlabs/payload-markdown-docs/next'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const payload = await getPayload({ config })
  const docs = await getDocsForSitemap({
    payload,
    siteUrl,
  })

  return [
    {
      url: siteUrl,
    },
    ...docs,
  ]
}
```

## Cache Keys And Tags

The helper wraps its read in `unstable_cache`. Override `cacheKey` or `tags`
when the app uses different sitemap invalidation tags.

```ts
const docs = await getDocsForSitemap({
  cacheKey: ['sitemap-docs-v2'],
  payload,
  siteUrl,
  tags: ['sitemap', 'docs'],
})
```

Defaults:

- `cacheKey`: `sitemap-docs-v1`
- `recursive`: `true`
- `tags`: `sitemap`, `sitemap:docs`

## Recursive Docs

By default, docs set indexes and generated child docs are included in the
sitemap. Disable recursion only when the app intentionally wants the base docs
set URLs.

```ts
const docs = await getDocsForSitemap({
  payload,
  recursive: false,
  siteUrl,
})
```

## Custom Collection Slugs

If the plugin uses custom collection slugs, pass them through `collections`.

```ts
const docs = await getDocsForSitemap({
  collections: {
    docs: 'knowledge-docs',
    docsGroups: 'knowledge-groups',
    docsSets: 'knowledge-sets',
  },
  payload,
  siteUrl,
})
```

## Paginated Result

Use `getPaginatedDocsForSitemap` when the app needs the original Payload-style
paginated result instead of the mapped Next sitemap array.

```ts
import { getPaginatedDocsForSitemap } from '@valkyrianlabs/payload-markdown-docs/next'

const result = await getPaginatedDocsForSitemap({
  payload,
  siteUrl,
})

// result.docs: Array<{ url?: string | null; lastModified?: string | null }>
```
