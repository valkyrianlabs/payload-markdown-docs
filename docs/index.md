---
title: Payload Markdown Docs
navTitle: Overview
description: Git-backed Markdown documentation sync for Payload CMS.
order: 0
status: published
tags:
  - overview
dependencies:
  - '@valkyrianlabs/payload-markdown'
---

# Payload Markdown Docs

<span class="flex flex-row gap-x-3 [&_img]:my-0">
  <a href="https://github.com/valkyrianlabs/payload-markdown-docs/actions">
    <img alt="GitHub Workflow Status" src="https://img.shields.io/github/actions/workflow/status/valkyrianlabs/payload-markdown-docs/deploy.yml">
  </a>
  <a href="https://www.npmjs.com/package/@valkyrianlabs/payload-markdown-docs">
    <img alt="npm" src="https://img.shields.io/npm/v/@valkyrianlabs/payload-markdown-docs">
  </a>
  <a href="https://www.npmjs.com/package/@valkyrianlabs/payload-markdown-docs">
    <img alt="npm downloads" src="https://img.shields.io/npm/dw/@valkyrianlabs/payload-markdown-docs">
  </a>
  <a href="https://github.com/valkyrianlabs/payload-markdown-docs?tab=MIT-1-ov-file">
    <img alt="license" src="https://img.shields.io/npm/l/@valkyrianlabs/payload-markdown-docs">
  </a>
</span>

`@valkyrianlabs/payload-markdown-docs` publishes Git-backed Markdown documentation into Payload CMS. Developers and agents edit files in a repo-local `docs/` folder, CI validates and authenticates a manifest, and the Payload plugin decides what can be synced.

:::callout[Early release notice]{variant="warning"}
`@valkyrianlabs/payload-markdown-docs` is still in active pre-v1 development as
of v0.16.0. The project is currently in a particularly volatile stabilization
phase ahead of the planned v1.0.0 release. APIs, collections, configuration
shape, CLI behavior, and documentation structure may change quickly in the
interim.

Use thoughtfully, pin versions, review changelogs, and expect sharper
compatibility guarantees after v1.0.0.
:::

:::callout {variant="info" title="CMS-owned authority"}
The client sends docs content. Payload docs sets decide where it may go and
which source credentials are trusted; plugin config decides whether writes,
publishing, or hard delete are permitted.
:::

The package is built around `@valkyrianlabs/payload-markdown`. That package owns Markdown fields, directive rendering, themes, and authoring UX. This package owns docs ingestion, signed sync, audit records, docs sets, route resolution, and CI/local tooling.

:::cards {columns="3" cardTheme="glass"}

:::card {title="Quick start" href="/getting-started/quick-start"}
Configure the plugin, validate the docs package, install public asset routes, and run the first sync.
:::

:::card {title="Architecture" href="/concepts/architecture"}
Understand the docs groups, docs sets, generated docs records, signed endpoint, and route adapter.
:::

:::card {title="Frontend helpers" href="/frontend/route-adapter"}
Render docs routes, metadata, sitemaps, sidebar data, and nav links from Next.
:::

:::card {title="Dynamic sitemap" href="/frontend/sitemap"}
Add canonical docs records and docs set URLs to `src/app/sitemap.ts`, with opt-in raw asset entries.
:::

:::card {title="Agent skill" href="/workflow/agent-skill-installer"}
Install local agent guidance for writing docs that validate and sync.
:::

:::card {title="Public API" href="/reference/public-api"}
Use the root, `/next`, `/admin`, and `/blocks` package surfaces intentionally.
:::

:::

## What Is Implemented

- dedicated docs, docs groups, docs sets, sync runs, and nonce collections
- signed Ed25519 sync endpoint with nonce replay protection
- GitHub Actions OIDC auth mode with Access owner/repository checks
- CLI commands for `validate`, `manifest`, `plan`, `keygen`, and signed `push`
- server-gated sync writes, publishing, draft behavior, archive behavior, and hard delete
- route reservations and opt-in Pages collision checks
- read-only `/next` route adapter, metadata, sitemap, sidebar data, and navbar helpers
- generated root and docs-set `llms.txt` / `llms-full.txt` endpoints
- raw asset storage for skills and optional custom static assets
- public asset route installer for Next App Router apps
- default sitemap support for canonical docs pages, with opt-in raw asset entries
- Docs Set Admin Manager with generated doc review and draft publish action
- local Codex and Claude skill installer
- canonical agent skill artifacts under `/skills`

## What Is Not Implemented

- existing collection targets
- block targets
- inline override editing in the Docs Set Admin Manager
- automatic frontend route or Page creation in your Next app

## Recommended Path

:::steps {variant="cards" layout="stack" numbered stepTheme="glass"}

### Install

Add `@valkyrianlabs/payload-markdown-docs` and `@valkyrianlabs/payload-markdown`.

### Configure Payload

Register `payloadMarkdownDocs()` with explicit write gates, then create a docs
set in Payload Admin with a title, slug, branch, and optional group.

### Validate locally

Run `payload-markdown-docs validate ./docs --source main-docs`.

### Push safely

Use `push --dry-run` on pull requests and `push --publish` on main when the server config allows writes and publishing.

:::

Continue with [installation](/getting-started/installation) or jump to the [GitHub Actions workflow](/workflow/ci-github-actions).
