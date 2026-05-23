![@valkyrianlabs/payload-markdown-docs v1.0.0 release banner](https://media.valkyrianlabs.com/%40valkyrianlabspayload-markdown-docs_v1-release-banner.png)

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/valkyrianlabs/payload-markdown-docs/deploy.yml)](https://github.com/valkyrianlabs/payload-markdown-docs/actions)
&nbsp;
[![npm](https://img.shields.io/npm/v/@valkyrianlabs/payload-markdown-docs)](https://www.npmjs.com/package/@valkyrianlabs/payload-markdown-docs)
&nbsp;
[![npm](https://img.shields.io/npm/dw/@valkyrianlabs/payload-markdown-docs)](https://www.npmjs.com/package/@valkyrianlabs/payload-markdown-docs)
&nbsp;
[![license](https://img.shields.io/npm/l/@valkyrianlabs/payload-markdown-docs)](https://github.com/valkyrianlabs/payload-markdown-docs?tab=MIT-1-ov-file)

AI-first Markdown documentation generation, sync, and publishing for Payload CMS.

`@valkyrianlabs/payload-markdown-docs` turns a repo-local `/docs` tree into
Payload-native documentation that can be generated with AI, reviewed as plain
Markdown, validated locally, synced through GitHub Actions, and rendered in your
Next/Payload site with [@valkyrianlabs/payload-markdown](https://github.com/valkyrianlabs/payload-markdown).

It is the documentation delivery pipeline for teams who want docs to move as
fast as the code they describe.

---

## [📖 Explore the Docs](https://valkyrianlabs.com/plugins/payload-markdown-docs/docs)

---

## Getting Started

Install the Payload plugin package in the Payload app:

```bash
pnpm add @valkyrianlabs/payload-markdown-docs @valkyrianlabs/payload-markdown
```

The npm package is the Payload plugin/runtime integration only. It does not
install a supported CLI. Install the native `pmdocs` binary separately for docs
validation, planning, route installation, key generation, and publishing.

### Debian/Ubuntu

```bash
sudo install -d -m 0755 /etc/apt/keyrings
sudo curl -fsSL https://apt.valkyrianlabs.com/pubkey.gpg \
  -o /etc/apt/keyrings/valkyrianlabs.gpg
sudo chmod 0644 /etc/apt/keyrings/valkyrianlabs.gpg

echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/valkyrianlabs.gpg] https://apt.valkyrianlabs.com stable main" | \
  sudo tee /etc/apt/sources.list.d/valkyrianlabs.list > /dev/null

sudo apt update
sudo apt install -y pmdocs

pmdocs --version
```

### Homebrew

```bash
brew install valkyrianlabs/tap/pmdocs
pmdocs --version
```

### Why no native Windows CLI?

Alright, I already know what you're thinking:

> *"This guy doesn't respect Windows as an operating system."*

And you would be correct.

**Jokes aside:** For v1, `pmdocs` targets macOS developer machines and Debian/Ubuntu Linux CI/server environments. Windows users should use WSL2 or a Linux CI runner.

## Native CLI Philosophy

The split is intentional: npm installs the Payload plugin/runtime package, and
the operating system installs the `pmdocs` operator CLI. That keeps Payload app
dependencies focused on runtime code while CI jobs, docs-only repos, local
machines, and release runners can validate and publish docs without a Node
dependency install.

The practical result is simpler operations. Install the plugin where Payload
runs. Install `pmdocs` where docs are authored, checked, signed, and pushed.
Homebrew and Debian packages give the CLI a predictable system path, native
dependencies, and the same workflow in CI as on a developer machine.

### Windows

Native Windows packages are not a v1 target. Use WSL2 with the Debian install
flow, or publish docs from Linux/macOS developer machines and CI runners.

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

The docs stay as plain Markdown files. The native CLI handles local validation,
planning, signing, and upload. The Payload plugin owns server authority,
route-aware metadata, syncing, publishing, and rendering.

AI gets the speed. Humans keep the control. Payload owns the output.

## AI-First, Not AI-Only

This plugin is designed around AI-assisted documentation from the ground up.

Install a native agent skill:

```bash
pmdocs install skill --agent codex
pmdocs install skill --agent claude
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
`<group...>/<doc-set>/skills/<agent>`. For renderer directive details,
install or inspect the companion Payload Markdown skill from
`@valkyrianlabs/payload-markdown`.

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

Your docs live in the repo. The native `pmdocs` CLI validates and publishes
them. GitHub Actions or Ed25519 signs the request. Payload stores and renders
the output. Your site owns the final output.

## What You Get

- AI-first documentation generation workflow.
- Codex and Claude skill installer for repo-local agent guidance.
- Plain Markdown source of truth in `/docs`.
- Native skill artifacts in `<group...>/<doc-set>/skills/<agent>`.
- Generated root and docs-set AI discovery files from synced docs and skills.
- GitHub Actions publishing with OIDC.
- Ed25519 signed local publishing for advanced on-demand workflows.
- Payload admin collections for docs sets, groups, trusted owners, and keys.
- Next.js helpers for resolving and rendering docs routes.
- Next.js sitemap helpers for canonical docs pages, with opt-in raw asset entries.
- Drop-in docs navbar and headless navigation helpers.
- Native `pmdocs` commands for validation, manifest generation, sync planning,
  route installation, key generation, and publishing.
- Rendering powered by `@valkyrianlabs/payload-markdown`.

## Install

```bash
pnpm add @valkyrianlabs/payload-markdown-docs @valkyrianlabs/payload-markdown
```

The npm package installs the Payload plugin and runtime helpers. It does not
ship the supported operator CLI. Use the Debian/Ubuntu or Homebrew install
above for the native `pmdocs` binary.

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

## Public API

The package surface is intentionally split by runtime:

- `@valkyrianlabs/payload-markdown-docs`: Payload plugin/config API only.
- `@valkyrianlabs/payload-markdown-docs/next`: Next rendering, metadata, sitemap, nav, route, and asset route helpers.
- `@valkyrianlabs/payload-markdown-docs/admin`: `DocsSetManager` for Payload import maps.
- `@valkyrianlabs/payload-markdown-docs/blocks`: optional Payload block schemas and field helpers.

Manual block installation imports from `/blocks`:

```ts
import { DocsCTABlock } from '@valkyrianlabs/payload-markdown-docs/blocks'
```

This adds the `Docs Globals` admin collections:

- `Sets`: documentation packages. The set `slug` is the sync source and OIDC audience.
- `Groups`: optional route nesting. Routes are derived from group slugs.
- `Access`: GitHub OIDC trust records and Ed25519 public keys for publishing.

The sync endpoint is:

```txt
/api/documentation/sync
```

The sync endpoint is an implementation endpoint. Public raw AI asset URLs such
as `/llms.txt` and `/plugins/<docs-set>/skills/<agent>` require committed Next
route files; install those once with `pmdocs install routes`.

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
pmdocs install skill --agent codex
pmdocs install skill --agent claude
```

The Codex installer writes:

```txt
.agents/skills/payload-markdown-docs/
```

The Claude installer writes:

```txt
.claude/skills/payload-markdown-docs/
```

The installer does not sync docs, call Payload, or publish content. It only
installs agent-facing guidance so AI agents can understand the documentation
rules inside your repo. The `payload-markdown-docs` skill covers package
structure and sync behavior. For renderer directives and Markdown authoring,
install or inspect the companion `payload-markdown` skill from
`@valkyrianlabs/payload-markdown`.

A typical prompt after installing the skill:

```txt
Use the installed payload-markdown-docs skill.

Analyze this repository and generate a complete documentation tree under /docs.
Use route-aware frontmatter and payload-markdown-compatible Markdown. Validate
the tree with pmdocs when finished.
```

That is the magic trick: the AI does not just write random docs. It writes docs
for a known renderer, known metadata format, known CLI, and known publishing
pipeline.

## Validate Locally

Before syncing, validate the docs tree:

```bash
pmdocs validate --source payload-markdown-docs
```

Generate a manifest:

```bash
pmdocs manifest \
  --source payload-markdown-docs \
  --pretty
```

Preview the sync plan:

```bash
pmdocs plan --source payload-markdown-docs
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

  - name: Install pmdocs
    run: |
      sudo install -d -m 0755 /etc/apt/keyrings
      sudo curl -fsSL https://apt.valkyrianlabs.com/pubkey.gpg \
        -o /etc/apt/keyrings/valkyrianlabs.gpg
      sudo chmod 0644 /etc/apt/keyrings/valkyrianlabs.gpg
      echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/valkyrianlabs.gpg] https://apt.valkyrianlabs.com stable main" | \
        sudo tee /etc/apt/sources.list.d/valkyrianlabs.list > /dev/null
      sudo apt-get update
      sudo apt-get install -y pmdocs

  - run: pmdocs --version

  - run: pmdocs validate --source payload-markdown-docs

  - run: |
      pmdocs push \
        --endpoint "$DOCS_SYNC_ENDPOINT" \
        --repository "$GITHUB_REPOSITORY" \
        --branch "$GITHUB_REF_NAME" \
        --commit "$GITHUB_SHA" \
        --github-oidc \
        --publish
```

`push` defaults to sync mode and publishes the conventional package layout:
human docs from `./docs` and native skill artifacts from `./skills/<source>` when
that directory exists. Projects do not need to ship skills; a missing default
`./skills` directory is skipped. AI discovery files are generated at request
time; root `llms.txt` files are only needed when you intentionally provide
custom static fallback assets.

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
pmdocs keygen --out .docs-sync
```

Add the public key in Payload Admin:

```txt
Docs Globals > Access
```

Then push with the private key:

```bash
pmdocs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source payload-markdown-docs \
  --key-id local-docs \
  --private-key-file .docs-sync/docs-sync-private.pem
```

For immediate publishing:

```bash
pmdocs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source payload-markdown-docs \
  --key-id local-docs \
  --private-key-file .docs-sync/docs-sync-private.pem \
  --publish
```

That is the operator workflow: edit locally, validate locally, push directly,
and review the rendered docs on your Payload site.

## CLI Migration

Before v1, docs publishing used the npm package binary:

```bash
pnpm exec payload-markdown-docs push ...
```

Use the native binary instead:

```bash
pmdocs push ...
```

Keep `@valkyrianlabs/payload-markdown-docs` installed in the Payload app for the
plugin/runtime integration. Install `pmdocs` from Homebrew or the Valkyrian
Labs Debian repository anywhere you run operator commands.

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

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
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

## Serve Raw AI Assets

The canonical agent artifacts are normal files under `skills/`. `push` syncs
them as raw asset records by convention. Synced assets are stored separately
from docs records. Skill files are not docs records and do not need docs
frontmatter. AI discovery files are generated by the plugin; checked-in
`llms.txt` and `llms-full.txt` files are only custom static fallbacks.

Payload owns the asset storage and handlers, but a Next App Router site still
needs filesystem route files so public root URLs reach those handlers instead
of the frontend catch-all. Install the exact public Next route files once:

```bash
pmdocs install routes --payload-app "src/app/(payload)"
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
/plugins/payload-markdown-docs/skills/codex.zip
/plugins/payload-markdown-docs/skills/codex/reference
/plugins/payload-markdown-docs/skills/claude
/plugins/payload-markdown-docs/skills/claude/SKILL.md
/plugins/payload-markdown-docs/skills/claude.zip
/plugins/payload-markdown-docs/skills/codex/reference/workflow.md
```

`/skills/<agent>` is a generated Markdown directory index for the synced skill
bundle. `/skills/<agent>/<directory>` is also generated as a Markdown index when
that directory exists. Raw files remain available at
`/skills/<agent>/SKILL.md` and `/skills/<agent>/<path...>`.

Skill ZIP routes are generated on demand from synced text skill artifacts in
`./skills/<sourceId>/<agent>/...`. They are not uploaded or stored as static ZIP
assets. Archives expand to `<sourceId>/SKILL.md` plus supporting files.
Auto-resolved skill CTAs point to the ZIP route.

Generated `llms.txt` links use the public app origin when configured, preferring
`NEXT_PUBLIC_SERVER_URL`, then public site/Vercel URL environment values before
falling back to request headers or Payload `serverURL`. Production output should
not emit `localhost` when a public origin is configured.

Generated sitemap output includes canonical human docs pages by default. Raw
AI-facing routes like `llms.txt`, `llms-full.txt`, and native skill Markdown are
publicly served but are not listed in `sitemap.xml` unless explicitly requested
with `includeLlms` or `includeSkills`. Synced `static` assets are also hidden
unless `includeAssets` is enabled; `includeAssets` does not include llms or
skills. Use `additionalRoutes` for static routes that are not generated or
synced:

```ts
import { getDocsForSitemap } from '@valkyrianlabs/payload-markdown-docs/next'

const sitemap = await getDocsForSitemap({
  payload,
  siteUrl,
  additionalRoutes: [{ path: '/agent-index.txt' }],
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

## More Docs

- [Quick Start](docs/getting-started/quick-start.md)
- [Plugin Config](docs/configuration/plugin-config.md)
- [GitHub Actions](docs/workflow/ci-github-actions.md)
- [Docs Navbar](docs/frontend/navbar.md)
- [CLI](docs/reference/cli.md)
- [Public API](docs/reference/public-api.md)

## Related Packages

- [`@valkyrianlabs/payload-markdown`](https://www.npmjs.com/package/@valkyrianlabs/payload-markdown)
- [`@valkyrianlabs/payload-markdown-docs`](https://www.npmjs.com/package/@valkyrianlabs/payload-markdown-docs)

## License

MIT
