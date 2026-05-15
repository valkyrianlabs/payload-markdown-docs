---
title: Public API
navTitle: Public API
description: v1 package export surfaces for payload-markdown-docs.
order: 610
status: published
tags:
  - reference
  - api
---

# Public API

`@valkyrianlabs/payload-markdown-docs` exposes a small v1 package surface.

## Root

Use the root package for Payload plugin configuration only:

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
  generatePayloadMarkdownDocsMetadata,
  getPayloadMarkdownDocsMetadata,
  resolvePayloadMarkdownDocsRoute,
} from '@valkyrianlabs/payload-markdown-docs/next'
```

This surface owns route resolution, page rendering, metadata, sitemap helpers,
navigation helpers, marketing render components, and the public asset route
handler factory.

Use the nav/header builders for frontend navigation data.

## `/admin`

Use `/admin` only for the Payload import map component:

```ts
import { DocsSetManager } from '@valkyrianlabs/payload-markdown-docs/admin'
```

Admin data loaders and URL helpers are internal.

## `/blocks`

Use `/blocks` for optional manual Payload block installation:

```ts
import {
  DocsCTABlock,
  DocsPreviewBlock,
  ctaButtonsField,
} from '@valkyrianlabs/payload-markdown-docs/blocks'
```

Sync planning, security, routing internals, hashing, frontmatter parsing, and
manifest builders are internal package implementation details.

The CLI is the sync API for v1. The package does not expose a public `/sync`
SDK subpath.
