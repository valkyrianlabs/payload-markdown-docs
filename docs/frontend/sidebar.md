---
title: Sidebar Helper
navTitle: Sidebar
description: Build deterministic sidebar data for a generated docs set.
order: 420
status: published
tags:
  - frontend
  - sidebar
---

# Sidebar Helper

The route adapter can return sidebar data for a docs set. You can also use the sidebar helpers directly.

Sidebar items are built from generated docs records and sorted deterministically by:

1. `order`
2. `sourcePath`
3. `route`

The helper excludes archived docs and docs hidden from navigation.

## Labels

Sidebar labels use:

- override nav title
- doc `navTitle`
- doc `title`
- source path fallback

## Generated Tree

The tree is derived from source paths and routes. It is data, not a required UI component, so your app can render it however it wants.

:::details {title="Why source paths matter"}
Source paths are stable for agents and developers. They also make generated navigation predictable even when title text changes.
:::
