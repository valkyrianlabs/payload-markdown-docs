---
title: Key Generation
navTitle: Keygen
description: Generate Ed25519 keys for signed docs sync requests.
order: 30
status: published
tags:
  - getting-started
  - security
---

# Key Generation

The signed sync endpoint uses Ed25519 request signatures. Generate a key pair with the CLI:

```bash
pnpm exec payload-markdown-docs keygen --out .docs-sync
```

This writes:

- `.docs-sync/docs-sync-private.pem`
- `.docs-sync/docs-sync-public.pem`

:::callout {variant="warning" title="Do not commit the private key"}
The public key belongs in Payload config or an environment variable. The private key belongs in local secret storage or a CI secret such as `DOCS_SYNC_PRIVATE_KEY`.
:::

## Configure The Public Key

```ts
payloadMarkdownDocs({
  auth: {
    mode: 'ed25519',
    keys: [
      {
        id: 'github-actions-main',
        publicKey: process.env.DOCS_SYNC_PUBLIC_KEY!,
      },
    ],
  },
})
```

## Use The Private Key

:::steps {variant="cards" layout="stack" numbered stepTheme="glass"}

### Local dry-run

Use `--private-key-file .docs-sync/docs-sync-private.pem`.

### CI dry-run or publish

Store the PEM as `DOCS_SYNC_PRIVATE_KEY` and use `--private-key-env DOCS_SYNC_PRIVATE_KEY`.

### Rotate keys

Add the new public key to the server config, deploy it, then switch CI to the new private key.

:::

Read the [security model](/concepts/security-model) before exposing the endpoint publicly.
