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
Resolves docs sets, then verifies Ed25519 signatures or GitHub OIDC bearer
tokens, body hashes, nonces, and manifests.
:::

:::card {title="Docs sets" href="/concepts/docs-sets"}
Own docs package slugs, branch policy, generated docs records, and sync
metadata. Routes are derived from groups and slugs.
:::

:::

## Request Flow

:::steps {variant="cards" layout="stack" numbered stepTheme="glass"}

### Build a manifest

The CLI walks local Markdown files and computes SHA-256 hashes.

### Authenticate the request

The CLI signs a canonical request string with an Ed25519 private key or requests
a GitHub Actions OIDC token.

### Verify on the server

Payload resolves the docs set, verifies body hash, replay protection, auth
claims or signature, and manifest validity.

### Plan and apply

Dry-run computes a plan only. Sync mode applies creates, updates, archive/draft/delete lifecycle changes only when server gates allow them.

:::

## Storage Model

The default target is a generated docs collection owned by the plugin. It stores one generated/internal record per Markdown file for routing, search, sync correctness, and overrides.

Users manage docs through docs groups and docs sets. They should not create one Payload Page per Markdown doc.

## Rendering Model

The `/next` export provides a read-only route adapter. A Next route can resolve docs routes first, render docs if found, and fall back to a normal Pages renderer otherwise. See [route adapter](/frontend/route-adapter).
