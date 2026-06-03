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

`pmdocs push` builds a manifest, validates it locally, authenticates the upload, and posts it to the configured endpoint.

Two auth modes are supported:

- Ed25519 request signing for provider-neutral CI/local workflows.
- GitHub OIDC bearer auth for GitHub Actions without a long-lived private key.

Examples that use `main-docs` are using the quick-start docs set slug. Replace
it with the Payload docs set slug for the project you are syncing.

## Dry Run

```bash
pmdocs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-file .docs-sync/docs-sync-private.pem \
  --dry-run
```

Dry-run is an explicit validation-only mode. Without `--dry-run`, `push`
defaults to sync mode.

## Sync

```bash
pmdocs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY
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
then verifies the request against an Ed25519 record in the Access collection
before it applies the manifest.

Private keys may be CLI-generated PKCS#8 PEM/base64 keys or unencrypted
OpenSSH Ed25519 private keys. Public keys in `Docs Globals > Access` may be
PKCS#8/SPKI public keys from `keygen` or `ssh-ed25519 ...` OpenSSH public keys.

## GitHub OIDC

```bash
pmdocs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source <docs-set-slug> \
  --github-oidc
```

In OIDC mode, the CLI sends:

```text
Authorization: Bearer <github-oidc-jwt>
X-VL-MD-DOCS-Body-SHA256
Content-Type: application/json
```

OIDC is bearer authentication, not a body signature. The server resolves the
docs set, verifies the JWT against GitHub's JWKS, checks docs-set claim
branch plus Access owner/repository records, checks the body hash, and
uses the token `jti` for replay protection.

OIDC does not require `--repository`, `--branch`, or `--commit`; those are
optional manifest metadata. The trusted repository, ref, and SHA come from the
GitHub OIDC token claims.

See the [security model](/concepts/security-model).
