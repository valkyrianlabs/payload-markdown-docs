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
- `openGraph`, optional social preview metadata

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

## OpenGraph Preview

The `openGraph` group stores standard social preview metadata:

- `title`
- `description`
- `image`

The image uses the configured/default Payload media collection. OpenGraph data
feeds metadata helpers only; it does not render a hero or banner in
`PayloadMarkdownDocsPage`.

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

The `sync` group stores last sync status and counts. The Docs Set Admin Manager
uses this metadata for the generated docs overview.

See [Docs Set Admin Manager](/admin/docs-set-manager).
