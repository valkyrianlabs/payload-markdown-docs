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

The helper reads published docs sets, resolves group paths, prepends `siteUrl`,
and returns Payload-style paginated docs with `url` and `lastModified` fields.

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

  return docs.docs.flatMap((doc) =>
    doc.url
      ? [
          {
            lastModified: doc.lastModified ?? undefined,
            url: doc.url,
          },
        ]
      : [],
  )
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
    ...docs.docs.flatMap((doc) =>
      doc.url
        ? [
            {
              lastModified: doc.lastModified ?? undefined,
              url: doc.url,
            },
          ]
        : [],
    ),
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
- `tags`: `sitemap`, `sitemap:docs`

## Custom Collection Slugs

If the plugin uses custom docs group or docs set collection slugs, pass them
through `collections`.

```ts
const docs = await getDocsForSitemap({
  collections: {
    docsGroups: 'knowledge-groups',
    docsSets: 'knowledge-sets',
  },
  payload,
  siteUrl,
})
```
