# @valkyrianlabs/payload-markdown-docs

<a href="https://github.com/valkyrianlabs/payload-markdown-docs/actions"><img alt="GitHub Workflow Status" src="https://img.shields.io/github/actions/workflow/status/valkyrianlabs/payload-markdown-docs/deploy.yml"></a>
&nbsp;
<a href="https://www.npmjs.com/package/@valkyrianlabs/payload-markdown-docs"><img alt="npm" src="https://img.shields.io/npm/v/@valkyrianlabs/payload-markdown-docs" /></a>
&nbsp;
<a href="https://www.npmjs.com/package/@valkyrianlabs/payload-markdown-docs"><img alt="npm" src="https://img.shields.io/npm/dw/@valkyrianlabs/payload-markdown-docs" /></a>
&nbsp;
<a href="https://github.com/valkyrianlabs/payload-markdown-docs?tab=MIT-1-ov-file"><img alt="license" src="https://img.shields.io/npm/l/@valkyrianlabs/payload-markdown-docs" /></a>

Git-backed Markdown documentation sync for Payload CMS, powered by
`@valkyrianlabs/payload-markdown`.

> ⚠️ This plugin is still in early-release as of v0.7.3 on 5/10/26. It is fully functional but missing a few planned v1 features like group parent slug level card grids of collections in that group for better UX, along with a fully thought-out navigation solution that natively incorporates with Payload website starter variants CMSLink. A fully featured stable v1.0.0 is anticipated in the coming days, by 5/17/26 at the very latest.

---

[📖 Explore the Docs (made with payload-markdown-docs)](https://docs.valkyrianlabs.com/plugins/payload-markdown-docs)

---

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

The plugin does not mutate your Pages collection and does not register public
frontend routes. Add route handlers in your Next app where you want docs to
render.

```tsx
import config from '@payload-config'
import {
  PayloadMarkdownDocsPage,
  resolvePayloadMarkdownDocsRoute,
} from '@valkyrianlabs/payload-markdown-docs/next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const resolved = await resolvePayloadMarkdownDocsRoute({ payload, slug })

  if (resolved) {
    return <PayloadMarkdownDocsPage resolved={resolved} />
  }

  notFound()
}
```

For docs navigation, use the drop-in navbar when you want the plugin to own the
docs menu UI:

```tsx
import { PayloadMarkdownDocsNavbar } from '@valkyrianlabs/payload-markdown-docs/next'
import type { Payload } from 'payload'

export async function HeaderDocsNav({ payload }: { payload: Payload }) {
  return (
    <PayloadMarkdownDocsNavbar currentPath="/plugins/payload-markdown-docs" payload={payload} />
  )
}
```

The navbar reads docs groups and docs sets, renders nested docs navigation, and
accepts `classNames` and `renderLink` overrides for app-specific Tailwind,
routing, and analytics.

If you already have a site header, use the Header adapter to append top-level
docs groups and top-level ungrouped docs sets without exceeding your existing
menu cap:

```ts
import { appendPayloadMarkdownDocsHeaderNavItems } from '@valkyrianlabs/payload-markdown-docs/next'

const navItems = await appendPayloadMarkdownDocsHeaderNavItems({
  existingItems: header.navItems ?? [],
  maxItems: headerNavItemsMaxRows,
  payload,
})
```

The adapter defaults to custom URL links so it does not require CMSLink changes.
Use `mode: 'relationship'` only when your renderer understands `docs-groups`
and `docs-sets` relationships.

For fully custom navigation, use the headless nav builder:

```ts
import { getPayloadMarkdownDocsNavItems } from '@valkyrianlabs/payload-markdown-docs/next'

const docsNav = await getPayloadMarkdownDocsNavItems({
  availableSlots: 4,
  payload,
})
```

For simple flat header links, use the compatibility link helper:

```ts
import { getPayloadMarkdownDocsLinks } from '@valkyrianlabs/payload-markdown-docs/next'

const docsLinks = await getPayloadMarkdownDocsLinks({ payload })
// [{ label: 'Payload Markdown Docs', url: '/plugins/payload-markdown-docs' }]
```

## Serve Raw Markdown

The AI-facing raw Markdown export is a route-handler response, not a generated
Payload Page. Add a `route.ts` at the exported path, usually the value from
`docs/index.ai.yml`:

```ts
// app/(frontend)/plugins/payload-markdown-docs.md/route.ts
import config from '@payload-config'
import { createPayloadMarkdownDocsMarkdownResponse } from '@valkyrianlabs/payload-markdown-docs/next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

export async function GET() {
  const payload = await getPayload({ config })
  const response = await createPayloadMarkdownDocsMarkdownResponse({
    payload,
    path: '/plugins/payload-markdown-docs.md',
  })

  if (response) {
    return response
  }

  notFound()
}
```

The response is `text/markdown; charset=utf-8` and is assembled from synced
docs records using `docs/index.ai.yml` when present.

## Validate Locally

In an app or docs repository that has installed this package:

```bash
pnpm exec payload-markdown-docs validate ./docs --source payload-markdown-docs
pnpm exec payload-markdown-docs manifest ./docs --source payload-markdown-docs --pretty
pnpm exec payload-markdown-docs plan ./docs --source payload-markdown-docs
```

From this package source checkout, use the local source CLI instead:

```bash
pnpm cli validate ./docs --source payload-markdown-docs
```

In GitHub Actions, `--source` can be omitted when the docs set slug matches the
repository name. The CLI infers it from `GITHUB_REPOSITORY`.

## Maintain Docs With Codex

In a docs set target application, install the local Codex skill so agents have
repo-local guidance for maintaining Markdown docs, frontmatter, `index.ai.yml`,
validation, and sync safety rules.

```bash
pnpm exec payload-markdown-docs install skill --codex
```

The installer writes `.agents/skills/payload-markdown-docs/`. It does not sync
docs, call Payload, or publish content.

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
- [Docs Navbar](docs/frontend/navbar.md)
- [CLI](docs/reference/cli.md)
- [Migration Notes](docs/reference/migration.md)
