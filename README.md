# @valkyrianlabs/payload-markdown-docs

Git-backed Markdown documentation sync for Payload CMS, powered by `@valkyrianlabs/payload-markdown`.

`payload-markdown-docs` lets developers and agents maintain Markdown in a repo-local `docs/` folder, validate it in CI, sign a manifest, and publish it into server-owned Payload docs sets.

The client sends docs content. The Payload plugin decides where it may go.

## Current Status

Implemented:

- docs groups and docs sets as the user-facing model
- generated/internal docs records linked to docs sets
- route reservations and optional docs-side Pages collision checks
- signed sync endpoint with nonce replay protection
- CLI commands for `validate`, `manifest`, `plan`, `keygen`, and signed `push`
- dedicated docs create/update/archive/draft/delete lifecycle behind server gates
- publishing controls for draft-enabled dedicated docs collections
- read-only `/next` route adapter, sidebar helper, metadata helper, and page component
- read-only Docs Set Admin Manager
- real `/docs` dogfood documentation set

Not implemented yet:

- GitHub OIDC auth mode
- existing collection targets
- block targets
- inline override editing from the docs set manager
- agent skill installer

## Install

```bash
pnpm add @valkyrianlabs/payload-markdown-docs @valkyrianlabs/payload-markdown
```

## Minimal Config

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

## Dedicated Docs Config

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

## Quick Commands

```bash
pnpm exec payload-markdown-docs keygen --out .docs-sync
pnpm exec payload-markdown-docs validate ./docs --source main-docs
pnpm exec payload-markdown-docs manifest ./docs --source main-docs --pretty
pnpm exec payload-markdown-docs plan ./docs --source main-docs
```

Signed dry-run:

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-file .docs-sync/docs-sync-private.pem \
  --dry-run
```

Signed sync and publish:

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --sync \
  --publish
```

`--sync` requires `sync.allowWrites: true`. `--publish` requires `sync.allowPublish: true` and `target.enableDrafts: true`. Hard delete requires `sync.allowHardDelete: true`.

## Documentation

The real plugin docs now live in [`docs/`](docs/index.md). Start with:

- [Overview](docs/index.md)
- [Installation](docs/getting-started/installation.md)
- [Quick Start](docs/getting-started/quick-start.md)
- [Architecture](docs/concepts/architecture.md)
- [GitHub Actions](docs/workflow/ci-github-actions.md)
- [Route Adapter](docs/frontend/route-adapter.md)
- [Docs Set Admin Manager](docs/admin/docs-set-manager.md)
- [Troubleshooting](docs/reference/troubleshooting.md)

The `/docs` tree is also dogfood material for the plugin: it uses supported frontmatter, root-relative internal links, and `payload-markdown` directives.

## Examples

- `examples/docs/` is a small fixture docs tree.
- `examples/github-actions/publish-docs.yml` shows PR dry-run and main-branch sync/publish.
- `examples/next/app-docs-route.md` shows the native route adapter pattern.

## Roadmap

Next major work:

- CI workflow polish around docs sets and route adapter usage
- GitHub OIDC auth mode
- agent skill installer and workflow polish
- existing collection or block bridges only if still needed

See [`.codex/scratch/roadmap.md`](.codex/scratch/roadmap.md) for the working implementation roadmap.
