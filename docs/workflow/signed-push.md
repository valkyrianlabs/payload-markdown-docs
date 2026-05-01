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

`payload-markdown-docs push` builds a manifest, validates it locally, signs the exact JSON body, and posts it to the configured endpoint.

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

## Request Headers

The CLI sends:

```text
X-VL-MD-DOCS-Key-Id
X-VL-MD-DOCS-Timestamp
X-VL-MD-DOCS-Nonce
X-VL-MD-DOCS-Body-SHA256
X-VL-MD-DOCS-Signature
Content-Type: application/json
```

The endpoint verifies the request before it validates or applies the manifest.

See the [security model](/concepts/security-model).
