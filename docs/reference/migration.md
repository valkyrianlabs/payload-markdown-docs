---
title: Migration Notes
navTitle: Migration
description: Breaking changes in the simplified docs usability release.
order: 640
status: published
tags:
  - reference
  - migration
---

# Migration Notes

This release removes the old per-docs-set security and routing knobs. It does
not keep runtime compatibility branches for the removed model.

## Admin Records

For each existing docs package:

1. Create a docs set in `Docs Globals > Sets`.
2. Use the old source value as the new `slug`.
3. Set the branch, usually `main`.
4. Add a group only when the route needs nesting.
5. Add GitHub owner trust in `Docs Globals > Trusted`.
6. Add Ed25519 public keys in `Docs Globals > Keys` if local signed pushes are
   still needed.

Routes are derived from group slugs and the docs set slug. GitHub OIDC audience
is derived from the docs set slug.

## Removed Setup Knobs

Remove these from docs set records, plugin config, scripts, and docs:

- manual route values
- source root values
- plugin-level source allowlists
- per-set Ed25519 keys
- per-set GitHub repository owner lists
- OIDC audience flags
- OIDC issuer/JWKS/skew options
- workflow restrictions unless advanced security is explicitly enabled
- presentation and SEO placeholder fields

## CLI Changes

Use:

```bash
payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc \
  --sync
```

Do not pass route or OIDC audience flags. In GitHub Actions, `--source` can be
omitted when the repository name is the docs set slug.
