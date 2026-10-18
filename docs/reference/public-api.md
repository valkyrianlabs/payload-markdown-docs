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

`payload-markdown-docs` exposes a small v1 package surface.

## Root

Use the root package for Payload plugin configuration:

```ts
import { payloadMarkdownDocs } from 'payload-markdown-docs'
```

The root export also includes public plugin config types such as
`PayloadMarkdownDocsConfig`, `PayloadMarkdownDocsAuthConfig`,
`PayloadMarkdownDocsSyncConfig`, `PayloadMarkdownDocsTargetConfig`,
`PayloadMarkdownDocsRoutingConfig`, `PayloadMarkdownDocsCollectionsConfig`,
`PayloadMarkdownDocsCollectionConfig`, `PayloadMarkdownDocsEndpointConfig`,
`PayloadMarkdownDocsPagesRoutingConfig`, `PayloadMarkdownDocsPublicApiConfig`,
`PayloadMarkdownDocsPublicApiEndpointConfig`,
`PayloadMarkdownDocsSyncRevalidateConfig`, `DocsBlockInstallSelection`,
`DocsCollectionInstallConfig`, and `DocsMarketingBlockKey`, plus
`PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG` (also exported from `/next`).

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
} from 'payload-markdown-docs/next'
```

This surface owns route resolution, page rendering, metadata, sitemap helpers,
navigation helpers, marketing render components, and the public asset route
handler factory.

Use `getPayloadMarkdownDocsRoutePath` to normalize route input from a string,
`[slug]`, or catch-all slug array before resolving docs and before querying a
fallback Pages collection. `resolvePayloadMarkdownDocsRoute` supports `path` for
new integrations; the older `slug` option remains available for compatibility.

Use the nav/header builders for frontend navigation data. The nav query is
cached under `PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG`; see
[Docs Navbar](/frontend/navbar#caching).

## `/admin`

Use `/admin` only for Payload import map components:

```ts
import { DocsSetManager } from 'payload-markdown-docs/admin'
```

Admin data loaders and URL helpers are internal.

## `/blocks`

Use `/blocks` for optional manual Payload block installation:

```ts
import { DocsCTABlock } from 'payload-markdown-docs/blocks'
```

The v1 in-page block registry contains only `DocsCTABlock`.

Docs Excerpt is deferred until a first-class read-only markdown highlighter is
available.

## `/migrations`

Use `/migrations` inside Payload migrations when upgrading an existing install:

```ts
import { prepareDocsSyncMigration } from 'payload-markdown-docs/migrations'
```

See [Upgrading to 1.1](/reference/upgrade-1-1) for when to call it.

`repairDocsRoutes` rewrites generated docs routes that went stale after a docs
set or docs group route change; see
[Repairing Stale Docs Routes](/reference/migration#repairing-stale-docs-routes).

## `/mcp`

Use `/mcp` in the Payload config to give AI agents MCP tools through
`@payloadcms/plugin-mcp`:

```ts
import { withPayloadMarkdownDocsMcp } from 'payload-markdown-docs/mcp'

mcpPlugin(withPayloadMarkdownDocsMcp({ collections: { pages: { enabled: true } } }))
```

It also exports the tool definitions (`payloadMarkdownDocsMcpTools`) and the operations
as plain functions for custom agents. Server-only. See [MCP Agent Tools](/workflow/mcp).

Sync planning, security, routing internals, hashing, frontmatter parsing, and
manifest builders are internal package implementation details.

The CLI is the sync API for v1. The package does not expose a public `/sync`
SDK subpath.

## Consumer package

`payload-markdown-docs-consumer` is a separate package for other
sites. It has no dependencies, and exports `createDocsProjectsClient`, the wire
types and parsers of the [projects API](/reference/projects-api), and the
stack helpers `flattenStack` and `formatStackCategory`.
