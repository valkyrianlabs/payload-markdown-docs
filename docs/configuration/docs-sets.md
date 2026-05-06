---
title: Docs Sets Configuration
navTitle: Docs Sets
description: Configure docs groups and docs sets for server-owned route bases.
order: 210
status: published
tags:
  - configuration
  - docs-sets
---

# Docs Sets Configuration

Docs sets are stored in the `docs-sets` collection by default. They map signed
source ids to server-owned route bases and source-specific sync auth policy.

## Required Fields

For a typical docs set, configure:

- `title`
- `slug`
- `sourceId`
- `routeBase`

Example:

```text
title: Payload Markdown Docs
slug: payload-markdown-docs
sourceId: main-docs
routeBase: /plugins/payload-markdown-docs
```

## Source Root

`sourceRoot` describes the source folder, usually `docs`. The sync endpoint
validates the manifest `source.root` against this value when both are present.

## Auth Policy

Use the docs set `auth` group to decide which credentials may update that docs
set.

- `auth.ed25519.keys` stores `keyId` and `publicKey` pairs for local machines
  or non-GitHub CI.
- `auth.githubOidc.enabled` enables GitHub Actions OIDC for this docs set.
- `auth.githubOidc.allowedRepositories` and
  `auth.githubOidc.allowedRepositoryOwners` restrict where tokens can come from.
- `auth.githubOidc.allowedRefs`, `allowedWorkflows`,
  `allowedWorkflowRefs`, and `allowedEnvironments` add optional exact-match
  constraints.
- `auth.githubOidc.audience` overrides the plugin-level audience when needed.

The plugin-level `sources` option remains available as a backward-compatible
fallback, but new docs packages should be added by creating docs sets in Payload
Admin.

## Defaults

The `defaults` group is schema runway for rendering defaults:

- `theme`
- `heroEyebrow`
- `heroTitle`
- `heroDescription`
- `seoTitle`
- `seoDescription`
- `sidebarMode`

The current route adapter exposes enough data for rendering, but it does not implement a full theme system.

## Sync Metadata

The `sync` group stores last sync status and counts. The Docs Set Admin Manager uses this metadata for the generated docs overview.

See [Docs Set Admin Manager](/admin/docs-set-manager).
