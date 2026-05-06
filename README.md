# @valkyrianlabs/payload-markdown-docs

Git-backed Markdown documentation sync for Payload CMS, powered by
`@valkyrianlabs/payload-markdown`.

This package has two sides:

- The docs repo keeps Markdown files in source control and uses the CLI to
  validate, plan, and push them.
- The Payload server installs the plugin, verifies signed or GitHub OIDC
  requests, and writes generated docs records into Payload-owned collections.

The sync endpoint is not the human docs route. If your Payload site is deployed
at `https://docs.valkyrianlabs.com`, the default sync endpoint is:

```text
https://docs.valkyrianlabs.com/api/payload-markdown-docs/sync
```

The human docs route is whatever docs set route base you configure, for example:

```text
https://docs.valkyrianlabs.com/plugins/payload-markdown-docs
```

## Install

Install this package in the Payload app that will receive and render docs:

```bash
pnpm add @valkyrianlabs/payload-markdown-docs @valkyrianlabs/payload-markdown
```

Install the same package in any repo whose CI will run the
`payload-markdown-docs` CLI.

## 1. Configure The Payload Server

Add the plugin to `payload.config.ts`. This example lets GitHub Actions from
`valkyrianlabs/payload-markdown-docs` publish docs for the
`/plugins/payload-markdown-docs` docs set.

```ts
import { payloadMarkdownDocs } from '@valkyrianlabs/payload-markdown-docs'
import { buildConfig } from 'payload'

export default buildConfig({
  plugins: [
    payloadMarkdownDocs({
      enabled: true,

      auth: {
        ed25519: {
          keys: [
            {
              id: 'local-or-non-github-ci',
              publicKey: process.env.DOCS_SYNC_PUBLIC_KEY!,
            },
          ],
        },
        githubOidc: {
          audience: 'payload-markdown-docs',
          allowedRepositories: ['valkyrianlabs/payload-markdown-docs'],
          allowedWorkflows: ['Release'],
          allowedEnvironments: ['Production'],
        },
      },

      target: {
        type: 'docsCollection',
        enableDrafts: true,
      },

      sources: [
        {
          id: 'payload-markdown-docs',
          root: 'docs',
          routeBase: '/plugins/payload-markdown-docs',
        },
      ],

      sync: {
        allowWrites: true,
        allowPublish: true,
        allowHardDelete: false,
        defaultPublishMode: 'draft',
        deleteBehavior: 'archive',
      },
    }),
  ],
})
```

What this does:

- Adds docs groups, docs sets, generated docs, sync run, and nonce collections.
- Registers the default Payload custom endpoint at
  `/api/payload-markdown-docs/sync`.
- Accepts either Ed25519 signed requests or GitHub OIDC bearer requests on the
  same endpoint. Omit either `ed25519` or `githubOidc` if you only want one auth
  method.
- Allows only the configured GitHub repository, workflow, and environment to
  authenticate with OIDC.
- Allows sync writes and publish requests, while archiving removed docs instead
  of hard-deleting them.

If you configure `allowedRefs`, remember release workflows run on tag refs like
`refs/tags/v0.1.0-canary.1`. The first pass uses exact string matches, not glob
patterns. For release publishing, constrain by repository and workflow unless you
want to list exact tag refs.

## 2. Create The Docs Set

In Payload Admin, create a docs set with values that match the CLI and server
config:

- `sourceId`: `payload-markdown-docs`
- `sourceRoot`: `docs`
- `routeBase`: `/plugins/payload-markdown-docs`
- `title`: Payload Markdown Docs

The CLI sends `source.id`. The server uses that id to find the docs set and
decide where generated routes live.

## 3. Render Docs In Next

The plugin writes docs records. Your Next route renders them.

```tsx
import config from '@payload-config'
import {
  PayloadMarkdownDocsPage,
  resolvePayloadMarkdownDocsRoute,
} from '@valkyrianlabs/payload-markdown-docs/next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const resolved = await resolvePayloadMarkdownDocsRoute({ payload, slug })

  if (resolved) {
    return <PayloadMarkdownDocsPage resolved={resolved} />
  }

  notFound()
}
```

In a real app, fall back to your normal Pages lookup instead of calling
`notFound()` immediately.

## 4. Add Docs Source Files

Keep docs in `docs/` and commit the AI Markdown Export manifest next to them.
The manifest controls the generated raw Markdown export; it is not a human docs
page and should not appear in human navigation.

```text
docs/
  index.md
  install.md
  usage.md
  index.ai.yml
```

Example `docs/index.ai.yml`:

```yaml
version: 1

title: Payload Markdown Docs
canonical: /plugins/payload-markdown-docs
output: /plugins/payload-markdown-docs.md

description: >
  Consolidated AI-facing documentation export for Payload Markdown Docs.

preamble: |
  This file is intended for AI agents, editor tooling, Codex, ChatGPT,
  and offline reference.

order:
  - ./index.md
  - ./install.md
  - ./usage.md

exclude:
  - ./drafts/**

orphans: append
headingMode: normalize
```

## 5. Validate Locally

Validation does not contact the server:

```bash
pnpm exec payload-markdown-docs validate ./docs \
  --source payload-markdown-docs \
  --route-base /plugins/payload-markdown-docs
```

Preview the manifest or plan:

```bash
pnpm exec payload-markdown-docs manifest ./docs \
  --source payload-markdown-docs \
  --route-base /plugins/payload-markdown-docs \
  --pretty
```

```bash
pnpm exec payload-markdown-docs plan ./docs \
  --source payload-markdown-docs \
  --route-base /plugins/payload-markdown-docs
```

## 6. Publish From GitHub Actions

GitHub OIDC only works inside GitHub Actions. The workflow needs:

```yaml
permissions:
  contents: read
  id-token: write
```

Then push docs to the Payload sync endpoint:

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "https://docs.valkyrianlabs.com/api/payload-markdown-docs/sync" \
  --source payload-markdown-docs \
  --route-base /plugins/payload-markdown-docs \
  --repository "$GITHUB_REPOSITORY" \
  --branch "$GITHUB_REF_NAME" \
  --commit "$GITHUB_SHA" \
  --github-oidc \
  --oidc-audience payload-markdown-docs \
  --sync \
  --publish
```

`--sync` only works when the server has `sync.allowWrites: true`.
`--publish` also requires `sync.allowPublish: true` and
`target.enableDrafts: true`.

For non-GitHub CI, use Ed25519 keys instead of OIDC:

```bash
pnpm exec payload-markdown-docs keygen --out .docs-sync
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source payload-markdown-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --sync \
  --publish
```

## This Repo

This repo's release workflow publishes the npm package first, then pushes
`./docs` to:

```text
https://docs.valkyrianlabs.com/api/payload-markdown-docs/sync
```

using:

- source id: `payload-markdown-docs`
- route base: `/plugins/payload-markdown-docs`
- auth: GitHub OIDC
- mode: sync and publish

## More Docs

- [Installation](docs/getting-started/installation.md)
- [Quick Start](docs/getting-started/quick-start.md)
- [Plugin Config](docs/configuration/plugin-config.md)
- [GitHub OIDC](docs/configuration/github-oidc.md)
- [GitHub Actions](docs/workflow/ci-github-actions.md)
- [Route Adapter](docs/frontend/route-adapter.md)
- [Troubleshooting](docs/reference/troubleshooting.md)
