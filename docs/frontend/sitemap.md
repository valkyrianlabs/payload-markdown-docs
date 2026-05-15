---
title: Dynamic Sitemap Helper
navTitle: Sitemap
description: Add canonical docs pages to a Next App Router sitemap.
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
generated docs records inside each set, prepends `siteUrl`, merges optional
static routes, and returns a ready-to-use `MetadataRoute.Sitemap` array.
By default, the output is limited to canonical crawler-discoverable docs pages.

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
      { path: '/agent-index.txt' },
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

`getDocsForSitemap` does not include raw AI-facing artifacts by default.
Human docs routes remain in `sitemap.xml`; `/llms.txt`, `/llms-full.txt`, and
native skill routes can stay publicly served without being pushed into search
crawler discovery.

Opt in only when the app intentionally wants raw artifacts in `sitemap.xml`:

```ts
const docs = await getDocsForSitemap({
  includeLlms: true,
  includeSkills: true,
  payload,
  siteUrl,
})
```

Options:

- `includeLlms`: includes generated and stored `llms.txt` / `llms-full.txt`
  routes.
- `includeSkills`: includes stored native skill artifact routes and
  extensionless `SKILL.md` aliases such as `/skills/codex`.
- `includeAssets`: includes stored generic `static` assets only. It does not
  imply `includeLlms` or `includeSkills`.

For static files that are not synced, keep using `additionalRoutes`.

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
        'reference/docs-package.md',
        'reference/frontmatter.md',
        'reference/workflow.md',
        'reference/sync.md',
        'reference/routing.md',
        'reference/admin.md',
        'reference/troubleshooting.md',
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

`additionalRoutes` is always explicit. Only pass `aiRoutes` when the sitemap is
intentionally opting raw AI artifacts into crawler discovery.

Skill artifacts can be hosted under plugin docs routes, such as
`/plugins/payload-markdown-docs/skills/codex/SKILL.md`, or under a top-level
route such as `/skills/payload-markdown-docs/codex/SKILL.md`. Set `basePath` to
the public route your site owns.

## Serving Synced Assets

The plugin registers Payload-owned GET endpoints for generated AI discovery
files and synced skills:

- `/llms.txt`
- `/llms-full.txt`
- `<computed-docs-set-route>/llms.txt`
- `<computed-docs-set-route>/llms-full.txt`
- `<computed-docs-set-route>/skills/<agent>/<path...>`

For example, a docs set served at `/plugins/payload-markdown-docs` exposes
`/plugins/payload-markdown-docs/llms.txt`,
`/plugins/payload-markdown-docs/skills/codex`, and
`/plugins/payload-markdown-docs/skills/codex/SKILL.md`; the Claude skill is
available at `/plugins/payload-markdown-docs/skills/claude` and
`/plugins/payload-markdown-docs/skills/claude/SKILL.md` after the assets are
synced. Consuming apps should install the public Next route files that delegate
to the package asset route handler:

```bash
pnpm exec payload-markdown-docs install routes --payload-app "src/app/(payload)"
```

Use `--payload-app "app/(payload)"` for apps without `src/`. If the public
routes return an asset schema error, migrate the Payload database so the
`payload-markdown-docs-assets` collection table exists.

The `/api/...` asset URLs are implementation/internal fallback URLs. Public
sitemap entries should use the canonical routes outside `/api`.

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

- `cacheKey`: `sitemap-docs-v2`
- `includeAssets`: `false`
- `includeLlms`: `false`
- `includeSkills`: `false`
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
