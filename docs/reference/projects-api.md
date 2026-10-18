---
title: Projects API
navTitle: Projects API
description: Public, read-only JSON API that lists published docs sets with their technology stacks.
order: 617
status: published
tags:
  - reference
  - api
---

# Projects API

The projects API lets other sites, such as a portfolio, list the products a
docs site documents. It returns each published docs set's title, description,
SEO metadata, canonical URLs, docs group and
[technology stack](/reference/stack-toml), and nothing else.

It is disabled by default. Enable it in the plugin config:

```ts
payloadMarkdownDocs({
  publicApi: {
    projects: true,
  },
})
```

Once it is enabled, every **published** docs set is listed. There is no
separate allowlist: drafts and docs sets that were never published are never
listed. The [consumer package](#consumer-package) reads the API from any number
of sites.

## Endpoints

```http
GET /api/documentation/projects
GET /api/documentation/projects?group=libraries,tools
GET /api/documentation/projects/:slug
```

`group` limits the list to docs sets in those docs groups (by group slug).
Change the path with `publicApi.projects.path`:

```ts
payloadMarkdownDocs({
  publicApi: {
    projects: { path: '/portfolio/projects' },
  },
})
```

## Response

```json
{
  "schemaVersion": 1,
  "groups": [{ "slug": "products", "title": "Products" }],
  "projects": [
    {
      "slug": "vaulthalla",
      "title": "Vaulthalla",
      "description": "The Final Cloud — encrypted storage.",
      "group": { "slug": "products", "title": "Products" },
      "seo": {
        "title": "Vaulthalla — encrypted cloud storage",
        "description": "The Final Cloud — encrypted storage.",
        "image": { "url": "https://vaulthalla.io/api/media/file/og.png", "alt": "Vaulthalla", "width": 1200, "height": 630 }
      },
      "urls": {
        "product": "https://vaulthalla.io/products/vaulthalla",
        "docs": "https://vaulthalla.io/products/vaulthalla"
      },
      "stack": [
        { "category": "languages", "items": [{ "name": "C++23" }, { "name": "TypeScript" }] },
        { "category": "databases", "items": [{ "name": "PostgreSQL" }] }
      ],
      "updatedAt": "2026-10-18T12:00:00.000Z",
      "lastSyncedAt": "2026-10-18T12:00:00.000Z"
    }
  ]
}
```

- `seo` is what the docs set's own page uses in its metadata: the plugin-seo
  `meta` values, falling back to the docs set's nav title or title and its
  description. `image` is `null` when none is set.
- `urls` are absolute. They use the same public origin as the generated
  `llms.txt` files (see
  [Public URLs In Generated Files](/configuration/plugin-config)).
  `docs` differs from `product` for `product-nested` docs sets.
- `group` is `null` for ungrouped docs sets. `groups` lists the groups that have
  listed projects, in display order.
- `stack` is `[]` when the docs set has no `stack.toml`.
- Projects are ordered by group, then by title.

`/:slug` answers `{ "schemaVersion": 1, "project": { ... } }`. When the slug is
not a published docs set, it answers `404` with
`{ "schemaVersion": 1, "error": { "code": "not_found", "message": "..." } }`.

The response contains only these fields. Repository bindings, OIDC and workflow
settings, branches, sync internals and admin-only fields are never exposed. The
`docs-sets` REST collection stays admin-only.

## Caching

Responses carry a strong `ETag`: the SHA-256 of the response body. Any change to
a listed docs set, its group or its URLs changes it, and so does adding,
unpublishing or deleting a docs set. Requests with a matching `If-None-Match`
get `304 Not Modified`.

```http
Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=86400
```

## Compatibility

`schemaVersion` covers the wire format only. It is independent of the npm
version. Within a schema version, fields are only added, and clients ignore
fields they do not know. A breaking change bumps `schemaVersion`, so a client
that expects version 1 reports a mismatch instead of misreading data.

## Consumer package

`@valkyrianlabs/payload-markdown-docs-consumer` is a dependency-free client for
other sites. It needs no Payload, Next.js or React. It fetches several sites at
once, validates `schemaVersion`, keeps every key scoped to its site, and reports
sites that fail without hiding the others:

```ts
import { createDocsProjectsClient } from '@valkyrianlabs/payload-markdown-docs-consumer'

const client = createDocsProjectsClient({
  sites: [
    { id: 'vaulthalla', baseUrl: 'https://vaulthalla.io' },
    { id: 'valkyrianlabs', baseUrl: 'https://valkyrianlabs.com' },
  ],
  fetchOptions: { next: { revalidate: 300 } },
})

const { sites, projects, complete, errors } = await client.getProjects()
```

`sites` keeps the configured order. Each site has `groups` (each with its
`projects`) and `ungrouped`, and `projects` is the flattened list. Project
keys such as `valkyrianlabs/docs` stay unique when two sites use the same slug.
The package README documents every option and error code. The package is
released together with payload-markdown-docs and carries the same version.
