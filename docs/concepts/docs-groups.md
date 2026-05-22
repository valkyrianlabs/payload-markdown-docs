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
- `pageMode`

The route path is derived from parent group slugs plus the group slug.

## `pageMode`

`pageMode` controls who owns the group route.

- `auto` generates a docs group landing page at the group route, such as `/plugins`
- `custom` leaves the group route for the host app or Pages collection

With `auto`, `/plugins` can render a generated card index for direct child
groups and docs sets. With `custom`, `/plugins` is left alone while docs sets can
still live under routes like `/plugins/payload-markdown`.

:::callout {variant="info" title="Groups are namespaces"}
Groups are not a replacement for Pages. They are a docs routing and organization model.
:::

See [docs sets](/concepts/docs-sets) for the per-project docs site model.
