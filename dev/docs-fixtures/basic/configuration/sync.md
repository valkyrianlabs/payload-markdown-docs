---
title: Sync Configuration
navTitle: Sync
description: Configure local signed docs sync for the dev harness.
order: 20
status: published
tags:
  - dev
  - sync
---

# Sync Configuration

:::toc {title="On this page" depth="2" theme="compact"}
:::

The docs seed script stores the public key on the docs set from
`DOCS_SYNC_PUBLIC_KEY`, `DOCS_SYNC_PUBLIC_KEY_FILE`, or
`dev/.docs-sync/docs-sync-public.pem`.

:::details {title="Server gates"}
The dev harness enables writes and publishing for the dedicated generated docs collection. Hard delete stays disabled.
:::
