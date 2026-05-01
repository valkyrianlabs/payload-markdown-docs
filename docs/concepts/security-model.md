---
title: Security Model
description: Signed requests, body hashes, timestamps, nonces, and server-owned sync authority.
order: 140
status: published
tags:
  - concepts
  - security
---

# Security Model

The sync endpoint is designed to be strict by default.

:::callout {variant="warning" title="No unauthenticated sync"}
Production sync should use Ed25519 signed requests. Basic auth is not the default serious production model.
:::

## Signed Headers

The endpoint expects:

```text
X-VL-MD-DOCS-Key-Id
X-VL-MD-DOCS-Timestamp
X-VL-MD-DOCS-Nonce
X-VL-MD-DOCS-Body-SHA256
X-VL-MD-DOCS-Signature
```

## Canonical String

The sender signs:

```text
v1
POST
<endpoint pathname>
<timestamp>
<nonce>
<sha256(body)>
```

The CLI derives the endpoint pathname from the full endpoint URL.

## Server-Owned Controls

The manifest cannot choose:

- target collection
- target field names
- route base
- publish authority
- hard delete authority
- allowed source ids

The server config owns those decisions.

## Replay Protection

Accepted nonces are stored in the `docs-sync-nonces` collection. A repeated nonce for the same key id is rejected while it is still valid.

## Common Rejections

See [troubleshooting](/reference/troubleshooting) for `invalid_signature`, `body_hash_mismatch`, `nonce_replay`, `source_not_allowed`, `publish_disabled`, and other endpoint errors.
