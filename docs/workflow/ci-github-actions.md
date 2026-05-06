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

The server may define a plugin-level `auth.githubOidc.audience`, but the
repository/ref/workflow allowlist belongs on the matching docs set in Payload
Admin. The same docs set can also keep `auth.ed25519.keys` for local machines
or non-GitHub CI on the same endpoint.

## Ed25519 Secrets

- `DOCS_SYNC_ENDPOINT`
- `DOCS_SYNC_PRIVATE_KEY`

Use these only for the Ed25519 workflow. The matching docs set must have the
public key configured under the same key id.

## Workflow Example

See `examples/github-actions/publish-docs.yml` in this repository.

Important commands:

```bash
pnpm exec payload-markdown-docs validate ./docs --source main-docs
```

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc \
  --oidc-audience payload-markdown-docs \
  --dry-run
```

```bash
pnpm exec payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc \
  --oidc-audience payload-markdown-docs \
  --sync \
  --publish
```

:::callout {variant="warning" title="Server gates still apply"}
The publish job succeeds only when the server has `sync.allowWrites: true`, `sync.allowPublish: true`, and `target.enableDrafts: true`.
:::

See [GitHub OIDC](/configuration/github-oidc) for docs set claim validation
details. See [signed push](/workflow/signed-push) for the Ed25519 alternative.
