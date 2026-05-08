---
title: Signed Push
navTitle: Signed Push
description: Send signed dry-run and sync requests to the Payload endpoint.
order: 320
status: published
tags:
  - workflow
  - security
---

# Signed Push

`payload-markdown-docs push` builds a manifest, validates it locally, authenticates the upload, and posts it to the configured endpoint.

Two auth modes are supported:

- Ed25519 request signing for provider-neutral CI/local workflows.
- GitHub OIDC bearer auth for GitHub Actions without a long-lived private key.

## Dry Run

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-file .docs-sync/docs-sync-private.pem \
  --dry-run
```

Dry-run is the default when neither `--dry-run` nor `--sync` is provided.

## Sync

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --sync
```

Sync mode requires `sync.allowWrites: true` on the server.

## Ed25519 Request Headers

In Ed25519 mode, the CLI sends:

```text
X-VL-MD-DOCS-Key-Id
X-VL-MD-DOCS-Timestamp
X-VL-MD-DOCS-Nonce
X-VL-MD-DOCS-Body-SHA256
X-VL-MD-DOCS-Signature
Content-Type: application/json
```

The endpoint reads the manifest source, resolves the matching docs set, and
then verifies the request against the global Keys collection before it applies
the manifest.

## GitHub OIDC

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc \
  --sync
```

In OIDC mode, the CLI sends:

```text
Authorization: Bearer <github-oidc-jwt>
X-VL-MD-DOCS-Body-SHA256
Content-Type: application/json
```

OIDC is bearer authentication, not a body signature. The server resolves the
docs set, verifies the JWT against GitHub's JWKS, checks docs-set claim
branch plus global Trusted owner/repository records, checks the body hash, and
uses the token `jti` for replay protection.

See the [security model](/concepts/security-model).
