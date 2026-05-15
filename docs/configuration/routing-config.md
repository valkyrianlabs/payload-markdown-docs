---
title: Routing Config
navTitle: Routing
description: Configure route reservations and optional Pages collision checks.
order: 230
status: published
tags:
  - configuration
  - routing
---

# Routing Config

Docs groups and docs sets own docs route namespaces. Optional Pages collision checks can reject unsafe overlaps with your Pages collection.

```ts
payloadMarkdownDocs({
  routing: {
    pages: {
      enabled: true,
      collection: 'pages',
      routeField: 'slug',
      allowBridgePages: true,
      bridgeField: 'docsBridge',
    },
  },
})
```

## Pages Checks

When enabled, docs-side Pages checks can reject:

- an exact docs set route colliding with a Page
- a Page route inside a docs set namespace
- an auto docs group route colliding with a Page
- a generated doc route colliding with a Page

Ancestor Pages can still exist. For example, a Page at `/plugins` can coexist with a docs set at `/plugins/payload-markdown-docs`.

## Docs Set Route Modes

New docs sets default to `routeMode: "docs-root"`.

```text
/plugins/payload-markdown
/plugins/payload-markdown/getting-started
```

Use `routeMode: "product-nested"` when the product route should be owned by the
host app or Pages collection:

```text
/plugins/payload-markdown
/plugins/payload-markdown/docs
/plugins/payload-markdown/docs/getting-started
```

In product-nested mode, route collision checks protect
`/plugins/payload-markdown/docs` and descendants but allow
`/plugins/payload-markdown`.

## Docs Group Page Modes

New docs groups default to `pageMode: "auto"`, which lets the docs plugin render
a generated group landing page, such as `/plugins`, with cards for direct child
groups and docs sets.

Use `pageMode: "custom"` when the site owns the group route manually. Existing
records without `pageMode` keep legacy `serveIndex` behavior.

## Bridge Pages

A bridge Page is an optional convention for one Page per docs set or docs group. It can help your site navigation point to docs without creating one Page per Markdown file.

:::callout {variant="info" title="Not automated"}
Bridge Page mutation is not implemented. The plugin only recognizes the concept in route collision helpers when configured.
:::
