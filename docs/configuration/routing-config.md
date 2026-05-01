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
- a generated doc route colliding with a Page

Ancestor Pages can still exist. For example, a Page at `/plugins` can coexist with a docs set at `/plugins/payload-markdown-docs`.

## Bridge Pages

A bridge Page is an optional convention for one Page per docs set or docs group. It can help your site navigation point to docs without creating one Page per Markdown file.

:::callout {variant="info" title="Not automated"}
Bridge Page mutation is not implemented. The plugin only recognizes the concept in route collision helpers when configured.
:::
