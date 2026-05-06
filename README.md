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

Add the plugin to `payload.config.ts`. Keep source authorization in Payload
Admin docs sets; the plugin config should define the endpoint, collections, and
sync lifecycle behavior.

```ts
import { payloadMarkdownDocs } from '@valkyrianlabs/payload-markdown-docs'
import { buildConfig } from 'payload'

export default buildConfig({
  plugins: [
    payloadMarkdownDocs({
      enabled: true,

      // Optional default OIDC audience. Repository/workflow/environment
      // allowlists belong on the docs set in Payload Admin.
      auth: {
        githubOidc: {
          audience: 'payload-markdown-docs',
        },
      },

      target: {
        type: 'docsCollection',
        enableDrafts: true,
      },

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
- Accepts Ed25519 signed requests or GitHub OIDC bearer requests on the same
  endpoint when the matched docs set has those auth policies.
- Uses docs sets in Payload Admin as the source allow-list. `sources` still
  exists as a legacy fallback, but it is not the recommended path.
- Allows sync writes and publish requests, while archiving removed docs instead
  of hard-deleting them.

If you configure `allowedRefs` on a docs set, remember release workflows run on
tag refs like `refs/tags/v0.1.0-canary.1`. The first pass uses exact string
matches, not glob patterns. For release publishing, constrain by repository and
workflow unless you want to list exact tag refs.

## 2. Create The Docs Set

In Payload Admin, create a docs set with values that match the CLI and server
config:

- `sourceId`: `payload-markdown-docs`
- `sourceRoot`: `docs`
- `routeBase`: `/plugins/payload-markdown-docs`
- `title`: Payload Markdown Docs
- `auth.githubOidc.enabled`: checked
- `auth.githubOidc.allowedRepositories`: `valkyrianlabs/payload-markdown-docs`
- optionally restrict `auth.githubOidc.allowedWorkflows`,
  `auth.githubOidc.allowedEnvironments`, or exact `auth.githubOidc.allowedRefs`
- optionally add `auth.ed25519.keys` with `keyId` and `publicKey` for local
  machines or non-GitHub CI

The CLI sends `source.id`. The server uses that id to find the docs set and
decide where generated routes live and which credentials may update it. You can
add a new docs source by creating a new docs set in Payload Admin; you should
not need to redeploy the Payload app just to add another docs package.

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
- auth: GitHub OIDC configured on the matching docs set
- mode: sync and publish

## More Docs

- [Installation](docs/getting-started/installation.md)
- [Quick Start](docs/getting-started/quick-start.md)
- [Plugin Config](docs/configuration/plugin-config.md)
- [GitHub OIDC](docs/configuration/github-oidc.md)
- [GitHub Actions](docs/workflow/ci-github-actions.md)
- [Route Adapter](docs/frontend/route-adapter.md)
- [Troubleshooting](docs/reference/troubleshooting.md)
