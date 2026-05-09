---
title: Docs Set Admin Manager
navTitle: Manager
description: Review generated docs records from the docs set edit view.
order: 500
status: published
tags:
  - admin
  - docs-sets
---

# Docs Set Admin Manager

The Docs Set Admin Manager is an overview on the docs set edit view.

It exists so users manage docs from one central docs set context instead of managing one Payload Page per Markdown file.

## What It Shows

- route base
- sync metadata
- total generated docs
- archived docs
- draft and published docs
- hidden-from-nav docs
- docs with overrides
- generated docs grouped by source path
- links to generated docs records

## What It Does Not Do

- it does not sync docs
- it does not publish generated docs
- it does not mutate Pages
- it does not create Pages
- it does not inline-edit overrides yet

:::callout {variant="info" title="Override editing"}
Open a generated docs record from the manager to edit per-doc overrides. Inline override editing from the manager is deferred.
:::

See [overrides](/admin/overrides).
