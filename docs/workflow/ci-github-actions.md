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

The recommended CI workflow validates and plans docs on every docs change, can optionally dry-run syncs on pull requests, and syncs or publishes from `main`.

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
- `PMDOCS_SOURCE`: the Payload docs set slug to pass as `--source`

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
pmdocs validate --source "$PMDOCS_SOURCE"
```

Main-branch sync defaults to sync mode:

```bash
pmdocs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source "$PMDOCS_SOURCE" \
  --github-oidc
```

Pull requests always run `pmdocs validate` and `pmdocs plan` locally. A
server-side dry-run is explicit and opt-in:

```bash
pmdocs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source "$PMDOCS_SOURCE" \
  --github-oidc \
  --dry-run
```

GitHub issues pull request OIDC tokens with `ref: refs/pull/<number>/merge`, not
the docs set branch, and never issues them to pull requests from forks. The
example workflow therefore runs the dry-run only when the repository variable
`DOCS_SYNC_PR_DRY_RUN` is `true` and the pull request comes from the same
repository. Enable it only after allowing pull requests on the docs set and
confirming that your Payload server accepts pull request tokens for the docs
set branch; otherwise the dry-run fails with `oidc_ref_not_allowed`.

Never run pull request code on self-hosted runners that also hold release or
deployment credentials: use GitHub-hosted runners for `pull_request` jobs.

```bash
pmdocs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source "$PMDOCS_SOURCE" \
  --github-oidc \
  --publish
```

Do not omit `--source` in copied workflow templates. Set `PMDOCS_SOURCE` to the
docs set slug you created in Payload Admin.

:::callout {variant="warning" title="Server gates still apply"}
The publish job succeeds only when the server has `sync.allowWrites: true`, `sync.allowPublish: true`, and `target.enableDrafts: true`.
:::

See [GitHub OIDC](/configuration/github-oidc) for docs set claim validation
details. See [signed push](/workflow/signed-push) for the Ed25519 alternative.
