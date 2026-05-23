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

Create a docs set whose slug matches the CLI source and add a GitHub OIDC record
in `Docs Globals > Access`. The docs set branch remains the normal publishing
boundary. Advanced workflow refs are optional and disabled by default.

## Ed25519 Secrets

- `DOCS_SYNC_ENDPOINT`
- `DOCS_SYNC_PRIVATE_KEY`

Use these only for the Ed25519 workflow. The matching docs set must have the
public key configured under the same key id in `Docs Globals > Access`.

## Workflow Example

See `examples/github-actions/publish-docs.yml` in this repository.

That workflow installs `pmdocs` from the Valkyrian Labs Debian repository before
validation or publishing, then logs `pmdocs --version` and `pmdocs --help` so
the CI output proves the native CLI path is being used.

Important commands:

```bash
pmdocs validate --source main-docs
```

Main-branch sync defaults to sync mode:

```bash
pmdocs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc
```

Pull request dry-run is explicit:

```bash
pmdocs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc \
  --dry-run
```

```bash
pmdocs push \
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
