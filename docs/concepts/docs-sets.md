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
- `routeMode`
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

`routeMode` controls whether docs live at the product route or under a nested
`/docs` segment.

### `docs-root`

An ungrouped docs set routes at:

```text
/{slug}
```

A grouped docs set routes at:

```text
/{group-slug}/{set-slug}
```

For example:

```text
/plugins/payload-markdown
/plugins/payload-markdown/getting-started
```

### `product-nested`

Grouped product docs route under `/docs`:

```text
/{group-slug}/{set-slug}/docs
```

For example:

```text
/plugins/payload-markdown
/plugins/payload-markdown/docs
/plugins/payload-markdown/docs/getting-started
```

The docs plugin owns `/plugins/payload-markdown/docs` and descendants. The
parent `/plugins/payload-markdown` route is intentionally available for a
product or marketing page owned by the host app or Pages collection.

`index.md` routes to the route base. Nested files route below it.

:::details {title="Why sourcePath is not globally unique"}
Many docs sets can contain `index.md` or `configuration/sync.md`. The generated
docs collection keeps `sourcePath` indexed but not globally unique. Routes
remain globally meaningful and collision-checked.
:::

Use [route reservations](/concepts/route-reservations) to understand collision behavior.

## Changing Docs Set Routes

Generated docs and assets store their full route. When a change moves a docs
set's route base, the plugin rewrites those stored routes in the same
transaction, so the site, the nav and the admin manager show the new paths
right away instead of after the next sync. That covers:

- changing a docs set's group, slug or `routeMode`
- changing a group's slug or parent, for every docs set below it
- deleting a group (its docs sets lose the group segment; child groups become
  top-level groups)

Each doc keeps its path below the route base (`/plugins/x/guide` becomes
`/tools/x/guide`), the published row and the latest draft both move, archived
docs keep their tombstone with the new path inside, and skill, `llms.txt` and
static asset routes below the product route move too. Root `/llms.txt` and
`/llms-full.txt` are unchanged. The old and new paths are revalidated.

- A draft saved over a published docs set changes nothing until it is published.
- A change that would move docs onto routes another docs set already serves is
  rejected (HTTP 409) and nothing is saved.
- Older version history keeps the route each version was saved with.
- Pass `context: { payloadMarkdownDocsSkipRouteRewrite: true }` on a Local API
  update to skip the rewrite (the next sync, or `repairDocsRoutes`, catches up).

Saving a published docs set also repairs routes that were already stale. For
installs that changed routes before this existed, see
[Repairing Stale Docs Routes](/reference/migration#repairing-stale-docs-routes).
