# @valkyrianlabs/payload-markdown-docs

Git-backed Markdown documentation sync for Payload CMS, powered by `@valkyrianlabs/payload-markdown`.

## Status

The dedicated docs collection workflow is implemented and ready to dogfood:

- dedicated docs, sync-run audit, and nonce collections
- pure manifest validation and planning utilities
- local CLI for `validate`, `manifest`, `plan`, `keygen`, and signed `push`
- signed sync endpoint with nonce replay protection
- sync-mode writes to the dedicated docs collection when explicitly enabled
- draft/publish lifecycle controls for draft-enabled dedicated docs collections
- hard delete only behind an explicit server gate

See [Dedicated Docs Sync Workflow](docs/dedicated-docs-workflow.md) for the complete setup guide.

Not implemented yet:

- GitHub OIDC auth mode
- existing collection targets
- block targets
- agent skill installer

## Product Thesis

`@valkyrianlabs/payload-markdown-docs` should let developers publish Git-backed Markdown documentation into Payload CMS.

Intended workflow:

1. A project keeps documentation in a repo-local `docs/` folder.
2. AI agents or developers maintain those Markdown files directly.
3. CI/CD validates and signs a docs manifest.
4. The Payload plugin receives the signed sync request.
5. The plugin authenticates, validates, diffs, and applies the docs update.
6. Payload stores docs pages using `@valkyrianlabs/payload-markdown` as the content/rendering layer.

The CI/client sends docs content. The Payload plugin/server decides where it may go.

## Relationship To payload-markdown

`@valkyrianlabs/payload-markdown` provides the Markdown content layer: fields, blocks, rendering, directives, themes, and authoring UX.

`@valkyrianlabs/payload-markdown-docs` provides the docs publishing workflow around that content layer: ingestion, manifests, signed sync, audit trails, collection integration, and CI/local tooling.

This package should not duplicate the Markdown renderer.

## Install

```bash
pnpm add @valkyrianlabs/payload-markdown-docs @valkyrianlabs/payload-markdown
```

Package publishing details may still change before a stable release.

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

An enabled plugin registers dedicated docs infrastructure collections and a signed sync endpoint. Dry-run remains the default safe path. Sync-mode writes require explicit server configuration.

Default generated collections:

- `docs`
- `docs-sync-runs`
- `docs-sync-nonces`

## Configuration Shape

The dedicated docs collection can be configured with the default target mode:

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
    allowHardDelete: false,
    allowPublish: false,
    allowWrites: false,
    defaultPublishMode: 'draft',
    deleteBehavior: 'archive',
    requireDryRunBeforeApply: false,
  },
})
```

The docs collection includes title/nav metadata, generated route, source path/hash fields, hierarchy fields, a Markdown content field powered by `@valkyrianlabs/payload-markdown`, and sync metadata.

The sync run and nonce collections are active for accepted endpoint requests. The endpoint stores accepted nonce records and sync-run audit records.

## Dedicated Docs Workflow

For a complete default setup, configure a signed, draft-enabled dedicated docs collection:

```ts
import { payloadMarkdownDocs } from '@valkyrianlabs/payload-markdown-docs'

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
  },

  target: {
    type: 'docsCollection',
    enableDrafts: true,
  },

  sources: [
    {
      id: 'main-docs',
      root: 'docs',
      routeBase: '/docs',
    },
  ],

  sync: {
    allowWrites: true,
    allowPublish: true,
    allowHardDelete: false,
    defaultPublishMode: 'draft',
    deleteBehavior: 'archive',
  },
})
```

Generate keys:

```bash
pnpm exec payload-markdown-docs keygen --out .docs-sync
```

The public key goes to Payload config or `DOCS_SYNC_PUBLIC_KEY`. The private key goes to CI as a secret such as `DOCS_SYNC_PRIVATE_KEY`; do not commit it.

Validate locally:

```bash
pnpm exec payload-markdown-docs validate ./docs --source main-docs
pnpm exec payload-markdown-docs manifest ./docs --source main-docs --pretty
pnpm exec payload-markdown-docs plan ./docs --source main-docs
```

Dry-run a signed upload:

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-file .docs-sync/docs-sync-private.pem \
  --dry-run
```

Apply a signed sync:

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --sync
```

Publish during sync:

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --sync \
  --publish
```

`--publish` only works when the server has `sync.allowPublish: true` and the docs collection has drafts enabled.

Hard delete is intentionally gated. Archive is the safer default. To allow hard deletes, the server must opt in:

```ts
sync: {
  allowHardDelete: true,
  deleteBehavior: 'delete',
}
```

See `examples/docs/` for a small valid docs fixture and `examples/github-actions/publish-docs.yml` for a CI workflow that dry-runs on pull requests and syncs/publishes on `main`.

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

The CLI reads Markdown files from disk and reuses the validation/planning core.

```bash
payload-markdown-docs validate ./docs --source main-docs
payload-markdown-docs manifest ./docs --source main-docs --pretty
payload-markdown-docs plan ./docs --existing existing-docs.json
payload-markdown-docs keygen
payload-markdown-docs push ./docs --endpoint "$DOCS_SYNC_ENDPOINT" --source main-docs --key-id github-actions-main --private-key-file .docs-sync/docs-sync-private.pem --dry-run
```

`validate` walks a local docs directory, builds a manifest in memory, validates it, and prints a human summary by default. Use `--json` for machine-readable output.

`manifest` prints the generated manifest JSON after validation succeeds. Use `--pretty` for formatted JSON.

`plan` compares the desired local docs manifest against an optional JSON file containing abstract existing docs records. It prints create/update/unchanged/archive/delete/draft counts by default, or the full plan with `--json`.

`keygen` generates Ed25519 keys for signed sync:

```bash
payload-markdown-docs keygen --out .docs-sync
```

`push` builds a local manifest, validates it, signs the exact JSON request body, and uploads it to the configured sync endpoint. Default mode is dry-run:

```bash
payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-file .docs-sync/docs-sync-private.pem \
  --dry-run
```

Sync mode sends `mode: "sync"` and requires the server to be configured with `sync.allowWrites: true`:

```bash
payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --sync
```

Publishing is requested with `--publish`. The server must allow publishing and the target docs collection must be draft-enabled:

```bash
payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --sync \
  --publish
```

`push` can request delete lifecycle behavior with `--delete-behavior archive|ignore|draft|delete`, but the server remains authoritative. Hard delete requires explicit server config.

## Signed Sync Endpoint

The plugin registers:

```text
POST /api/payload-markdown-docs/sync
```

The endpoint accepts JSON manifests only. It verifies signed request headers, validates the manifest, reads existing docs from the dedicated docs collection, computes a plan, stores nonce/audit records, and returns a summary.

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

If auth is omitted or disabled, the endpoint rejects sync requests.

Dry-run mode is always the safe default. Sync mode is only accepted when writes are explicitly enabled on the server:

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
  },
  target: {
    type: 'docsCollection',
    enableDrafts: true,
  },
  sync: {
    allowHardDelete: false,
    allowPublish: true,
    allowWrites: true,
    defaultPublishMode: 'draft',
    deleteBehavior: 'archive',
  },
})
```

Sync mode can create new docs, update changed docs, skip unchanged docs, and archive missing docs in the dedicated docs collection. It detects manual content edits before writing and aborts the sync if conflicts are found.

Publishing and lifecycle controls:

- `sync.allowPublish` defaults to `false`.
- `publish: true` or CLI `--publish` is rejected unless `sync.allowPublish === true`.
- Publishing requires `target.enableDrafts: true` because Payload represents docs status with `_status`.
- `sync.defaultPublishMode` may be `draft`, `published`, or `preserve`.
- `deleteBehavior: 'archive'` marks missing docs archived without deleting content.
- `deleteBehavior: 'ignore'` leaves missing docs alone.
- `deleteBehavior: 'draft'` marks missing docs archived and sets `_status: 'draft'` when drafts are enabled.
- `deleteBehavior: 'delete'` hard deletes missing docs only when `sync.allowHardDelete === true`.

Still not implemented:

- existing collection targets
- block targets
- GitHub OIDC auth

## Current Limitations

- Existing collection and block target modes are not implemented.
- GitHub OIDC is not implemented.
- Agent skill installer is not implemented.
- Nonce uniqueness across `keyId + nonce` is not enforced by portable Payload config yet.

## Roadmap

- Phase 1: clean plugin skeleton and public config types. Done.
- Phase 2: dedicated docs collection, sync run audit collection, and nonce storage design. Done.
- Phase 3: manifest builder and validation core. Done.
- Phase 4: CLI foundation for local validate, manifest, plan, and keygen. Done.
- Phase 5: signed sync endpoint with Ed25519 verification and dry-run only. Done.
- Phase 6: dedicated docs upsert engine. Done.
- Phase 7A: CLI push and request signing. Done.
- Phase 7B: publishing modes and expanded archive/delete behavior. Done.
- Phase 8A: CI workflow and dedicated docs dogfood hardening. Done.
- Phase 8B: existing collection and block target modes.
- Phase 9: GitHub OIDC auth mode.
- Phase 10: agent skill installer.
- Phase 11: agent workflow polish.

See `.codex/scratch/roadmap.md` for the working implementation roadmap.
