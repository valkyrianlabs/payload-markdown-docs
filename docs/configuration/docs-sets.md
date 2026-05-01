---
title: Docs Sets Configuration
navTitle: Docs Sets
description: Configure docs groups and docs sets for server-owned route bases.
order: 210
status: published
tags:
  - configuration
  - docs-sets
---

# Docs Sets Configuration

Docs sets are stored in the `docs-sets` collection by default. They map signed source ids to server-owned route bases.

## Required Fields

For a typical docs set, configure:

- `title`
- `slug`
- `sourceId`
- `routeBase`

Example:

```text
title: Payload Markdown Docs
slug: payload-markdown-docs
sourceId: main-docs
routeBase: /plugins/payload-markdown-docs
```

## Source Root

`sourceRoot` describes the source folder, usually `docs`. It is metadata for humans and future tooling. The sync endpoint still validates the signed manifest and server config.

## Defaults

The `defaults` group is schema runway for rendering defaults:

- `theme`
- `heroEyebrow`
- `heroTitle`
- `heroDescription`
- `seoTitle`
- `seoDescription`
- `sidebarMode`

The current route adapter exposes enough data for rendering, but it does not implement a full theme system.

## Sync Metadata

The `sync` group stores last sync status and counts. The Docs Set Admin Manager uses this metadata for the generated docs overview.

See [Docs Set Admin Manager](/admin/docs-set-manager).
