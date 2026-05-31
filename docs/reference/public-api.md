---
title: Public API
navTitle: Public API
description: v1 package export surfaces for payload-markdown-docs.
order: 615
status: published
tags:
  - reference
  - api
---

# Public API

`@valkyrianlabs/payload-markdown-docs` exposes a small v1 package surface.

## Root

Use the root package for Payload plugin configuration:

```ts
import { payloadMarkdownDocs } from '@valkyrianlabs/payload-markdown-docs'
```

The root export also includes public plugin config types such as
`PayloadMarkdownDocsConfig`, `PayloadMarkdownDocsAuthConfig`,
`PayloadMarkdownDocsSyncConfig`, `PayloadMarkdownDocsTargetConfig`,
`PayloadMarkdownDocsRoutingConfig`, `PayloadMarkdownDocsCollectionsConfig`,
`PayloadMarkdownDocsCollectionConfig`, `PayloadMarkdownDocsEndpointConfig`,
`PayloadMarkdownDocsPagesRoutingConfig`,
`PayloadMarkdownDocsSyncRevalidateConfig`, `DocsBlockInstallSelection`,
`DocsCollectionInstallConfig`, and `DocsMarketingBlockKey`.

Do not import constants, routing helpers, sync helpers, security helpers,
frontmatter parsers, manifest builders, or block schemas from the root package.

## `/next`

Use `/next` in frontend/server route code:

```ts
import {
  PayloadMarkdownDocsPage,
  PayloadMarkdownDocsNavbar,
  getDocsForSitemap,
  getPayloadMarkdownDocsRoutePath,
  generatePayloadMarkdownDocsMetadata,
  getPayloadMarkdownDocsMetadata,
  resolvePayloadMarkdownDocsRoute,
} from '@valkyrianlabs/payload-markdown-docs/next'
```

This surface owns route resolution, page rendering, metadata, sitemap helpers,
navigation helpers, marketing render components, and the public asset route
handler factory.

Use `getPayloadMarkdownDocsRoutePath` to normalize route input from a string,
`[slug]`, or catch-all slug array before resolving docs and before querying a
fallback Pages collection. `resolvePayloadMarkdownDocsRoute` supports `path` for
new integrations; the older `slug` option remains available for compatibility.

Use the nav/header builders for frontend navigation data.

## `/admin`

Use `/admin` only for Payload import map components:

```ts
import { DocsSetManager } from '@valkyrianlabs/payload-markdown-docs/admin'
```

Admin data loaders and URL helpers are internal.

## `/blocks`

Use `/blocks` for optional manual Payload block installation:

```ts
import { DocsCTABlock } from '@valkyrianlabs/payload-markdown-docs/blocks'
```

The v1 in-page block registry contains only `DocsCTABlock`.

Docs Excerpt is deferred until a first-class read-only markdown highlighter is
available.

Sync planning, security, routing internals, hashing, frontmatter parsing, and
manifest builders are internal package implementation details.

The CLI is the sync API for v1. The package does not expose a public `/sync`
SDK subpath.
