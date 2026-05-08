# @valkyrianlabs/payload-markdown-docs

Git-backed Markdown documentation sync for Payload CMS, powered by
`@valkyrianlabs/payload-markdown`.

The default workflow is intentionally small:

1. Install the plugin in your Payload app.
2. Create a docs set with a title and slug.
3. Add a trusted GitHub owner once.
4. Push Markdown from GitHub Actions.
5. Render generated docs in your Next route.

## Install

```bash
pnpm add @valkyrianlabs/payload-markdown-docs @valkyrianlabs/payload-markdown
```

Install the same package in any repository that runs the
`payload-markdown-docs` CLI.

## Configure Payload

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
        enableDrafts: true,
      },
      sync: {
        allowWrites: true,
        allowPublish: true,
      },
    }),
  ],
})
```

This adds `Docs Globals` admin collections:

- `Sets`: docs packages. The set `slug` is the sync source and OIDC audience.
- `Groups`: optional route nesting. Routes are derived from group slugs.
- `Keys`: global Ed25519 public keys for local or non-GitHub publishing.
- `Trusted`: global GitHub owners trusted for OIDC publishing.

The sync endpoint is `/api/payload-markdown-docs/sync`.

## Create Admin Records

Create a docs set:

- title: `Payload Markdown Docs`
- slug: `payload-markdown-docs`
- branch: `main`
- optional group: for example `plugins`, which makes the route
  `/plugins/payload-markdown-docs`

Create a trusted GitHub owner:

- owner: `valkyrianlabs`
- `limitRepos`: off, unless you want to list specific repositories

When `limitRepos` is off, any repository owned by that GitHub owner can publish
to a matching docs set from the configured branch.

## Render In Next

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

For header navigation, use the link helper:

```ts
import { getPayloadMarkdownDocsLinks } from '@valkyrianlabs/payload-markdown-docs/next'

const docsLinks = await getPayloadMarkdownDocsLinks({ payload })
// [{ label: 'Payload Markdown Docs', url: '/plugins/payload-markdown-docs' }]
```

## Validate Locally

```bash
pnpm exec payload-markdown-docs validate ./docs --source payload-markdown-docs
pnpm exec payload-markdown-docs manifest ./docs --source payload-markdown-docs --pretty
pnpm exec payload-markdown-docs plan ./docs --source payload-markdown-docs
```

In GitHub Actions, `--source` can be omitted when the docs set slug matches the
repository name. The CLI infers it from `GITHUB_REPOSITORY`.

## Publish From GitHub Actions

```yaml
permissions:
  contents: read
  id-token: write

steps:
  - uses: actions/checkout@v4
  - uses: pnpm/action-setup@v4
  - uses: actions/setup-node@v4
    with:
      node-version: 22
      cache: pnpm
  - run: pnpm install --frozen-lockfile
  - run: pnpm exec payload-markdown-docs validate ./docs
  - run: |
      pnpm exec payload-markdown-docs push ./docs \
        --endpoint "$DOCS_SYNC_ENDPOINT" \
        --repository "$GITHUB_REPOSITORY" \
        --branch "$GITHUB_REF_NAME" \
        --commit "$GITHUB_SHA" \
        --github-oidc \
        --sync \
        --publish
```

`--sync` requires `sync.allowWrites: true`. `--publish` also requires
`sync.allowPublish: true` and a draft-enabled generated docs collection.

## Local Ed25519 Push

Generate a keypair, add the public key to `Docs Globals > Keys`, then push with
the private key:

```bash
pnpm exec payload-markdown-docs keygen --out .docs-sync
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source payload-markdown-docs \
  --key-id local-docs \
  --private-key-file .docs-sync/docs-sync-private.pem \
  --sync
```

## Advanced Security

You do not need this for normal docs publishing.

Each docs set has an advanced security section for exact GitHub workflow refs.
Leave it disabled to allow any workflow from a trusted owner/repository on the
configured branch. When enabled, add every allowed workflow ref explicitly; an
empty list rejects all workflow publishing for that docs set.

## More Docs

- [Quick Start](docs/getting-started/quick-start.md)
- [Plugin Config](docs/configuration/plugin-config.md)
- [GitHub Actions](docs/workflow/ci-github-actions.md)
- [CLI](docs/reference/cli.md)
- [Migration Notes](docs/reference/migration.md)
