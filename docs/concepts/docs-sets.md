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

The docs set is the user-facing management unit. Generated docs records belong
to a docs set, but users should not manage documentation as hundreds of Pages.

## Core Fields

- `title`
- `slug`
- `group`
- `branch`
- `allowPullRequests`
- `description`
- `advancedSecurity`
- `sync`

## Slug

The manifest includes `source.id`. The endpoint resolves that id to a docs set
by `slug`.

If a docs set is found:

- the docs set route base is derived from its group and slug
- GitHub OIDC audience is derived from the slug
- branch/ref checks use the docs set branch
- generated docs records are linked to the docs set
- existing docs lookup is scoped to that docs set where possible

## Routes

An ungrouped docs set routes at:

```text
/{slug}
```

A grouped docs set routes at:

```text
/{group-slug}/{set-slug}
```

`index.md` routes to the route base. Nested files route below it.

:::details {title="Why sourcePath is not globally unique"}
Many docs sets can contain `index.md` or `configuration/sync.md`. The generated
docs collection keeps `sourcePath` indexed but not globally unique. Routes
remain globally meaningful and collision-checked.
:::

Use [route reservations](/concepts/route-reservations) to understand collision behavior.
