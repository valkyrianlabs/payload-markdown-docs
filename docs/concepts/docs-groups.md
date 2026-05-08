---
title: Docs Groups
description: Docs groups reserve route namespaces for related docs sets.
order: 110
status: published
tags:
  - concepts
  - routing
---

# Docs Groups

Docs groups organize docs sets under shared route namespaces.

Examples:

- `/plugins`
- `/products`
- `/internal/tools`

A docs group can contain many docs sets:

```text
Docs Groups
  Plugins
    Payload Markdown
    Payload Markdown Docs
```

## Fields

Important docs group fields include:

- `title`
- `slug`
- `parent`
- `description`
- `navTitle`
- `order`
- `serveIndex`

The route path is derived from parent group slugs plus the group slug.

## `serveIndex`

When `serveIndex` is false, the group reserves descendant space but does not claim its own route. That allows a normal Page at `/plugins` while docs sets live under `/plugins/payload-markdown`.

When `serveIndex` is true, the route adapter can resolve the group route as a docs group index.

:::callout {variant="info" title="Groups are namespaces"}
Groups are not a replacement for Pages. They are a docs routing and organization model.
:::

See [docs sets](/concepts/docs-sets) for the per-project docs site model.
