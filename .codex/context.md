# Codex Context

## Repository

- Package/repository name: `@valkyrianlabs/payload-markdown-docs`
- Package metadata now uses the scoped package name and real description.
- Purpose: Git-backed Markdown documentation sync into Payload CMS.
- Current state: v1 stabilization. The root package export is Payload plugin/config API only: `payloadMarkdownDocs()` plus public plugin config and block-install selection types. Frontend and route helpers live under `/next`; admin import-map support lives under `/admin`; optional block schemas and field helpers live under `/blocks`. Constants, routing internals, sync planning, hashing, frontmatter parsing, security helpers, manifest builders, and admin data loaders are internal implementation details. Enabled plugin mode injects docs groups, docs sets, generated docs, docs assets, sync-run, nonce, key, and trusted-owner collections and registers authenticated sync and asset endpoints. Disabled mode remains an exact no-op. Payload Admin shows docs sets and docs groups under `Docs`; generated docs, assets, sync runs, and nonces are internal/system collections by default. The CLI supports `validate`, `manifest`, `plan`, `keygen`, authenticated `push`, `push --publish`, GitHub OIDC push via `--github-oidc`, `install skill`, and `install routes`. `push` already means sync; there is no separate sync flag. Sync writes require `sync.allowWrites: true`. Publishing requires `sync.allowPublish: true` and a draft-enabled dedicated docs collection. Hard delete requires `sync.allowHardDelete: true`. Docs group routes derive from group slugs and `pageMode`; docs set routes derive from group nesting, docs set slug, and `routeMode`. Docs set `openGraph` metadata feeds the `/next` metadata helpers only and does not render a hero/banner. Raw AI-facing routes and static assets are served publicly when route files are installed, but sitemap inclusion is opt-in through `includeLlms`, `includeSkills`, or `includeAssets`.

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

- `src/index.ts` is the root public entrypoint. Keep it limited to `payloadMarkdownDocs()` and public plugin config/block selection types.
- `src/plugin.ts` contains collection option resolution, duplicate slug checks, collection wiring, endpoint wiring, admin component registration, and revalidation wiring.
- `src/types.ts` contains public plugin config types. Do not add sync/security/routing implementation types to the root public API.
- `src/constants.ts` contains internal default slugs, endpoint paths, and limits.
- `src/collections/` contains the docs groups, docs sets, generated docs, sync runs, and nonce collection builders.
- `src/admin/` contains the docs set manager UI field component, internal manager data helpers, types, tests, and the narrow `/admin` export surface.
- `src/blocks/` contains optional Payload block schemas and the `/blocks` export surface. Reusable block field helpers are exposed through `/blocks`, not root.
- `src/fields/` contains reusable block field helper internals used by `/blocks`.
- `src/routing/` contains internal route normalization, docs set route derivation, and route reservation/collision helpers.
- `src/sync/` contains internal manifest/path/frontmatter/hash/validation/planning utilities and unit tests. These are CLI/server implementation details, not root exports.
- `src/cli/` contains the CLI runner, argument parser, filesystem walker, HTTP sender, output formatters, and command handlers for `validate`, `manifest`, `plan`, `keygen`, and `push`. `push` supports Ed25519 signed requests and GitHub Actions OIDC bearer auth.
- `src/skills/` contains bundled Markdown templates for `payload-markdown-docs install skill --agent codex|claude`.
- `src/security/` contains canonical signing string, signed header, body hash, timestamp, Ed25519 signing/verification, GitHub OIDC JWT/JWKS verification, and nonce replay helpers.
- `src/payload/` contains Payload Local API adapters for docs set source resolution, existing docs lookup, route collision checks, sync-run audit records, conflict detection, docs data/status mapping, and dedicated docs apply writes.
- `src/endpoints/` contains the signed sync endpoint, endpoint helpers, and internal raw asset response helpers.
- `src/next/` contains the read-only native route adapter, metadata helper, sitemap helpers, nav/header helpers, page/navbar/components, public asset route handler factory, and `/next` export surface.
- `docs/` contains the plugin's dogfood documentation set. It includes getting started, concepts, configuration, workflow, frontend, admin, and reference pages with supported frontmatter and `payload-markdown` directive examples.
- `docs/dedicated-docs-workflow.md` remains a complete default dedicated docs collection workflow page inside the docs set.
- `examples/docs/` contains a small valid Markdown docs fixture for dogfooding CLI validation/manifest/plan behavior.
- `examples/github-actions/publish-docs.yml` contains a CI workflow example for pull-request dry-runs and main-branch publish syncs.
- `dev/` contains the local Payload app used for tests and manual development. It includes `dev/docs-fixtures/`, `dev/scripts/` keypair/seed/reset helpers, `dev/README.md`, and a frontend route adapter mount at `dev/app/(frontend)/[[...slug]]/page.tsx`.
- Dev Payload commands intentionally load `dev/.env` through `dev/helpers/loadDevEnv.ts`; do not require or document moving the dev env file to the repository root.
- `dev/int.spec.ts` contains skeleton tests and a dev app integration smoke test.
- `dev/e2e.spec.ts` contains Playwright e2e tests.
- `package.json`, `tsconfig.json`, `.swcrc`, `eslint.config.js`, `vitest.config.js`, and `playwright.config.js` control build/test tooling.

Public package surface:

- Root: `payloadMarkdownDocs` and public plugin config/block selection types only.
- `/next`: route resolution, page/navbar/components, metadata, sitemap, nav/header helpers, and public asset route handler factory.
- `/admin`: `DocsSetManager` only.
- `/blocks`: optional Payload block schemas, field helpers, and related option types.

Do not add public subpaths for sync/security/routing internals unless a deliberately small documented SDK is designed.

## Commands

Discovered scripts in `package.json`:

- `pnpm build`
- `pnpm build:swc`
- `pnpm build:types`
- `pnpm clean`
- `pnpm copyfiles`
- `pnpm dev`
- `pnpm dev:docs:keygen`
- `pnpm dev:docs:manifest`
- `pnpm dev:docs:plan`
- `pnpm dev:docs:reset`
- `pnpm dev:docs:seed`
- `pnpm dev:docs:validate`
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

Focused dev harness fixture tests can be run with:

- `pnpm exec vitest src/cli/dev-fixtures.spec.ts`

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
- Keep the default Payload Admin sidebar low-noise: docs sets and docs groups are user-facing under `Docs`; generated docs, sync runs, and nonce collections are internal/system by default.
- Route identity is server-owned and slug-derived through docs groups, docs set slugs, and docs set `routeMode`. Do not let request bodies choose routes, target collections, or target fields.
- The native route adapter is read-only. It must not create Pages, mutate Pages, or sync one Page per Markdown file.
- The Docs Set Admin Manager is currently a read-only overview. It should make generated docs understandable from the docs set edit view, but inline override editing should remain a separate, explicit future phase unless implemented carefully.
- The installed skill pack belongs to `payload-markdown-docs` and defaults to `.agents/skills/payload-markdown-docs/`; do not install into `.agents/skills/payload-markdown/` by default.
