# @valkyrianlabs/payload-markdown-docs

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/valkyrianlabs/payload-markdown-docs/deploy.yml)](https://github.com/valkyrianlabs/payload-markdown-docs/actions)
&nbsp;
[![npm](https://img.shields.io/npm/v/@valkyrianlabs/payload-markdown-docs)](https://www.npmjs.com/package/@valkyrianlabs/payload-markdown-docs)
&nbsp;
[![npm](https://img.shields.io/npm/dw/@valkyrianlabs/payload-markdown-docs)](https://www.npmjs.com/package/@valkyrianlabs/payload-markdown-docs)
&nbsp;
[![license](https://img.shields.io/npm/l/@valkyrianlabs/payload-markdown-docs)](https://github.com/valkyrianlabs/payload-markdown-docs?tab=MIT-1-ov-file)

> ⚠️ This plugin is still in early release as of v0.9.7. It is functional, but
> v1 polish is still in progress.

AI-first Markdown documentation generation, sync, and publishing for Payload CMS.

`@valkyrianlabs/payload-markdown-docs` turns a repo-local `/docs` tree into
Payload-native documentation that can be generated with AI, reviewed as plain
Markdown, validated locally, synced through GitHub Actions, and rendered in your
Next/Payload site with [@valkyrianlabs/payload-markdown](https://github.com/valkyrianlabs/payload-markdown).

It is the documentation delivery pipeline for teams who want docs to move as
fast as the code they describe.

---

[📖 Explore the Docs](https://valkyrianlabs.com/plugins/payload-markdown-docs/docs)

---

## The Pitch

Most documentation tools make you choose between three bad options:

- write everything manually and fall behind,
- let AI generate unstructured Markdown slop,
- or wire your project into a hosted docs platform that does not understand your app.

`payload-markdown-docs` is built for a different workflow:

```txt
analyze codebase
  -> generate docs with a repo-local AI skill
  -> write plain Markdown into /docs
  -> validate and plan the docs tree
  -> sync through GitHub OIDC or Ed25519
  -> render inside your Payload/Next site
```

The docs stay as plain Markdown files. The plugin handles validation, route-aware
metadata, syncing, publishing, and rendering.

AI gets the speed. Humans keep the control. Payload owns the output.

## AI-First, Not AI-Only

This plugin is designed around AI-assisted documentation from the ground up.

Install a native agent skill:

```bash
pnpm exec payload-markdown-docs install skill --agent codex
pnpm exec payload-markdown-docs install skill --agent claude
```

Then ask Codex or Claude to inspect your codebase and generate or maintain your
docs using the installed `payload-markdown-docs` and `payload-markdown` skill
instructions.

The installed skills give the agent repo-local guidance for:

- documentation tree structure,
- frontmatter,
- sync safety rules,
- validation,
- route-derived docs metadata,
- Markdown authoring patterns,
- and [@valkyrianlabs/payload-markdown](https://github.com/valkyrianlabs/payload-markdown) directive usage through the companion `payload-markdown` skill.

You can still write every document by hand. In fact, you should review and tune
important docs by hand. But the workflow is optimized for AI to build the first
pass, maintain large sections, and keep documentation moving with the codebase.

Codex and Claude skill packs are included today. The canonical
`payload-markdown-docs` skill artifacts live in this package under
`skills/payload-markdown-docs/<agent>/`; the companion Payload Markdown skill is
copied from `@valkyrianlabs/payload-markdown`.

## Why This Exists

Payload CMS is excellent for building serious content-backed applications, but
documentation delivery usually becomes a side quest:

- Where do generated docs live?
- How do they become Payload records?
- How do you trust CI to publish them?
- How do you preview and edit them without a hosted docs SaaS?
- How do AI agents learn your docs format instead of hallucinating structure?
- How do you ship docs from your editor to production without babysitting a CMS?

This package answers those questions with a boringly powerful primitive:

```txt
human docs in /docs
agent workflow packs in /skills
server-generated AI discovery in /llms.txt and /llms-full.txt
```

Your docs live in the repo. The CLI validates them. GitHub Actions or Ed25519
pushes them. Payload stores and renders them. Your site owns the final output.

## What You Get

- AI-first documentation generation workflow.
- Codex and Claude skill installer for repo-local agent guidance.
- Plain Markdown source of truth in `/docs`.
- Native skill artifacts in `/skills/payload-markdown-docs/<agent>/`.
- Generated root and docs-set AI discovery files from synced docs and skills.
- GitHub Actions publishing with OIDC.
- Ed25519 signed local publishing for advanced on-demand workflows.
- Payload admin collections for docs sets, groups, trusted owners, and keys.
- Next.js helpers for resolving and rendering docs routes.
- Next.js sitemap helpers that can include docs records, AI discovery files, and skill artifacts.
- Drop-in docs navbar and headless navigation helpers.
- Local CLI commands for validation, manifest generation, and sync planning.
- Rendering powered by `@valkyrianlabs/payload-markdown`.

## Install

```bash
pnpm add @valkyrianlabs/payload-markdown-docs @valkyrianlabs/payload-markdown
```

Install the same package in any repository that runs the
`payload-markdown-docs` CLI.

```bash
pnpm add -D @valkyrianlabs/payload-markdown-docs
```

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

This adds the `Docs Globals` admin collections:

- `Sets`: documentation packages. The set `slug` is the sync source and OIDC audience.
- `Groups`: optional route nesting. Routes are derived from group slugs.
- `Keys`: global Ed25519 public keys for local or non-GitHub publishing.
- `Trusted`: global GitHub owners trusted for OIDC publishing.

The sync endpoint is:

```txt
/api/payload-markdown-docs/sync
```

The sync endpoint is an implementation endpoint. Public raw AI asset URLs such
as `/llms.txt` and `/plugins/<docs-set>/skills/<agent>` require committed Next
route files; install those once with `payload-markdown-docs install routes`.

## Create Admin Records

Create a docs set:

```txt
title: Payload Markdown Docs
slug: payload-markdown-docs
branch: main
group: plugins
```

With the `plugins` group, the generated route becomes:

```txt
/plugins/payload-markdown-docs
```

Create a trusted GitHub owner:

```txt
owner: valkyrianlabs
limitRepos: false
```

When `limitRepos` is disabled, any repository owned by that GitHub owner can
publish to a matching docs set from the configured branch.

Enable `limitRepos` when you want to explicitly list the allowed repositories.

## Create A Docs Tree

A minimal docs tree can look like this:

```txt
docs/
  index.md
  getting-started/
    quick-start.md
  configuration/
    plugin-config.md
  workflow/
    ci-github-actions.md
  reference/
    cli.md
skills/
  payload-markdown-docs/
    codex/
      SKILL.md
    claude/
      SKILL.md
```

The Markdown files are the source of truth. Native agent workflow packs live
outside the docs tree under `skills/payload-markdown-docs/<agent>/`.
`/llms.txt`, `/llms-full.txt`, and docs-set `llms` files are generated by the
plugin from synced docs, docs set metadata, dependencies, and skills.

The plugin does not require generated-only docs, hidden storage, or a hosted
documentation service. AI can create the tree, but humans can edit it like any
other Markdown project.

## Install An Agent Skill

In the repository that owns the docs tree:

```bash
pnpm exec payload-markdown-docs install skill --agent codex
pnpm exec payload-markdown-docs install skill --agent claude
```

The Codex installer writes:

```txt
.agents/skills/payload-markdown-docs/
.agents/skills/payload-markdown/
AGENTS.md
```

The Claude installer writes:

```txt
.claude/skills/payload-markdown-docs/
.claude/skills/payload-markdown/
```

The installer does not sync docs, call Payload, or publish content. It only
installs agent-facing guidance so AI agents can understand the documentation
rules inside your repo. The `payload-markdown-docs` skill covers package
structure and sync behavior; the `payload-markdown` skill covers renderer
directives and Markdown authoring.

A typical prompt after installing the skill:

```txt
Use the installed payload-markdown-docs skill.

Analyze this repository and generate a complete documentation tree under /docs.
Use route-aware frontmatter and payload-markdown-compatible Markdown. Validate
the tree with the payload-markdown-docs CLI when finished.
```

That is the magic trick: the AI does not just write random docs. It writes docs
for a known renderer, known metadata format, known CLI, and known publishing
pipeline.

## Validate Locally

Before syncing, validate the docs tree:

```bash
pnpm exec payload-markdown-docs validate --source payload-markdown-docs
```

Generate a manifest:

```bash
pnpm exec payload-markdown-docs manifest \
  --source payload-markdown-docs \
  --pretty
```

Preview the sync plan:

```bash
pnpm exec payload-markdown-docs plan --source payload-markdown-docs
```

From this package source checkout, use the local source CLI instead:

```bash
pnpm cli validate --source payload-markdown-docs
```

In GitHub Actions, `--source` can be omitted when the docs set slug matches the
repository name. The CLI infers it from `GITHUB_REPOSITORY`.

## Publish From GitHub Actions

This is the default documentation CI workflow.

GitHub Actions signs the publish request with OIDC. Payload verifies the trusted
owner, repository, branch, and docs set before accepting the sync.

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

  - run: pnpm exec payload-markdown-docs validate --source payload-markdown-docs

  - run: |
      pnpm exec payload-markdown-docs push \
        --endpoint "$DOCS_SYNC_ENDPOINT" \
        --repository "$GITHUB_REPOSITORY" \
        --branch "$GITHUB_REF_NAME" \
        --commit "$GITHUB_SHA" \
        --github-oidc \
        --publish
```

`push` defaults to sync mode and publishes the conventional package layout:
human docs from `./docs` and native skill artifacts from `./skills/<source>`.
AI discovery files are generated at request time; root `llms.txt` files are only
needed when you intentionally provide custom static fallback assets.

Sync writes require:

```ts
sync: {
  allowWrites: true,
}
```

`--publish` also requires:

```ts
sync: {
  allowPublish: true,
},
target: {
  enableDrafts: true,
}
```

This is the normal “CI for your documentation” path: commit docs, validate docs,
push docs, publish docs.

## Local Ed25519 Push

For advanced on-demand workflows, use Ed25519 signed pushes.

This is useful when you want to publish from your editor, local machine,
internal tooling, or a non-GitHub environment without waiting on a GitHub
workflow.

Generate a keypair:

```bash
pnpm exec payload-markdown-docs keygen --out .docs-sync
```

Add the public key in Payload Admin:

```txt
Docs Globals > Keys
```

Then push with the private key:

```bash
pnpm exec payload-markdown-docs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source payload-markdown-docs \
  --key-id local-docs \
  --private-key-file .docs-sync/docs-sync-private.pem
```

For immediate publishing:

```bash
pnpm exec payload-markdown-docs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source payload-markdown-docs \
  --key-id local-docs \
  --private-key-file .docs-sync/docs-sync-private.pem \
  --publish
```

That is the operator workflow: edit locally, validate locally, push directly,
and review the rendered docs on your Payload site.

## Render In Next

The plugin does not mutate your Pages collection and does not register public
frontend routes.

Add route handlers in your Next app where you want docs to render.

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

  const resolved = await resolvePayloadMarkdownDocsRoute({
    payload,
    slug,
  })

  if (resolved) {
    return <PayloadMarkdownDocsPage resolved={resolved} />
  }

  notFound()
}
```

This lets your app decide where documentation lives while the plugin handles
resolution and rendering.

## Docs Navigation

Use the drop-in navbar when you want the plugin to own the docs menu UI:

```tsx
import { PayloadMarkdownDocsNavbar } from '@valkyrianlabs/payload-markdown-docs/next'
import type { Payload } from 'payload'

export async function HeaderDocsNav({ payload }: { payload: Payload }) {
  return (
    <PayloadMarkdownDocsNavbar
      currentPath="/plugins/payload-markdown-docs"
      payload={payload}
    />
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

The adapter defaults to custom URL links, so it does not require CMSLink
changes.

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

## Serve Raw AI Assets

The canonical agent artifacts are normal files under `skills/`. `push` syncs
them as static assets by convention. Synced assets are stored separately from
docs records. Skill files are not docs records and do not need docs
frontmatter. AI discovery files are generated by the plugin; checked-in
`llms.txt` and `llms-full.txt` files are only custom static fallbacks.

Payload owns the asset storage and handlers, but a Next App Router site still
needs filesystem route files so public root URLs reach those handlers instead
of the frontend catch-all. Install the exact public Next route files once:

```bash
pnpm exec payload-markdown-docs install routes --payload-app "src/app/(payload)"
```

Use `--payload-app "app/(payload)"` for apps without `src/`. The route files
delegate to the plugin-owned asset handlers and prevent generated `/llms.txt`
and skill URLs from being swallowed by a frontend catch-all.

The `/api/...` asset URLs are implementation/internal fallback URLs. They are
useful for debugging, but the public canonical routes are outside `/api`.

When `push` includes skill assets or custom static assets, the CLI warns if
those public route files are missing from the current app. Use
`--strict-routes` in CI to fail the publish before deploying assets that would
only be reachable under `/api`.

Useful stable paths include:

```txt
/llms.txt
/llms-full.txt
/plugins/payload-markdown-docs/llms.txt
/plugins/payload-markdown-docs/llms-full.txt
/plugins/payload-markdown-docs/skills/codex
/plugins/payload-markdown-docs/skills/codex/SKILL.md
/plugins/payload-markdown-docs/skills/claude
/plugins/payload-markdown-docs/skills/claude/SKILL.md
/plugins/payload-markdown-docs/skills/codex/reference/workflow.md
```

Generated AI discovery routes and synced skill assets are included by the docs
sitemap helpers by default. Use `additionalRoutes` for static routes that are
not generated or synced:

```ts
import { getDocsForSitemap } from '@valkyrianlabs/payload-markdown-docs/next'

const sitemap = await getDocsForSitemap({
  payload,
  siteUrl,
  additionalRoutes: [
    { path: '/agent-index.txt' },
  ],
})
```

`sitemap.xml` is crawler discovery. `llms.txt` is an AI-readable entrypoint.
Skills are native agent workflow artifacts.

The source split is intentional: `/docs` contains human documentation, while
`/skills` contains agent-native workflow packages.

## Advanced Security

You do not need this for normal docs publishing.

Each docs set has an advanced security section for exact GitHub workflow refs.

Leave it disabled to allow any workflow from a trusted owner/repository on the
configured branch.

When enabled, add every allowed workflow ref explicitly. An empty list rejects
all workflow publishing for that docs set.

## Early Release Note

This plugin is in early release. It is fully functional, but a few v1-oriented
features are still being refined, including group-level docs UX and deeper
navigation integration with Payload website starter variants.

Use it. Break it. File sharp issues. This package is already built for real
docs workflows, but the v1 polish pass is still moving.

## More Docs

- [Quick Start](docs/getting-started/quick-start.md)
- [Plugin Config](docs/configuration/plugin-config.md)
- [GitHub Actions](docs/workflow/ci-github-actions.md)
- [Docs Navbar](docs/frontend/navbar.md)
- [CLI](docs/reference/cli.md)
- [Migration Notes](docs/reference/migration.md)

## Related Packages

- [`@valkyrianlabs/payload-markdown`](https://www.npmjs.com/package/@valkyrianlabs/payload-markdown)
- [`@valkyrianlabs/payload-markdown-docs`](https://www.npmjs.com/package/@valkyrianlabs/payload-markdown-docs)

## License

MIT
