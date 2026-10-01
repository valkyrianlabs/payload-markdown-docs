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
Production sync should use GitHub OIDC or Ed25519 signed requests. Basic auth is
not a production sync model.
:::

GitHub Actions OIDC is also supported and avoids long-lived private keys in
GitHub workflows.

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
- allowed docs set slugs
- source-specific auth allowlists

Payload Admin docs sets own package routing, branch, OIDC audience, and
source-specific restrictions. Access records own reusable publishing
credentials and trust: Ed25519 public keys for signed manual, local, or
non-GitHub sync, and GitHub OIDC owner/repository allowlists for GitHub Actions
sync. Nonces provide replay protection. Sync runs provide audit history. Plugin
config owns collection setup and lifecycle gates such as write, publish, and
hard-delete authority.

## Replay Protection

Nonces are stored in the `docs-sync-nonces` collection as soon as a request is
authenticated, before the manifest is validated or applied. The collection has
a unique `(keyId, nonce)` index, so concurrent requests with the same nonce
cannot both be accepted, and a request rejected later (invalid manifest, route
collision, policy error) cannot be replayed once the problem is fixed.

- Ed25519 nonces are kept at least until the signed timestamp leaves the
  allowed clock skew window.
- GitHub OIDC `jti` values are kept until the token's `exp` plus the allowed
  skew, the full time the token can still be accepted.
- Expired nonce rows are deleted opportunistically during later syncs.

## Request Order

The endpoint authenticates before it reads any docs-set data. Requests without
valid credentials get a `401` that does not depend on whether the docs set in
`source.id` exists. `source.id` must be a docs-set slug string, and bodies
larger than `endpoint.maxBodyBytes` are rejected with `413` without being
buffered. For GitHub OIDC, the token signature, issuer, audience (`source.id`),
expiry, and trusted owner/repository are verified first; the docs set's branch,
workflow, and pull-request rules are checked after the docs set is resolved.

## Common Rejections

See [troubleshooting](/reference/troubleshooting) for `invalid_signature`, `body_hash_mismatch`, `nonce_replay`, `source_not_allowed`, `publish_disabled`, and other endpoint errors.
