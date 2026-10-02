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

The docs set slug is the `pmdocs --source` value and the OIDC audience. Choose
that source id before writing the workflow.

The token repository owner must match a GitHub OIDC Access owner. If
`limitRepos` is off, any repository under that owner is trusted. If it is on,
the repository must be listed. By itself an owner record trusts its
repositories for every docs set: any trusted repository can mint a token whose
audience is any docs set slug.

Narrow that per docs set:

- Access record `Allowed docs sets`: limit an owner/repository record to the
  listed docs sets. Empty allows every docs set.
- Docs set `Allowed repositories` (Security tab): only these repositories may
  publish the docs set (`owner/repo`, or `repo` under the trusted owner). Empty
  accepts any repository trusted in Access.
- Docs set `Allow tag refs` (Security tab, on by default): tokens for any
  `refs/tags/*` ref are accepted in addition to the docs set branch. This keeps
  release-triggered publishing working. Turn it off so only the branch can
  publish, or enable advanced workflow refs to limit tags to exact workflows.

The docs set branch is the publishing boundary only for branch refs; with
`Allow tag refs` on, anyone who can push a tag in a trusted repository can
publish.

Pull request tokens (`event_name: pull_request`, `ref: refs/pull/<n>/merge`)
are rejected unless the docs set enables `allowPullRequests`. When enabled,
the pull request's base branch (`base_ref`) must be the docs set branch.

## Workflow Permissions

GitHub only exposes the OIDC token request endpoint when the workflow grants
`id-token: write`.

```yaml
permissions:
  id-token: write
  contents: read
```

## Push With OIDC

Replace `<docs-set-slug>` with the Payload docs set slug. Pass it explicitly in
GitHub Actions workflows instead of relying on repository-name defaults.

Sync is the default mode:

```bash
pmdocs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source <docs-set-slug> \
  --github-oidc
```

Use `--dry-run` for an explicit validation-only request, such as pull request
checks:

```bash
pmdocs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source <docs-set-slug> \
  --github-oidc \
  --dry-run
```

Request published output separately:

```bash
pmdocs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source <docs-set-slug> \
  --github-oidc \
  --publish
```

OIDC authentication does not require `--repository`, `--branch`, or `--commit`.
Payload verifies repository, ref, and commit identity from GitHub's OIDC token
claims. Those flags are optional manifest metadata, not OIDC requirements.

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
