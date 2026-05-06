---
title: Payload Markdown Docs
navTitle: Overview
description: Git-backed Markdown documentation sync for Payload CMS.
order: 0
status: published
tags:
  - overview
---

# Payload Markdown Docs

`@valkyrianlabs/payload-markdown-docs` publishes Git-backed Markdown documentation into Payload CMS. Developers and agents edit files in a repo-local `docs/` folder, CI validates and authenticates a manifest, and the Payload plugin decides what can be synced.

:::callout {variant="info" title="CMS-owned authority"}
The client sends docs content. Payload docs sets decide where it may go and
which source credentials are trusted; plugin config decides whether writes,
publishing, or hard delete are permitted.
:::

The package is built around `@valkyrianlabs/payload-markdown`. That package owns Markdown fields, directive rendering, themes, and authoring UX. This package owns docs ingestion, signed sync, audit records, docs sets, route helpers, and CI/local tooling.

:::cards {columns="3" cardTheme="glass"}

:::card {title="Quick start" href="/getting-started/quick-start"}
Configure the plugin, generate keys, validate local docs, and run the first signed dry-run.
:::

:::card {title="Architecture" href="/concepts/architecture"}
Understand the docs groups, docs sets, generated docs records, signed endpoint, and route adapter.
:::

:::card {title="Route adapter" href="/frontend/route-adapter"}
Render docs from your Next route layer without creating one Payload Page per Markdown file.
:::

:::card {title="Agent skill" href="/workflow/agent-skill-installer"}
Install local agent guidance for writing docs that validate and sync.
:::

:::

## What Is Implemented

- dedicated docs, docs groups, docs sets, sync runs, and nonce collections
- signed Ed25519 sync endpoint with nonce replay protection
- GitHub Actions OIDC auth mode with docs-set repository/ref allowlists
- CLI commands for `validate`, `manifest`, `plan`, `keygen`, and signed `push`
- server-gated sync writes, publishing, draft behavior, archive behavior, and hard delete
- route reservations and opt-in Pages collision checks
- read-only `/next` route adapter, metadata helper, and sidebar helper
- read-only Docs Set Admin Manager
- local agent skill installer

## What Is Not Implemented

- existing collection targets
- block targets
- inline override editing in the Docs Set Admin Manager

## Recommended Path

:::steps {variant="cards" layout="stack" numbered stepTheme="glass"}

### Install

Add `@valkyrianlabs/payload-markdown-docs` and `@valkyrianlabs/payload-markdown`.

### Configure Payload

Register `payloadMarkdownDocs()` with explicit write gates, then create a docs
set in Payload Admin with `sourceId`, `routeBase`, and auth policy.

### Validate locally

Run `payload-markdown-docs validate ./docs --source main-docs`.

### Push safely

Use `push --dry-run` on pull requests and `push --sync --publish` only when the server config allows writes and publishing.

:::

Continue with [installation](/getting-started/installation) or jump to the [GitHub Actions workflow](/workflow/ci-github-actions).
