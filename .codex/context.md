# Codex Context

## Repository

- Package/repository name: `@valkyrianlabs/payload-markdown-docs`
- Package metadata now uses the scoped package name and real description.
- Purpose: Git-backed Markdown documentation sync into Payload CMS.
- Current state: Phase 8B docs groups, docs sets, and route reservations. The package exports `payloadMarkdownDocs()`, public config types, constants, collection builders, pure sync utilities for path normalization/frontmatter/hashing/manifest validation/planning, route helpers, and a request signing helper. Enabled plugin mode injects docs groups, docs sets, generated docs, sync-run, and nonce collections and registers a signed sync endpoint. Disabled mode remains an exact no-op. The CLI supports `validate`, `manifest`, `plan`, `keygen`, and signed `push`, including `push --publish`. Sync-mode writes to the dedicated generated docs collection require `sync.allowWrites: true`. Publishing requires `sync.allowPublish: true` and a draft-enabled dedicated docs collection. Hard delete requires `sync.allowHardDelete: true`. The endpoint now resolves `manifest.source.id` to a docs set when possible, uses the docs set route base, links synced docs to that docs set, and can perform docs-side route collision checks. Existing collection targets, block targets, frontend route rendering, GitHub OIDC, and agent skill installer do not exist yet.

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
- `src/routing/` contains route normalization, docs set route-base derivation, and route reservation/collision helpers.
- `src/sync/` contains pure manifest/path/frontmatter/hash/validation/planning utilities and unit tests.
- `src/cli/` contains the CLI runner, argument parser, filesystem walker, HTTP sender, output formatters, and command handlers for `validate`, `manifest`, `plan`, `keygen`, and `push`.
- `src/security/` contains canonical signing string, signed header, body hash, timestamp, Ed25519 signing/verification, and nonce replay helpers.
- `src/payload/` contains Payload Local API adapters for docs set source resolution, existing docs lookup, route collision checks, sync-run audit records, conflict detection, docs data/status mapping, and dedicated docs apply writes.
- `src/endpoints/` contains the signed sync endpoint factory and handler.
- `docs/dedicated-docs-workflow.md` documents the complete default dedicated docs collection workflow.
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

## Guardrails

- Avoid implementing all phases at once.
- Avoid package manager churn. Do not add, remove, update, or reinstall dependencies unless the phase explicitly requires it.
- Auth, sync, delete, archive, and publish behavior must be security-first.
- Future implementation should stay modular.
- Future implementation should prefer small phased passes with focused tests.
- Do not let the request body choose target collections, arbitrary fields, destructive behavior, or server authority.
- Dedicated docs collection mode should be the MVP default; existing collection and block target modes are later advanced features.
- The CLI may build, validate, print, plan, keygen, and push signed manifests to a configured endpoint. `push --publish` is only a request; the server decides whether publishing is allowed.
- The endpoint may write accepted nonces, sync-run audit records, and dedicated docs collection create/update/archive/draft/delete lifecycle records when explicitly enabled. It must not mutate existing collection targets, mutate block targets, or accept target fields from the request body.
- Publishing remains server-owned. Use `sync.allowPublish: true` plus `target.enableDrafts: true`.
- Hard delete remains server-owned and requires `sync.allowHardDelete: true`.
- Treat `examples/docs/` as a fixture/demo docs source, not as generated output.
- Keep CI examples on signed JSON manifest upload. Do not switch examples to ZIP upload or unsigned sync.
- Users should manage docs groups and docs sets, not hundreds or thousands of Payload Pages.
- Synced docs records are generated/internal records for routing, search, and sync correctness.
- Route bases are server-owned through docs sets or configured sources. Do not let request bodies choose route bases or target fields.
- Native frontend route rendering and central docs set management are future phases.
