---
title: Upgrading to 1.3
navTitle: Upgrade to 1.3
description: Database changes and rollout notes for project metadata and the projects API.
order: 637
status: published
tags:
  - reference
  - upgrade
---

# Upgrading to 1.3

1.3 adds project metadata to docs sets: a technology stack, and an optional
title and description synced from [`docs/stack.toml`](/reference/stack-toml).
It also adds the opt-in [projects API](/reference/projects-api). Nothing changes
for a site until a docs repository adds `stack.toml` or the API is enabled.

## Database

| Table | Change |
| --- | --- |
| `docs_sets` | New columns: `manual_title_description` (boolean, no default), `stack` (JSON), `sync_project_title`, `sync_project_description` |
| `_docs_sets_v` | The same columns for versions |

Every change is additive and needs no data step. Existing rows get `NULL` for
`manual_title_description`, which the plugin treats as **on** (the admin manages
the title and description). The admin shows these docs sets with the setting
checked, so a sync never replaces a title that already exists. The column has no
database default on purpose: a default of `false` would hand existing titles to
the next sync.

With migrations:

```bash
pnpm payload migrate:create docs_1_3
pnpm payload migrate
```

Dev schema push applies the columns on start. MongoDB needs nothing.

Table names follow your collection slugs if you changed them.

## Rollout

- **Server first, then CI.** A 1.3 `pmdocs` sends `stack.toml` to any server.
  Before the server runs 1.3, the server ignores it and `pmdocs push` warns
  that the stack was not synchronized; the docs still sync.
- **Older `pmdocs`** never sends project metadata, so the stored stack and
  titles are left alone.
- **Agent-owned titles.** To let `stack.toml` own an existing docs set's
  title and description, turn off **Manually manage title/desc** on that docs
  set. New docs sets start with it off.
- **Projects API.** Set `publicApi: { projects: true }` on each site that
  other sites should read. Then install
  `@valkyrianlabs/payload-markdown-docs-consumer` where you render the
  projects.
- **Agent skills.** Run `pmdocs skill update` in docs repositories so agents
  learn to maintain `stack.toml`.

## Preview cards

The default docs preview cards in the product hero show a docs set's stack as
text pills: at most four on compact cards, with the rest collapsed into `+N`.
Docs sets without a stack render exactly as before.
