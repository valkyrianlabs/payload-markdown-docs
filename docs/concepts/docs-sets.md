---
title: Docs Sets
description: Docs sets are the central management unit for generated documentation.
order: 120
status: published
tags:
  - concepts
  - docs-sets
---

# Docs Sets

A docs set represents one documentation site.

Examples:

- Payload Markdown
- Payload Markdown Docs
- Internal Platform Docs

The docs set is the user-facing management unit. Generated docs records belong to a docs set, but users should not manage documentation as hundreds of Pages.

## Core Fields

- `title`
- `slug`
- `sourceId`
- `sourceRoot`
- `group`
- `routeBase`
- `description`
- `navTitle`
- `order`
- `auth`
- `defaults`
- `sync`

## Source Id

The signed manifest includes `source.id`. The endpoint resolves that id to a docs set by `sourceId`.

If a docs set is found:

- the docs set route base is used for route generation
- the docs set auth policy is used for Ed25519 keys and GitHub OIDC allowlists
- generated docs records are linked to the docs set
- existing docs lookup is scoped to that docs set where possible

If no docs set is found, the endpoint can fall back to configured `sources` for
backward compatibility. New sources should normally be added in Payload Admin by
creating docs sets, not by redeploying server config.

## Route Base

A docs set route base is a server-owned route prefix, such as:

```text
/plugins/payload-markdown-docs
```

`index.md` routes to the route base. Nested files route below it.

:::details {title="Why sourcePath is not globally unique"}
Many docs sets can contain `index.md` or `configuration/sync.md`. The generated docs collection keeps `sourcePath` indexed but not globally unique. Routes remain globally meaningful and collision-checked.
:::

Use [route reservations](/concepts/route-reservations) to understand collision behavior.
