---
title: GitHub Actions
navTitle: GitHub Actions
description: Validate, dry-run, sync, and publish docs from GitHub Actions.
order: 310
status: published
tags:
  - workflow
  - ci
---

# GitHub Actions

The recommended CI workflow validates docs on every docs change, dry-runs signed syncs on pull requests, and syncs or publishes from `main`.

:::toc {title="On this page" depth="3" theme="compact"}
:::

## Recommended OIDC Workflow

Use GitHub OIDC when the docs workflow runs in GitHub Actions. It avoids a long-lived private key secret.

Required permission:

```yaml
permissions:
  id-token: write
  contents: read
```

Required secret or environment value:

- `DOCS_SYNC_ENDPOINT`

Create a docs set whose slug matches the CLI source and add a Trusted GitHub
owner in Payload Admin. The docs set branch remains the normal publishing
boundary. Advanced workflow refs are optional and disabled by default.

## Ed25519 Secrets

- `DOCS_SYNC_ENDPOINT`
- `DOCS_SYNC_PRIVATE_KEY`

Use these only for the Ed25519 workflow. The matching docs set must have the
public key configured under the same key id in `Docs Globals > Keys`.

## Workflow Example

See `examples/github-actions/publish-docs.yml` in this repository.

Important commands:

```bash
pnpm exec payload-markdown-docs validate --source main-docs
```

```bash
pnpm exec payload-markdown-docs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc \
  --dry-run
```

```bash
pnpm exec payload-markdown-docs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc \
  --publish
```

:::callout {variant="warning" title="Server gates still apply"}
The publish job succeeds only when the server has `sync.allowWrites: true`, `sync.allowPublish: true`, and `target.enableDrafts: true`.
:::

See [GitHub OIDC](/configuration/github-oidc) for docs set claim validation
details. See [signed push](/workflow/signed-push) for the Ed25519 alternative.
