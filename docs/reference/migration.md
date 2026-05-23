---
title: V1 Migration Notes
navTitle: V1 Migration
description: Migration notes for package consumers moving to the v1 surface.
order: 640
status: published
tags:
  - reference
  - migration
---

# V1 Migration Notes

The v1 package surface uses docs sets, slug-derived routes, server-owned sync
authority, native agent skill assets, and a narrow public package API.

## Admin Records

For each docs package:

1. Create a docs set in `Docs Globals > Sets`.
2. Use the package source id as the `slug`.
3. Set the branch, usually `main`.
4. Add a group only when the route needs nesting.
5. Add GitHub OIDC owner trust in `Docs Globals > Access`.
6. Add Ed25519 public keys in `Docs Globals > Access` if local signed pushes
   are still needed.

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

The npm package no longer provides the supported CLI surface. Replace the old
npm binary invocation:

```bash
pnpm exec payload-markdown-docs push ...
```

with the native binary:

```bash
pmdocs push ...
```

Use:

```bash
pmdocs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc
```

Do not pass route or OIDC audience flags. In GitHub Actions, `--source` can be
omitted when the repository name is the docs set slug.

## Skill-First AI Workflow

AI-facing support comes from native skill packs.

Do not create or maintain:

- `index.ai.yml`
- `index.ai.yaml`
- docs set `aiExport` JSON
- AI export manifest parsing
- raw Markdown export route helpers
- `payload-markdown-docs.md`
- `/plugins/payload-markdown-docs.md`

Use repo-local Markdown files under `/docs` for human documentation source. Use
the canonical skill artifacts under `/skills/payload-markdown-docs/<agent>/` for
agent workflow instructions. The CLI installer copies those artifacts into
project-local agent paths for Codex and Claude.

## Sitemap AI Artifacts

Generated sitemap output now includes canonical human docs routes by default.
Raw AI-facing artifacts are no longer listed in `sitemap.xml` unless explicitly
requested:

- `llms.txt` and `llms-full.txt` require `includeLlms: true`.
- native skill routes such as `/skills/codex`, `/skills/codex/SKILL.md`, and
  `/skills/codex.zip` require `includeSkills: true`.
- stored generic `static` assets require `includeAssets: true`.

`includeAssets` does not imply llms or skill routes. Served asset endpoints are
unchanged; this only controls crawler discovery from the sitemap helper.
