---
title: Dynamic Sitemap Helper
navTitle: Sitemap
description: Add docs, static AI routes, and skill artifacts to a Next App Router sitemap.
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
generated docs records inside each set, includes synced static assets by
default, prepends `siteUrl`, merges optional static routes, and returns a
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

Most apps also include static routes, Pages collection routes, AI discovery
files, or other dynamic content in the same sitemap. Use `additionalRoutes` for
site-relative `path` entries or absolute `url` entries.

```ts
import type { MetadataRoute } from 'next'

import config from '@payload-config'
import { getPayload } from 'payload'

import { getDocsForSitemap } from '@valkyrianlabs/payload-markdown-docs/next'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const payload = await getPayload({ config })
  const docs = await getDocsForSitemap({
    additionalRoutes: [
      { path: '/llms.txt' },
      { path: '/llms-full.txt' },
      { path: '/plugins/payload-markdown-docs/skills/codex/SKILL.md' },
      { path: '/plugins/payload-markdown-docs/skills/claude/SKILL.md' },
    ],
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

The sitemap helper dedupes by final URL. When the same URL appears more than
once, the newest `lastModified` value is kept. Output remains sorted by URL.

## AI Discovery Routes

`sitemap.xml` and `llms.txt` serve different jobs:

- `sitemap.xml` is crawler discovery.
- `llms.txt` is an AI-readable entrypoint.
- native skills are agent workflow artifacts.

When `payload-markdown-docs push` syncs assets, `getDocsForSitemap` includes
stored `/llms.txt`, `/llms-full.txt`, and skill artifact routes by default. Set
`includeAssets: false` only when the site wants to manage those entries
manually. For static files that are not synced, keep using `additionalRoutes`.

Use `getPayloadMarkdownDocsAiSitemapRoutes` to build common AI/static routes:

```ts
import type { MetadataRoute } from 'next'

import config from '@payload-config'
import {
  getDocsForSitemap,
  getPayloadMarkdownDocsAiSitemapRoutes,
} from '@valkyrianlabs/payload-markdown-docs/next'
import { getPayload } from 'payload'

const aiRoutes = getPayloadMarkdownDocsAiSitemapRoutes({
  includeLlmsFull: true,
  skills: [
    {
      basePath: '/plugins/payload-markdown-docs/skills',
      agents: ['codex', 'claude'],
      files: [
        'SKILL.md',
        'reference/payload-markdown-directives.md',
        'reference/formatting.md',
        'reference/frontmatter.md',
        'reference/workflow.md',
        'reference/sync.md',
        'reference/routing.md',
        'reference/admin.md',
        'reference/troubleshooting.md',
        'examples/docs-page.md',
        'examples/github-actions.md',
      ],
    },
  ],
})

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const payload = await getPayload({ config })

  return getDocsForSitemap({
    additionalRoutes: aiRoutes,
    payload,
    siteUrl,
  })
}
```

Skill artifacts can be hosted under plugin docs routes, such as
`/plugins/payload-markdown-docs/skills/codex/SKILL.md`, or under a top-level
route such as `/skills/payload-markdown-docs/codex/SKILL.md`. Set `basePath` to
the public route your site owns.

## Serving Synced Assets

If the consuming app owns top-level route handlers, use the asset response
helpers from the `/next` export. They look up synced asset records by public
route and return the stored content type.

```ts
import config from '@payload-config'
import { createPayloadMarkdownDocsLlmsResponse } from '@valkyrianlabs/payload-markdown-docs/next'
import { getPayload } from 'payload'

export async function GET() {
  const payload = await getPayload({ config })

  return createPayloadMarkdownDocsLlmsResponse({
    path: '/llms.txt',
    payload,
  })
}
```

Use the same helper shape for `/llms-full.txt` and docs-set skill routes such
as `/plugins/payload-markdown-docs/skills/codex/SKILL.md`.

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
