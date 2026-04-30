# @valkyrianlabs/payload-markdown-docs

Git-backed Markdown documentation sync for Payload CMS, powered by `@valkyrianlabs/payload-markdown`.

## Status

This package is in early pre-MVP development. It currently wires the dedicated docs storage model into Payload, provides pure manifest validation/planning utilities, includes the first local CLI, and registers a signed dry-run sync endpoint.

Not implemented yet:

- docs upsert engine
- remote `push`
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

In the current Phase 5 build, an enabled plugin registers dedicated docs infrastructure collections and a signed dry-run sync endpoint. It does not mutate docs content.

Default generated collections:

- `docs`
- `docs-sync-runs`
- `docs-sync-nonces`

## Configuration Shape

The dedicated docs collection can be configured with the MVP target mode:

```ts
payloadMarkdownDocs({
  enabled: true,
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

The docs collection includes title/nav metadata, generated route, source path/hash fields, hierarchy fields, a Markdown content field powered by `@valkyrianlabs/payload-markdown`, and sync metadata.

The sync run and nonce collections are active in Phase 5 for accepted dry-run requests. The endpoint may store accepted nonce records and sync-run audit records, but it does not create, update, archive, delete, or publish docs pages.

## Validation Core

Phase 3 adds pure utilities for building, validating, and planning docs manifests. These utilities do not read the filesystem, make network requests, call Payload, or write to the database.

```ts
import {
  buildDocsManifest,
  planDocsSync,
  validateDocsManifest,
} from '@valkyrianlabs/payload-markdown-docs'

const manifest = buildDocsManifest({
  sourceId: 'main-docs',
  root: 'docs',
  files: [
    {
      path: 'getting-started/installation.md',
      content: '# Installation\n\nInstall the package.',
    },
  ],
})

const validated = validateDocsManifest(manifest, {
  allowedSourceIds: ['main-docs'],
  routeBase: '/docs',
})

if (validated.ok) {
  const plan = planDocsSync({
    desired: validated.data,
    existing: [],
  })

  console.log(plan.create)
}
```

The validation core handles safe docs paths, Markdown-only files, SHA-256 hashing, supported frontmatter, manifest defaults, size limits, duplicate path detection, route derivation, and abstract dry sync planning.

## Local CLI

Phase 4 adds local-only CLI commands. They read Markdown files from disk and reuse the validation/planning core. They do not upload content, sign requests, call Payload, or write to a database.

```bash
payload-markdown-docs validate ./docs --source main-docs
payload-markdown-docs manifest ./docs --source main-docs --pretty
payload-markdown-docs plan ./docs --existing existing-docs.json
payload-markdown-docs keygen
```

`validate` walks a local docs directory, builds a manifest in memory, validates it, and prints a human summary by default. Use `--json` for machine-readable output.

`manifest` prints the generated manifest JSON after validation succeeds. Use `--pretty` for formatted JSON.

`plan` compares the desired local docs manifest against an optional JSON file containing abstract existing docs records. It prints create/update/unchanged/archive/delete/draft counts by default, or the full plan with `--json`.

`keygen` generates Ed25519 keys for the future signed sync workflow:

```bash
payload-markdown-docs keygen --out .docs-sync-keys
```

Key generation is available now, but CLI request signing and remote push are not implemented yet.

## Dry-Run Sync Endpoint

Phase 5 registers:

```text
POST /api/payload-markdown-docs/sync
```

The endpoint accepts JSON manifests only. It verifies signed request headers, validates the manifest, reads existing docs from the dedicated docs collection when available, computes a dry-run plan, stores nonce/audit records, and returns a summary.

Required signed headers:

```text
X-VL-MD-DOCS-Key-Id
X-VL-MD-DOCS-Timestamp
X-VL-MD-DOCS-Nonce
X-VL-MD-DOCS-Body-SHA256
X-VL-MD-DOCS-Signature
```

Canonical signing string:

```text
v1
POST
/api/payload-markdown-docs/sync
<timestamp>
<nonce>
<sha256(body)>
```

The canonical path is the actual request pathname seen by the endpoint. For the default Payload API route, that is `/api/payload-markdown-docs/sync`.

Configure Ed25519 auth before using the endpoint:

```ts
payloadMarkdownDocs({
  enabled: true,
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
})
```

If auth is omitted or disabled, the endpoint rejects sync requests. `mode: "sync"` is also rejected in Phase 5; only dry-run manifests are accepted.

## Current Limitations

- No docs create/update/archive behavior is implemented.
- No remote CLI push/upload command is implemented.
- No request signing helper is implemented.
- Existing collection and block target modes are not implemented.
- Nonce uniqueness across `keyId + nonce` is not enforced by portable Payload config yet.

## Roadmap

- Phase 1: clean plugin skeleton and public config types. Done.
- Phase 2: dedicated docs collection, sync run audit collection, and nonce storage design. Done.
- Phase 3: manifest builder and validation core. Done.
- Phase 4: CLI foundation for local validate, manifest, plan, and keygen. Done.
- Phase 5: signed sync endpoint with Ed25519 verification and dry-run only. Current.
- Phase 6: docs upsert engine. Next.
- Phase 7: publishing modes and archive/delete behavior.
- Phase 8: existing collection and block target modes.
- Phase 9: CI workflow examples.
- Phase 10: GitHub OIDC auth mode.
- Phase 11: agent workflow polish.

See `.codex/scratch/roadmap.md` for the working implementation roadmap.
