<!--
vl-release staged release notes: the user-facing story of the NEXT release.
Maintained continuously while working; `vlr prepare` promotes it into the release notes
history (and the GitHub release) and resets this file to this template.

Format: the first line is "# <release title>" WITHOUT a version number (vlr adds it).
Everything after the title is the Markdown release body. Describe the resulting behavior
for users and operators; keep it representative of what actually ships.
-->
# payload-markdown-docs, MCP agent tools and skills that stay current

## `pnpm add payload-markdown-docs`

The plugin is now also published under the short name `payload-markdown-docs`:

```bash
pnpm add payload-markdown-docs payload-markdown @payloadcms/plugin-seo
```

`@valkyrianlabs/payload-markdown-docs` stays fully supported. Both names come from the same build and are released together at the same version, with identical files; the only differences are the package name and the name Payload's admin import map uses for the plugin's components, which follows whichever name you installed. Import from the name you installed (`payload-markdown-docs/next`, `payload-markdown-docs/migrations`, and so on), install only one of them, and run `payload generate:importmap` after switching.

payload-markdown works under either of its names too: `payload-markdown` (preferred) or `@valkyrianlabs/payload-markdown`. The docs content field uses the admin component of whichever is installed (detected from the components `payloadMarkdown()` registers, or from `node_modules`; set `payloadMarkdownPackage` to choose explicitly). `pmdocs install routes` writes route files that import the plugin under the name your app depends on.

## Let AI agents manage your docs over MCP

`payload-markdown-docs/mcp` plugs into Payload's official `@payloadcms/plugin-mcp`, next to payload-markdown's own MCP tools:

```ts
mcpPlugin(withPayloadMarkdownMcp(withPayloadMarkdownDocsMcp({ /* mcpPlugin options */ })))
```

Agents get 13 tools to manage the docs site: inspect docs sets, groups and docs (with sync drift), edit presentation fields (hero image, nav overrides, parent, publish date), publish and unpublish, list and inspect versions, roll back to a version Git produced, create and update docs sets and groups (titles, descriptions, SEO, routing, publishing security), manage sync access keys, and read the sync history. Every tool runs as the API key's user with Payload access control.

Git stays the source of truth for doc bodies and frontmatter. A guard on the plugin collections refuses any MCP write to a Git-owned field (`sync_owned`), whichever tool sends it, including payload-markdown's markdown write tools and plugin-mcp's generic collection tools; the sync endpoint, the admin UI and REST are unaffected. See the MCP Agent Tools docs page for setup and the full tool list.

## The payload-markdown skill is always installed

`pmdocs install skill` now always installs the `payload-markdown` skill next to the `payload-markdown-docs` skill. Previously Homebrew installs skipped it silently and Debian installs shipped an old copy. It is taken from your project's installed `payload-markdown` package when there is one, so the directive guidance matches the version your site renders with, and from the copy bundled with `pmdocs` otherwise. If neither is available the command fails instead of installing half the guidance. The `payload-markdown-docs` skill links straight into it for directives, styling, layout and the MCP content workflow.

## Skills that keep themselves current

Installed skills now record what they were installed from, and `pmdocs` notices when a newer one is available:

```bash
pmdocs skill check    # current, outdated, modified or missing per skill; exits 1 unless current
pmdocs skill update   # replaces outdated skills, keeping --docs-root and --package-manager
```

`pmdocs validate` and `pmdocs plan` print a reminder when the installed skill is stale, and the skill tells agents to run `pmdocs skill update` on their own. Skills you edited by hand are never replaced without `--force`. Re-running `pmdocs install skill` over an unedited install no longer needs `--force`.

## Docs routes and the docs nav follow docs set and group changes

Changing a docs set's group, slug or route mode, or a group's slug or parent (or deleting a group), now moves the generated docs and their assets to the new routes immediately, in the same save, instead of leaving them on the old paths until the next sync. Published docs and their drafts move together, the old and new paths are revalidated, and a change that would put docs onto routes another docs set already serves is rejected with nothing saved. Routes that are already stale from earlier changes are repaired by saving the published docs set, or all at once with `repairDocsRoutes({ payload })` from `payload-markdown-docs/migrations`.

The docs nav (`getPayloadMarkdownDocsNavItems`, the header adapters and `PayloadMarkdownDocsNavbar`) is now cached under the `payload-markdown-docs:nav` tag (exported as `PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG`), and the plugin expires it whenever a docs set or group changes and after every sync. Statically prerendered pages that show the docs nav in their header no longer keep serving an outdated nav. Sync and admin revalidation now expire cache tags immediately (`{ expire: 0 }`) rather than serving the stale entry once more.

## Releases

Releases are built and published with vl-release: the Debian package, the Homebrew formula (now built from a release source archive that carries both skills), both npm names and the GitHub release come from one validated build, and a failed release can simply be re-run.
