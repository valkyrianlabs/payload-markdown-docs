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
- `branch`, default `main`
- `allowPullRequests`, default off
- `description`, optional

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

## Advanced Security

You do not need this for normal docs publishing.

Leave advanced security disabled to allow any workflow from a trusted GitHub
owner/repository on the configured branch. Enable it only when you want exact
workflow refs. When enabled, an empty workflow list rejects all workflow
publishing for that docs set.

## Sync Metadata

The `sync` group stores last sync status and counts. The Docs Set Admin Manager
uses this metadata for the generated docs overview.

See [Docs Set Admin Manager](/admin/docs-set-manager).
