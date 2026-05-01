---
title: Troubleshooting
description: Common validation, signing, sync, route, and environment issues.
order: 630
status: published
tags:
  - reference
  - troubleshooting
---

# Troubleshooting

:::toc {title="On this page" depth="3" theme="compact"}
:::

## `invalid_signature`

The signature does not match the canonical request string. Check the key id, private key, endpoint URL pathname, timestamp, nonce, and exact JSON body.

## `body_hash_mismatch`

The `X-VL-MD-DOCS-Body-SHA256` header does not match the request body. Sign and send the exact same body string.

## `nonce_replay`

The nonce was already accepted for the same key id. Generate a fresh nonce by rerunning `push`.

## `source_not_allowed`

The manifest source id did not resolve to a docs set and was not allowed by configured fallback sources.

## `publish_disabled`

The request asked to publish, but the server does not have `sync.allowPublish: true`.

## `hard_delete_disabled`

The effective delete behavior is `delete`, but the server does not have `sync.allowHardDelete: true`.

## `route_collision`

The generated docs route conflicts with another docs route or an opt-in Pages collision check.

## `manual_edit_conflict`

A generated docs record changed outside the docs sync workflow. The sync aborts before writes to avoid overwriting human edits.

## Postgres In Tests

The dev integration tests use PostgreSQL. In restricted sandboxes, Vitest may need permission to connect to the local test database.

:::callout {variant="warning" title="Do not ignore auth failures"}
Auth and body verification errors should be fixed at the key, endpoint, or request level. Do not disable authentication to make CI pass.
:::
