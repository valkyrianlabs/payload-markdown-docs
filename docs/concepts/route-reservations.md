---
title: Route Reservations
description: How docs groups, docs sets, docs records, and optional Pages checks avoid route collisions.
order: 130
status: published
tags:
  - concepts
  - routing
---

# Route Reservations

Route reservations protect docs routes from colliding with other docs routes or, when configured, Pages routes.

:::toc {title="On this page" depth="3" theme="compact"}
:::

## Reservation Owners

- docs groups can reserve route namespaces
- docs sets reserve their route base and descendants
- generated docs records reserve exact generated routes
- Pages checks can be enabled from the docs side

## Example

```text
Docs group: /plugins
Docs set: /plugins/payload-markdown-docs
Doc: /plugins/payload-markdown-docs/workflow/signed-push
```

With `routeMode: "docs-root"`, the docs set owns
`/plugins/payload-markdown-docs` and descendants. A normal Page at `/plugins`
can still exist if the group uses `pageMode: "custom"`.

With `routeMode: "product-nested"`, the docs set owns
`/plugins/payload-markdown-docs/docs` and descendants. The parent
`/plugins/payload-markdown-docs` route can be owned by Pages or the host app.

With `pageMode: "auto"`, a group claims its route, such as `/plugins`, for a
generated card index. With `pageMode: "custom"`, the group route is not claimed.

## Pages Collision Checks

Pages collision checks are opt-in:

```ts
payloadMarkdownDocs({
  routing: {
    pages: {
      enabled: true,
      collection: 'pages',
      routeField: 'slug',
    },
  },
})
```

These checks do not mutate Pages and do not add Page hooks. They only help docs sync reject unsafe route collisions.

:::callout {variant="warning" title="Bridge Pages are not generated"}
A bridge Page is an optional convention for one Page per docs set or docs group. The plugin does not create bridge Pages automatically, and it never creates one Page per Markdown doc.
:::
