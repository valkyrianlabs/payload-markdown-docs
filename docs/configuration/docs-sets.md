---
title: Docs Sets Configuration
navTitle: Docs Sets
description: Configure docs packages without duplicating routing or security internals.
order: 210
status: published
tags:
  - configuration
  - docs-sets
---

# Docs Sets Configuration

Docs sets are stored in `Docs Globals > Sets`. A set represents one docs
package.

## Fields

For a typical docs set, configure:

- `title`
- `slug`
- `group`, optional
- `routeMode`, default `docs-root`
- `branch`, default `main`
- `allowPullRequests`, default off
- `description`, optional
- `meta`, optional SEO/social preview metadata

The `slug` is also the manifest source and the GitHub OIDC audience. The
route base is derived from the optional group route plus the set slug.

Example:

```text
title: Payload Markdown Docs
slug: payload-markdown-docs
group: plugins
branch: main
```

This resolves to `/plugins/payload-markdown-docs`.

Use `routeMode: product-nested` when the docs should live below `/docs` so the
host app can own the product route:

```text
/plugins/payload-markdown-docs
/plugins/payload-markdown-docs/docs
```

## SEO / OpenGraph

The `meta` group uses `@payloadcms/plugin-seo` field components for standard
social preview metadata:

- `title`
- `description`
- `image`

The image uses the default Payload `media` collection. SEO data feeds metadata
helpers only; it does not render a hero or banner in
`PayloadMarkdownDocsPage`.

SEO fields are enabled by default. Set `seo: false` in `payloadMarkdownDocs()`
to omit them.

## Advanced Security

You do not need this for normal docs publishing.

Leave advanced security disabled to allow any workflow from a trusted GitHub
owner/repository on the configured branch. Enable it only when you want exact
workflow refs. When enabled, an empty workflow list rejects all workflow
publishing for that docs set.

GitHub tag refs are allowed from trusted repositories when advanced security is
disabled. If tag publishing needs stricter control, enable advanced security and
add the exact release workflow refs.

## Sync Metadata

The `sync` group stores `lastSyncedAt` and `lastStatus`. The Docs Set Admin
Manager computes generated docs counts directly from linked generated records.

See [Docs Set Admin Manager](/admin/docs-set-manager).
