# Codex Context

## Repository

- Package/repository name: `@valkyrianlabs/payload-markdown-docs`
- Package metadata now uses the scoped package name and real description.
- Purpose: Git-backed Markdown documentation sync into Payload CMS.
- Current state: Phase 11 GitHub OIDC Auth Mode. The package exports `payloadMarkdownDocs()`, public config types, constants, collection builders, pure sync utilities for path normalization/frontmatter/hashing/manifest validation/planning, route helpers, a request signing helper, a `/next` read-only route adapter export, and an `/admin` export for the docs set manager component. Enabled plugin mode injects docs groups, docs sets, generated docs, sync-run, and nonce collections and registers an authenticated sync endpoint. Disabled mode remains an exact no-op. The CLI supports `validate`, `manifest`, `plan`, `keygen`, authenticated `push` including `push --publish`, GitHub OIDC push via `--github-oidc`, and `install skill --codex` / `install ai-skill --codex`. Sync-mode writes to the dedicated generated docs collection require `sync.allowWrites: true`. Publishing requires `sync.allowPublish: true` and a draft-enabled dedicated docs collection. Hard delete requires `sync.allowHardDelete: true`. The endpoint supports Ed25519 signed requests and GitHub Actions OIDC bearer auth with repository/ref allowlists, body-hash checks, and `jti` replay protection. The endpoint resolves `manifest.source.id` to a docs set when possible, uses the docs set route base, links synced docs to that docs set, and can perform docs-side route collision checks. The `/next` export can resolve docs routes, generate sidebar data, generate metadata, and render a minimal docs page via `@valkyrianlabs/payload-markdown/server`. The docs set edit view includes a read-only Generated Docs overview with summary counts, source-path tree, override summaries, and generated-doc admin links. The root `docs/` tree is real dogfood documentation with valid frontmatter, root-relative internal links, and `payload-markdown` directive examples. The CLI can install a bundled Codex skill pack into `.agents/skills/payload-markdown-docs/`. Existing collection targets, block targets, and inline admin override editing do not exist yet.

## Product Direction

`payload-markdown-docs` should let a project keep documentation in a repo-local `docs/` tree, have developers or AI agents maintain Markdown files directly, and publish signed documentation updates into Payload CMS.

The CI/client sends docs content. The Payload plugin/server decides where it may go.

The plugin should stay focused on Git-backed Markdown docs to Payload, powered by `payload-markdown`. It must not become a generic arbitrary file upload plugin.

## Relationship to `@valkyrianlabs/payload-markdown`

This package should depend conceptually on `@valkyrianlabs/payload-markdown`.

`payload-markdown` owns:

- Markdown field/block support
- Markdown rendering
- docs-friendly directives such as callout, details, toc, steps, and cards
- directive themes
- CodeMirror authoring UX

`payload-markdown-docs` should own:

- docs source ingestion
- manifest validation
- signed upload endpoint
- docs collection or configured target collection integration
- create/update/archive/publish workflow
- CI/local CLI workflow
- agent-friendly docs maintenance model

Do not duplicate the Markdown renderer. Store synced Markdown in a field or block provided by `payload-markdown`.

## Expected Source Tree Conventions

Current source structure:

- `src/index.ts` is the public entrypoint and re-exports the plugin factory, constants, and config types.
- `src/plugin.ts` contains collection option resolution, duplicate slug checks, and Phase 2 collection wiring.
- `src/types.ts` contains public config types.
- `src/constants.ts` contains default slugs, default endpoint path, and default limits.
- `src/collections/` contains the docs groups, docs sets, generated docs, sync runs, and nonce collection builders.
- `src/admin/` contains the docs set manager UI field component, pure manager data helpers, types, tests, and `/admin` export surface.
- `src/routing/` contains route normalization, docs set route-base derivation, and route reservation/collision helpers.
- `src/sync/` contains pure manifest/path/frontmatter/hash/validation/planning utilities and unit tests.
- `src/cli/` contains the CLI runner, argument parser, filesystem walker, HTTP sender, output formatters, and command handlers for `validate`, `manifest`, `plan`, `keygen`, and `push`. `push` supports Ed25519 signed requests and GitHub Actions OIDC bearer auth.
- `src/skills/codex/` contains bundled Markdown templates for `payload-markdown-docs install skill --codex`.
- `src/security/` contains canonical signing string, signed header, body hash, timestamp, Ed25519 signing/verification, GitHub OIDC JWT/JWKS verification, and nonce replay helpers.
- `src/payload/` contains Payload Local API adapters for docs set source resolution, existing docs lookup, route collision checks, sync-run audit records, conflict detection, docs data/status mapping, and dedicated docs apply writes.
- `src/endpoints/` contains the signed sync endpoint factory and handler.
- `src/next/` contains the read-only native route adapter, sidebar helper, metadata helper, minimal server page component, and `/next` export surface.
- `docs/` contains the plugin's dogfood documentation set. It includes getting started, concepts, configuration, workflow, frontend, admin, and reference pages with supported frontmatter and `payload-markdown` directive examples.
- `docs/dedicated-docs-workflow.md` remains a complete default dedicated docs collection workflow page inside the docs set.
- `examples/docs/` contains a small valid Markdown docs fixture for dogfooding CLI validation/manifest/plan behavior.
- `examples/github-actions/publish-docs.yml` contains a CI workflow example for pull-request dry-runs and main-branch publish syncs.
- `dev/` contains the local Payload app used for tests and manual development.
- `dev/int.spec.ts` contains skeleton tests and a dev app integration smoke test.
- `dev/e2e.spec.ts` contains Playwright e2e tests.
- `package.json`, `tsconfig.json`, `.swcrc`, `eslint.config.js`, `vitest.config.js`, and `playwright.config.js` control build/test tooling.

Expected future source organization:

- Keep `src/index.ts`, `src/plugin.ts`, `src/types.ts`, `src/constants.ts`, `src/collections/`, and `src/sync/` as the Phase 3 storage and validation skeleton.
- `src/endpoints/` can hold the sync endpoint and endpoint helpers.
- Future Payload upsert logic should live outside the pure `src/sync/` validation core or in a clearly separated module.
- `src/security/` holds signing, verification, canonical request logic, and nonce helpers.
- `src/cli/` may build, validate, plan, keygen, and push signed manifest requests. Keep network behavior scoped to explicit CLI upload commands.
- `src/next/` should stay read-only. It may resolve/render docs routes and sidebar/metadata data, but must not mutate Pages or docs records.

## Commands

Discovered scripts in `package.json`:

- `pnpm build`
- `pnpm build:swc`
- `pnpm build:types`
- `pnpm clean`
- `pnpm copyfiles`
- `pnpm dev`
- `pnpm dev:generate-importmap`
- `pnpm dev:generate-types`
- `pnpm dev:payload`
- `pnpm generate:importmap`
- `pnpm generate:types`
- `pnpm lint`
- `pnpm lint:fix`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm test:int`

For current skeleton validation, prefer `pnpm test:int`, `pnpm lint`, and `pnpm build`. `pnpm test:int` is configured to exclude Playwright e2e specs; `pnpm test:e2e` remains the Playwright-only command.

Focused CLI tests can be run with:

- `pnpm exec vitest src/cli`

Focused endpoint/security tests can be run with:

- `pnpm exec vitest src/security src/endpoints`

Focused payload apply/endpoint tests can be run with:

- `pnpm exec vitest src/payload src/endpoints`

Focused signing/CLI tests can be run with:

- `pnpm exec vitest src/security src/cli`

Focused lifecycle tests can be run with:

- `pnpm exec vitest src/payload src/endpoints src/cli`

Focused docs/workflow example tests can be run with:

- `pnpm exec vitest src/cli`

Focused route adapter tests can be run with:

- `pnpm exec vitest src/next src/payload src/routing`

Focused docs set admin manager tests can be run with:

- `pnpm exec vitest src/admin dev/int.spec.ts`

Focused docs asset tests can be run with:

- `pnpm exec vitest src/cli/docs-assets.spec.ts`

Focused skill installer tests can be run with:

- `pnpm exec vitest src/cli/skill-install.spec.ts`

## Guardrails

- Avoid implementing all phases at once.
- Avoid package manager churn. Do not add, remove, update, or reinstall dependencies unless the phase explicitly requires it.
- Auth, sync, delete, archive, and publish behavior must be security-first.
- Future implementation should stay modular.
- Future implementation should prefer small phased passes with focused tests.
- Do not let the request body choose target collections, arbitrary fields, destructive behavior, or server authority.
- Dedicated docs collection mode should be the MVP default; existing collection and block target modes are later advanced features.
- The CLI may build, validate, print, plan, keygen, and push signed manifests to a configured endpoint. `push --publish` is only a request; the server decides whether publishing is allowed.
- GitHub OIDC push requires `--github-oidc`, a configured audience, and GitHub Actions `id-token: write`. The server must keep repository/ref allowlists narrow, and pull request events are denied by default.
- The CLI may install local agent guidance with `install skill --codex`. This writes Markdown files only; it must not fetch remote docs, run package managers, or mutate Payload.
- The endpoint may write accepted nonces, sync-run audit records, and dedicated docs collection create/update/archive/draft/delete lifecycle records when explicitly enabled. It must not mutate existing collection targets, mutate block targets, or accept target fields from the request body.
- Publishing remains server-owned. Use `sync.allowPublish: true` plus `target.enableDrafts: true`.
- Hard delete remains server-owned and requires `sync.allowHardDelete: true`.
- Treat `examples/docs/` as a fixture/demo docs source, not as generated output.
- Keep CI examples on authenticated JSON manifest upload. Do not switch examples to ZIP upload or unsigned sync.
- Treat `docs/` as real dogfood docs content. Keep frontmatter within the supported subset, keep internal docs links root-relative, and avoid documenting unsupported features as implemented.
- Users should manage docs groups and docs sets, not hundreds or thousands of Payload Pages.
- Synced docs records are generated/internal records for routing, search, and sync correctness.
- Route bases are server-owned through docs sets or configured sources. Do not let request bodies choose route bases or target fields.
- The native route adapter is read-only. It must not create Pages, mutate Pages, or sync one Page per Markdown file.
- The Docs Set Admin Manager is currently a read-only overview. It should make generated docs understandable from the docs set edit view, but inline override editing should remain a separate, explicit future phase unless implemented carefully.
- The installed skill pack belongs to `payload-markdown-docs` and defaults to `.agents/skills/payload-markdown-docs/`; do not install into `.agents/skills/payload-markdown/` by default.
