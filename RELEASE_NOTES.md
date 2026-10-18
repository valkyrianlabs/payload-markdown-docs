# Payload Markdown Docs release notes

<!-- vl-release:entry version=1.3.1 -->
## 1.3.1 — Project metadata, a public projects API and a consumer package

_Released 2026-10-18_

Docs repositories can now describe the product they document, and other sites can list those
products without copying anything into their own CMS.

### Project metadata from `docs/stack.toml`

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

### Public projects API (opt-in)

`publicApi: { projects: true }` serves `GET /api/documentation/projects` (with an optional
`?group=` filter) and `GET /api/documentation/projects/:slug`. They list every published docs
set as a small allowlisted object: title, description, SEO metadata with the usual fallbacks,
absolute product and docs URLs, the docs group and the stack. Repository, OIDC, workflow and sync
settings are never exposed. Responses carry `schemaVersion: 1`, a content-derived strong `ETag`
with `304 Not Modified` support, and public cache headers.

### `payload-markdown-docs-consumer`

This new package (also published as `@valkyrianlabs/payload-markdown-docs-consumer`), released
with the same version, reads the projects API from any number of
sites. It has no dependencies (no Payload, Next.js or React). It fetches sites concurrently,
validates `schemaVersion`, and segments the results by site and then by docs group, plus a flat
list. Keys are scoped to their site (`valkyrianlabs/docs`). A failing site is reported without
hiding the others.

### Upgrading

Postgres apps need a migration for four new, nullable `docs_sets` columns (and their versions).
No data step is needed. See *Upgrading to 1.3* in the docs.

### APT signing key updates arrive through upgrades

`pmdocs` now recommends `valkyrianlabs-archive-keyring`, the package that carries the Valkyrian Labs
APT repository's signing key. Installing `pmdocs` from the repository installs it (APT installs
recommended packages by default), and from then on any change
to the key (such as the removal of its expiry date) reaches the machine through normal upgrades
instead of a manual re-download.

- The package owns `/usr/share/keyrings/valkyrianlabs.gpg`. An unmodified copy of the key at
  `/etc/apt/keyrings/valkyrianlabs.gpg` (the path the installation docs used) is replaced by a link to
  it, so existing `signed-by=` source lines keep working unchanged; a modified file is left alone.
- It is a recommendation, not a hard dependency, so the standalone `.deb` from a GitHub release still
  installs on a system without the repository configured. On machines that already have `pmdocs`,
  install the keyring once with `sudo apt install valkyrianlabs-archive-keyring`.

<!-- vl-release:entry version=1.2.0 -->
## 1.2.0 — payload-markdown-docs, MCP agent tools and skills that stay current

_Released 2026-10-16_

### `pnpm add payload-markdown-docs`

The plugin is now also published under the short name `payload-markdown-docs`:

```bash
pnpm add payload-markdown-docs payload-markdown @payloadcms/plugin-seo
```

`@valkyrianlabs/payload-markdown-docs` stays fully supported. Both names come from the same build and are released together at the same version, with identical files; the only differences are the package name and the name Payload's admin import map uses for the plugin's components, which follows whichever name you installed. Import from the name you installed (`payload-markdown-docs/next`, `payload-markdown-docs/migrations`, and so on), install only one of them, and run `payload generate:importmap` after switching.

payload-markdown works under either of its names too: `payload-markdown` (preferred) or `@valkyrianlabs/payload-markdown`. The docs content field uses the admin component of whichever is installed (detected from the components `payloadMarkdown()` registers, or from `node_modules`; set `payloadMarkdownPackage` to choose explicitly). `pmdocs install routes` writes route files that import the plugin under the name your app depends on.

### Let AI agents manage your docs over MCP

`payload-markdown-docs/mcp` plugs into Payload's official `@payloadcms/plugin-mcp`, next to payload-markdown's own MCP tools:

```ts
mcpPlugin(withPayloadMarkdownMcp(withPayloadMarkdownDocsMcp({ /* mcpPlugin options */ })))
```

Agents get 13 tools to manage the docs site: inspect docs sets, groups and docs (with sync drift), edit presentation fields (hero image, nav overrides, parent, publish date), publish and unpublish, list and inspect versions, roll back to a version Git produced, create and update docs sets and groups (titles, descriptions, SEO, routing, publishing security), manage sync access keys, and read the sync history. Every tool runs as the API key's user with Payload access control.

Git stays the source of truth for doc bodies and frontmatter. A guard on the plugin collections refuses any MCP write to a Git-owned field (`sync_owned`), whichever tool sends it, including payload-markdown's markdown write tools and plugin-mcp's generic collection tools; the sync endpoint, the admin UI and REST are unaffected. See the MCP Agent Tools docs page for setup and the full tool list.

### The payload-markdown skill is always installed

`pmdocs install skill` now always installs the `payload-markdown` skill next to the `payload-markdown-docs` skill. Previously Homebrew installs skipped it silently and Debian installs shipped an old copy. It is taken from your project's installed `payload-markdown` package when there is one, so the directive guidance matches the version your site renders with, and from the copy bundled with `pmdocs` otherwise. If neither is available the command fails instead of installing half the guidance. The `payload-markdown-docs` skill links straight into it for directives, styling, layout and the MCP content workflow.

### Skills that keep themselves current

Installed skills now record what they were installed from, and `pmdocs` notices when a newer one is available:

```bash
pmdocs skill check    # current, outdated, modified or missing per skill; exits 1 unless current
pmdocs skill update   # replaces outdated skills, keeping --docs-root and --package-manager
```

`pmdocs validate` and `pmdocs plan` print a reminder when the installed skill is stale, and the skill tells agents to run `pmdocs skill update` on their own. Skills you edited by hand are never replaced without `--force`. Re-running `pmdocs install skill` over an unedited install no longer needs `--force`.

### Docs routes and the docs nav follow docs set and group changes

Changing a docs set's group, slug or route mode, or a group's slug or parent (or deleting a group), now moves the generated docs and their assets to the new routes immediately, in the same save, instead of leaving them on the old paths until the next sync. Published docs and their drafts move together, the old and new paths are revalidated, and a change that would put docs onto routes another docs set already serves is rejected with nothing saved. Routes that are already stale from earlier changes are repaired by saving the published docs set, or all at once with `repairDocsRoutes({ payload })` from `payload-markdown-docs/migrations`.

The docs nav (`getPayloadMarkdownDocsNavItems`, the header adapters and `PayloadMarkdownDocsNavbar`) is now cached under the `payload-markdown-docs:nav` tag (exported as `PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG`), and the plugin expires it whenever a docs set or group changes and after every sync. Statically prerendered pages that show the docs nav in their header no longer keep serving an outdated nav. Sync and admin revalidation now expire cache tags immediately (`{ expire: 0 }`) rather than serving the stale entry once more.

### Releases

Releases are built and published with vl-release: the Debian package, the Homebrew formula (now built from a release source archive that carries both skills), both npm names and the GitHub release come from one validated build, and a failed release can simply be re-run.

<!-- vl-release:entry version=1.1.0 -->
## 1.1.0 — Security and Correctness Stabilization

_Released 2026-10-02_

Sync security defaults to admin-only access, scopes credentials to docs sets and rejects nonce replays; sync apply is transactional and protects manual edits; draft docs and docs sets stay off public surfaces (llms.txt, sitemap, marketing blocks); `pmdocs` refuses plain-http endpoints, enforces the server's body limit and reports route collisions; apps without a media collection are supported. Full notes: [v1.1.0 on GitHub](https://github.com/valkyrianlabs/payload-markdown-docs/releases/tag/v1.1.0) and the [1.1 upgrade guide](https://github.com/valkyrianlabs/payload-markdown-docs/blob/v1.1.0/docs/reference/migration.md).
