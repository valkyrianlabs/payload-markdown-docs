<!--
vl-release staged release notes: the user-facing story of the NEXT release.
Maintained continuously while working; `vlr prepare` promotes it into the release notes
history (and the GitHub release) and resets this file to this template.

Format: the first line is "# <release title>" WITHOUT a version number (vlr adds it).
Everything after the title is the Markdown release body. Describe the resulting behavior
for users and operators; keep it representative of what actually ships.
-->

# Project metadata, a public projects API and a consumer package

Docs repositories can now describe the product they document, and other sites can list those
products without copying anything into their own CMS.

## Project metadata from `docs/stack.toml`

Agents (or people) keep an optional `docs/stack.toml` next to `docs/index.md`. It holds a title, a
description and the technology stack, grouped into free-form categories:

```toml
[project]
title = "Vaulthalla"
description = "The Final Cloud — encrypted storage."

[[stack.languages]]
name = "C++23"

[[stack.libraries]]
name = "libpqxx"
```

- `pmdocs validate`, `plan`, `manifest` and `push` read it and report problems by key
  (`stack.toml: stack.languages[0].name must not be empty.`). `pmdocs` now builds with toml++.
- Each sync stores the stack on the docs set, a read-only **Technology stack** field in the admin.
  Categories and items keep their order. An empty `[stack]` clears the stack. Without the file,
  nothing changes.
- The new **Manually manage title/desc** setting decides who owns the docs set's title and
  description. New docs sets start with it off, so values from `stack.toml` apply. Existing docs
  sets behave as if it were on, so upgrading never replaces a title an admin wrote. Values the
  file does not set are never blanked, and SEO fields are never written by sync.
- The stack and agent-owned titles survive admin edits, publishing an older draft, and restoring
  a saved version.
- Default preview cards in the product hero show the stack as text pills: a few on compact cards,
  grouped by category on featured ones. Cards without a stack look exactly as before.
- The bundled agent skills explain when and how to maintain `stack.toml`. Run `pmdocs skill
  update` in docs repositories.
- A 1.3 `pmdocs` pushing to an older server warns that the stack was not synchronized. Docs
  still sync.

## Public projects API (opt-in)

`publicApi: { projects: true }` serves `GET /api/documentation/projects` (with an optional
`?group=` filter) and `GET /api/documentation/projects/:slug`. They list every published docs
set as a small allowlisted object: title, description, SEO metadata with the usual fallbacks,
absolute product and docs URLs, the docs group and the stack. Repository, OIDC, workflow and sync
settings are never exposed. Responses carry `schemaVersion: 1`, a content-derived strong `ETag`
with `304 Not Modified` support, and public cache headers.

## `@valkyrianlabs/payload-markdown-docs-consumer`

This new package, released with the same version, reads the projects API from any number of
sites. It has no dependencies (no Payload, Next.js or React). It fetches sites concurrently,
validates `schemaVersion`, and segments the results by site and then by docs group, plus a flat
list. Keys are scoped to their site (`valkyrianlabs/docs`). A failing site is reported without
hiding the others.

## Upgrading

Postgres apps need a migration for four new, nullable `docs_sets` columns (and their versions).
No data step is needed. See *Upgrading to 1.3* in the docs.

## APT signing key updates arrive through upgrades


`pmdocs` now depends on `valkyrianlabs-archive-keyring`, the package that carries the Valkyrian Labs
APT repository's signing key. Installing or upgrading `pmdocs` installs it, and from then on any change
to the key (such as the removal of its expiry date) reaches the machine through normal upgrades
instead of a manual re-download.

- The package owns `/usr/share/keyrings/valkyrianlabs.gpg`. An unmodified copy of the key at
  `/etc/apt/keyrings/valkyrianlabs.gpg` (the path the installation docs used) is replaced by a link to
  it, so existing `signed-by=` source lines keep working unchanged; a modified file is left alone.
- Upgrade with `apt upgrade` or `apt-get dist-upgrade`: plain `apt-get upgrade` never installs a new
  dependency and keeps `pmdocs` back.
