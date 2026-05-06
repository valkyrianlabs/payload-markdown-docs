---
title: GitHub OIDC
navTitle: GitHub OIDC
description: Use GitHub Actions OIDC instead of a long-lived docs sync private key.
order: 235
status: published
tags:
  - configuration
  - security
  - ci
---

# GitHub OIDC

GitHub OIDC lets GitHub Actions authenticate to the sync endpoint without storing a long-lived Ed25519 private key secret.

:::toc {title="On this page" depth="3" theme="compact"}
:::

## Server Config

Configure the plugin with the shared OIDC audience and keep repository/workflow
allowlists on each docs set.

```ts
payloadMarkdownDocs({
  enabled: true,

  auth: {
    githubOidc: {
      audience: 'payload-markdown-docs',
    },
  },

  target: {
    type: 'docsCollection',
    enableDrafts: true,
  },

  sync: {
    allowWrites: true,
    allowPublish: true,
  },
})
```

Then create or update the matching docs set in Payload Admin:

```text
sourceId: main-docs
sourceRoot: docs
routeBase: /plugins/payload-markdown-docs
auth.githubOidc.enabled: true
auth.githubOidc.allowedRepositories:
  - valkyrianlabs/payload-markdown-docs
auth.githubOidc.allowedRefs:
  - refs/heads/main
```

You can also add `auth.ed25519.keys` on the same docs set. The sync endpoint
will accept either Ed25519 signed requests or GitHub OIDC bearer requests for
that source.

:::callout {variant="warning" title="Keep the allowlist narrow"}
Do not configure OIDC for every repository or ref. The endpoint verifies the
GitHub token, but your docs set policy decides which repositories, refs,
workflows, and environments are trusted.
:::

## Workflow Permissions

GitHub only exposes the OIDC token request endpoint when the workflow grants `id-token: write`.

```yaml
permissions:
  id-token: write
  contents: read
```

## Push With OIDC

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

The endpoint still checks `X-VL-MD-DOCS-Body-SHA256`, but OIDC is bearer authentication, not a body signature. Replay protection uses the token `jti`.

:::details {title="Claims checked by the endpoint"}
The endpoint validates issuer, audience, expiry, issued-at time, `jti`, repository, repository owner, ref, optional workflow fields, optional environment, and pull request policy.

Pull request events are rejected by default. Set `allowPullRequests: true` only if the server should accept PR-originated docs sync requests.
:::

## Ed25519 Still Works

Ed25519 signed sync remains supported and is still the provider-neutral option for local machines, non-GitHub CI, and workflows that prefer static key pairs. See [signed push](/workflow/signed-push).
