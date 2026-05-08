---
title: Overrides
description: Customize generated docs records without editing the synced Markdown source.
order: 510
status: published
tags:
  - admin
  - overrides
---

# Overrides

Generated docs records can store a small set of per-doc navigation overrides.

Supported override fields include:

- `navTitle`
- `hideFromNav`

## When To Use Overrides

Use overrides for CMS-owned presentation choices that should not change the Git-backed Markdown source.

Examples:

- hide a generated doc from sidebar navigation
- adjust a short nav label

:::callout {variant="warning" title="Do not use overrides for source content"}
Markdown content should stay in Git. Overrides are for Payload-side presentation metadata.
:::

Inline editing from the docs set manager is not implemented yet. Open the generated docs record to edit override fields.
