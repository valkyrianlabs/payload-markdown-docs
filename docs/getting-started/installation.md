---
title: Installation
navTitle: Install
description: Install payload-markdown-docs and register the Payload plugin.
order: 10
status: published
tags:
  - getting-started
---

# Installation

Install the docs workflow package together with its peer packages:

```bash
pnpm add @valkyrianlabs/payload-markdown-docs @valkyrianlabs/payload-markdown @payloadcms/plugin-seo
```

`@valkyrianlabs/payload-markdown` (Markdown field and renderer) and
`@payloadcms/plugin-seo` (docs-set SEO fields) are **peer dependencies**: the
plugin registers admin components from both packages in your app's import map,
so your app must install them directly. Installing them yourself also keeps a
single copy of `payload-markdown`, so the `payloadMarkdown()` options you
configure (themes, code highlighting, icons) apply to docs pages too. Register
`payloadMarkdown()` in the same Payload config as `payloadMarkdownDocs()`.
`payload`, `next`, `react` and `react-dom` are peers as well and are already
part of every Payload app.

### Styling

Docs pages and components use Tailwind utility classes from both packages. With
Tailwind v4, add both packages to your app stylesheet's sources:

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
@source "../node_modules/@valkyrianlabs/payload-markdown/dist";
@source "../node_modules/@valkyrianlabs/payload-markdown-docs/dist";
```

Adjust the relative paths to where your stylesheet lives. The components expect
`--color-foreground`, `--color-border` and `--color-background` theme tokens
(shadcn-style `text-foreground`, `border-border`, `bg-background`).

`payload-markdown-docs` uses `payload-markdown` for Markdown fields and rendering. It does not duplicate the renderer.

The npm package installs the Payload plugin/runtime integration only. Install
the native `pmdocs` CLI separately anywhere you validate, plan, install routes,
generate keys, or publish docs. This keeps docs-only repos and CI jobs from
needing a Node dependency install just to run operator commands.

## Native CLI

Debian/Ubuntu:

```bash
sudo install -d -m 0755 /etc/apt/keyrings
sudo curl -fsSL https://apt.valkyrianlabs.com/pubkey.gpg \
  -o /etc/apt/keyrings/valkyrianlabs.gpg
sudo chmod 0644 /etc/apt/keyrings/valkyrianlabs.gpg

echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/valkyrianlabs.gpg] https://apt.valkyrianlabs.com stable main" | \
  sudo tee /etc/apt/sources.list.d/valkyrianlabs.list > /dev/null

sudo apt-get update
sudo apt-get install -y pmdocs

pmdocs --version
pmdocs --help
```

Homebrew:

```bash
brew tap valkyrianlabs/tap
brew install pmdocs

pmdocs --version
pmdocs --help
```

## Minimal Plugin Registration

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

An enabled plugin registers the default docs infrastructure:

- `docs-sets`
- `docs-groups`
- `docs-access`
- `docs`
- `docs-sync-runs`
- `docs-sync-nonces`

## Recommended Server Config

```ts
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
    allowHardDelete: false,
    deleteBehavior: 'archive',
  },
})
```

Create a docs set in Payload Admin for each docs package. The docs set slug is
the sync source. Routes are derived from the optional group and slug. GitHub OIDC
trust records and Ed25519 keys live in `Docs Globals > Access`.

:::callout {variant="warning" title="Writes are opt-in"}
`mode: "sync"` requests are rejected unless the server has `sync.allowWrites: true`. Publish requests are rejected unless `sync.allowPublish: true` and drafts are enabled for the dedicated docs collection.
:::

Next, create keys with [keygen](/getting-started/keygen), then follow the [quick start](/getting-started/quick-start).
