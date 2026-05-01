---
title: Architecture
description: How payload-markdown-docs validates, signs, syncs, stores, and renders docs.
order: 100
status: published
tags:
  - concepts
---

# Architecture

`payload-markdown-docs` is a docs publishing workflow around Payload CMS and `@valkyrianlabs/payload-markdown`.

:::toc {title="On this page" depth="3" theme="compact"}
:::

## Main Parts

:::cards {columns="3" cardTheme="glass"}

:::card {title="CLI" href="/reference/cli"}
Builds manifests, validates docs, signs requests, and pushes dry-run or sync requests.
:::

:::card {title="Sync endpoint" href="/workflow/signed-push"}
Verifies Ed25519 signatures, timestamps, nonces, body hashes, and manifests.
:::

:::card {title="Docs sets" href="/concepts/docs-sets"}
Own source ids, route bases, generated docs records, and future rendering defaults.
:::

:::

## Request Flow

:::steps {variant="cards" layout="stack" numbered stepTheme="glass"}

### Build a manifest

The CLI walks local Markdown files and computes SHA-256 hashes.

### Sign the request

The CLI signs a canonical request string with the configured private key.

### Verify on the server

Payload verifies headers, body hash, timestamp skew, nonce replay, signature, and manifest validity.

### Plan and apply

Dry-run computes a plan only. Sync mode applies creates, updates, archive/draft/delete lifecycle changes only when server gates allow them.

:::

## Storage Model

The default target is a generated docs collection owned by the plugin. It stores one generated/internal record per Markdown file for routing, search, sync correctness, and overrides.

Users manage docs through docs groups and docs sets. They should not create one Payload Page per Markdown doc.

## Rendering Model

The `/next` export provides a read-only route adapter. A Next route can resolve docs routes first, render docs if found, and fall back to a normal Pages renderer otherwise. See [route adapter](/frontend/route-adapter).
