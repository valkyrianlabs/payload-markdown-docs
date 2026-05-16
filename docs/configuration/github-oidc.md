---
title: GitHub OIDC
navTitle: GitHub OIDC
description: Use GitHub Actions OIDC without long-lived docs sync secrets.
order: 235
status: published
tags:
  - configuration
  - security
  - ci
---

# GitHub OIDC

GitHub OIDC lets GitHub Actions authenticate to the sync endpoint without
storing a long-lived Ed25519 private key secret.

:::toc {title="On this page" depth="3" theme="compact"}
:::

## Server Config

Enable GitHub OIDC at the plugin level:

```ts
payloadMarkdownDocs({
  auth: {
    githubOidc: true,
  },
  target: {
    enableDrafts: true,
  },
  sync: {
    allowWrites: true,
    allowPublish: true,
  },
})
```

Then create records in Payload Admin:

- `Docs Globals > Sets`: a docs set whose slug matches the CLI source
- `Docs Globals > Access`: a GitHub OIDC record for the trusted owner

The docs set branch is the normal publishing boundary. The token repository
owner must match a GitHub OIDC Access owner. If `limitRepos` is off, any
repository under that owner is trusted. If it is on, the repository must be
listed.

## Workflow Permissions

GitHub only exposes the OIDC token request endpoint when the workflow grants
`id-token: write`.

```yaml
permissions:
  id-token: write
  contents: read
```

## Push With OIDC

Sync is the default mode:

```bash
pnpm exec payload-markdown-docs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc
```

Use `--dry-run` for an explicit validation-only request, such as pull request
checks:

```bash
pnpm exec payload-markdown-docs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc \
  --dry-run
```

Request published output separately:

```bash
pnpm exec payload-markdown-docs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc \
  --publish
```

When the docs set slug matches the repository name, omit `--source` in GitHub
Actions and the CLI derives it from `GITHUB_REPOSITORY`.

:::details {title="Advanced workflow refs"}
You do not need this for normal docs publishing. Each docs set can enable exact
workflow refs in its advanced security section. When disabled, all workflows are
accepted as long as the trusted owner/repository and branch match.

Tag refs are also accepted from trusted repositories when advanced workflow
security is disabled. Enable advanced workflow refs when tag publishing should
be limited to exact workflow files or refs.
:::

## Ed25519 Still Works

Ed25519 signed sync remains supported for local machines, non-GitHub CI, and
workflows that prefer static key pairs. Add public keys in
`Docs Globals > Access`.
See [signed push](/workflow/signed-push).
