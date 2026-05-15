---
title: Plugin Config
navTitle: Plugin
description: Configure payloadMarkdownDocs for the dedicated docs workflow.
order: 200
status: published
tags:
  - configuration
---

# Plugin Config

`payloadMarkdownDocs()` is a Payload plugin factory.

```ts
import { payloadMarkdownDocs } from '@valkyrianlabs/payload-markdown-docs'

payloadMarkdownDocs({
  enabled: true,
})
```

An enabled plugin injects the default docs infrastructure and registers the sync
endpoint. A disabled plugin is an exact no-op.

:::toc {title="On this page" depth="3" theme="compact"}
:::

## Recommended Config

```ts
import { payloadMarkdownDocs } from '@valkyrianlabs/payload-markdown-docs'
import { buildConfig } from 'payload'

export default buildConfig({
  plugins: [
    payloadMarkdownDocs({
      auth: {
        githubOidc: true,
      },
      target: {
        type: 'docsCollection',
        enableDrafts: true,
      },
      sync: {
        allowWrites: true,
        allowPublish: true,
        allowHardDelete: false,
        deleteBehavior: 'archive',
      },
    }),
  ],
})
```

## Main Sections

- `auth` enables sync request verification modes. Use `githubOidc`, `ed25519`,
  or both on the same endpoint.
- `target` configures the dedicated generated docs collection.
- `sync` controls write, publish, and delete authority.
- `routing` configures route collision checks.
- `collections` customizes infrastructure collection slugs.
- `blocks` optionally installs docs marketing blocks into existing layout block fields.

GitHub trust belongs in `Docs Globals > Trusted`. Ed25519 public keys belong in
`Docs Globals > Keys`. Docs packages belong in `Docs Globals > Sets`.

See [sync config](/configuration/sync-config) and [routing config](/configuration/routing-config) for the safety gates.

## Real App Pattern

Most apps keep the plugin config small and move package-specific decisions to
Payload Admin:

- register the plugin once in `payload.config.ts`
- create one docs set per docs package in `Docs Globals > Sets`
- use docs groups for route namespaces such as `/plugins`
- add global GitHub owners in `Docs Globals > Trusted`
- add Ed25519 public keys in `Docs Globals > Keys` only for local or non-GitHub CI
- render docs from a Next route with the `/next` adapter
- serve raw `.md` exports from explicit Next route handlers

Do not add one Payload Page per Markdown file. The generated `docs` collection is
internal storage for synced content, route resolution, search, and admin review.

## Minimal Local Config

For local validation or admin-only experiments, this is enough to register the
collections and sync endpoint:

```ts
payloadMarkdownDocs({
  enabled: true,
})
```

That does not make sync writes publicly usable. Authentication is disabled until
you enable `auth.githubOidc`, `auth.ed25519`, or both. Sync writes are rejected
until `sync.allowWrites: true`.

## Auth Patterns

GitHub Actions publishing usually uses OIDC:

```ts
payloadMarkdownDocs({
  auth: {
    githubOidc: true,
  },
})
```

Local machines and non-GitHub CI can use Ed25519 request signatures:

```ts
payloadMarkdownDocs({
  auth: {
    ed25519: true,
  },
})
```

Both modes can be enabled on the same endpoint. A bearer token is treated as a
GitHub OIDC request; Ed25519 headers are treated as a signed request.

## Target Collection

The implemented target is the dedicated generated docs collection:

```ts
payloadMarkdownDocs({
  target: {
    type: 'docsCollection',
    enableDrafts: true,
    markdownField: 'content',
  },
})
```

`target.type` currently only accepts `docsCollection`. Existing collection and
block targets are intentionally not implemented.

`target.markdownField` renames the generated Markdown field. If you customize it,
pass the same field name to the `/next` helpers:

```ts
await resolvePayloadMarkdownDocsRoute({
  payload,
  slug,
  markdownField: 'body',
})
```

## Collection Slugs

Infrastructure collection slugs can be customized when an app already reserves
the defaults:

```ts
payloadMarkdownDocs({
  collections: {
    docs: { slug: 'generated-docs' },
    docsGroups: { slug: 'docs-groups' },
    docsSets: { slug: 'docs-sets' },
    docsKeys: { slug: 'docs-keys' },
    docsTrusted: { slug: 'docs-trusted' },
    syncRuns: { slug: 'docs-sync-runs' },
    nonces: { slug: 'docs-sync-nonces' },
  },
})
```

The plugin rejects duplicate requested slugs and slugs that already exist in the
incoming Payload config. If both `target.slug` and `collections.docs.slug` are
provided, they must match.

Disabling infrastructure collections is an advanced integration path. Normal
apps should leave the defaults enabled; the sync endpoint needs docs sets for
source resolution and needs audit/nonces for applied sync.

## Hero Images

Generated docs records include an optional `heroImage` upload field. It uses the
`media` collection by default.

Add extra upload collections when your app stores docs imagery elsewhere:

```ts
payloadMarkdownDocs({
  target: {
    heroImage: {
      additionalMediaCollections: ['docs-media'],
    },
  },
})
```

Set `target.heroImage: false` to omit the field.

## Endpoint

The sync endpoint defaults to `/api/payload-markdown-docs/sync` because Payload
mounts plugin endpoints under `/api`.

```ts
payloadMarkdownDocs({
  endpoint: {
    path: '/payload-markdown-docs/sync',
    maxBodyBytes: 5_000_000,
  },
})
```

Set `enabled: false` only for environments where the plugin should be a complete
no-op.
