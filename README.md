# @valkyrianlabs/payload-markdown-docs

Git-backed Markdown documentation sync for Payload CMS, powered by `@valkyrianlabs/payload-markdown`.

## Status

This package is in early plugin skeleton stage. It currently exports a no-op Payload plugin factory and public configuration types so the real docs sync workflow can be built in small, reviewed phases.

Not implemented yet:

- signed sync endpoint
- request authentication
- manifest validation
- docs collections
- docs upsert engine
- CLI
- publish, draft, archive, or delete behavior

## Product Thesis

`@valkyrianlabs/payload-markdown-docs` should let developers publish Git-backed Markdown documentation into Payload CMS.

Intended future workflow:

1. A project keeps documentation in a repo-local `docs/` folder.
2. AI agents or developers maintain those Markdown files directly.
3. CI/CD validates and signs a docs manifest.
4. The Payload plugin receives the signed sync request.
5. The plugin authenticates, validates, diffs, and applies the docs update.
6. Payload stores docs pages using `@valkyrianlabs/payload-markdown` as the content/rendering layer.

The CI/client sends docs content. The Payload plugin/server decides where it may go.

## Relationship To payload-markdown

`@valkyrianlabs/payload-markdown` provides the Markdown content layer: fields, blocks, rendering, directives, themes, and authoring UX.

`@valkyrianlabs/payload-markdown-docs` will provide the docs publishing workflow around that content layer: ingestion, manifests, signed sync, audit trails, collection integration, and CI/local tooling.

This package should not duplicate the Markdown renderer.

## Install

```bash
pnpm add @valkyrianlabs/payload-markdown-docs @valkyrianlabs/payload-markdown
```

Package installation and publishing details may change before the first MVP release.

## Basic Usage

```ts
import { payloadMarkdownDocs } from '@valkyrianlabs/payload-markdown-docs'
import { buildConfig } from 'payload'

export default buildConfig({
  plugins: [
    payloadMarkdownDocs({
      enabled: true,
    }),
  ],
})
```

In the current Phase 1 skeleton, this preserves the incoming Payload config and does not register endpoints, collections, fields, or admin components.

## Configuration Shape

The public config types are available for future phases:

```ts
payloadMarkdownDocs({
  enabled: true,
  endpoint: {
    path: '/payload-markdown-docs/sync',
    maxBodyBytes: 5_000_000,
  },
  auth: {
    mode: 'ed25519',
    keys: [
      {
        id: 'github-actions-main',
        publicKey: process.env.DOCS_SYNC_PUBLIC_KEY!,
      },
    ],
    maxSkewSeconds: 300,
    nonceTtlSeconds: 600,
  },
  sources: [
    {
      id: 'main-docs',
      root: 'docs',
      routeBase: '/docs',
    },
  ],
  target: {
    type: 'docsCollection',
    slug: 'docs',
    markdownField: 'content',
    enableDrafts: true,
  },
  sync: {
    defaultPublishMode: 'draft',
    deleteBehavior: 'archive',
    requireDryRunBeforeApply: false,
  },
})
```

This shape is scaffolding only. These options do not activate sync behavior yet.

## Roadmap

- Phase 1: clean plugin skeleton and public config types.
- Phase 2: dedicated docs collection, sync run audit collection, and nonce storage design.
- Phase 3: manifest builder and validation core.
- Phase 4: CLI foundation for local validate, plan, and keygen.
- Phase 5: signed sync endpoint with Ed25519 verification and dry-run only.
- Phase 6: docs upsert engine.
- Phase 7: publishing modes and archive/delete behavior.
- Phase 8: existing collection and block target modes.
- Phase 9: CI workflow examples.
- Phase 10: GitHub OIDC auth mode.
- Phase 11: agent workflow polish.

See `.codex/scratch/roadmap.md` for the working implementation roadmap.
