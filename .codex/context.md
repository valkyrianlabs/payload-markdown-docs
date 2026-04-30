# Codex Context

## Repository

- Package/repository name: `@valkyrianlabs/payload-markdown-docs`
- Package metadata now uses the scoped package name and real description.
- Purpose: Git-backed Markdown documentation sync into Payload CMS.
- Current state: Phase 3 validation/planning core. The package exports `payloadMarkdownDocs()`, public config types, constants, collection builders, and pure sync utilities for path normalization, frontmatter parsing, hashing, manifest building/validation, and dry sync planning. Enabled plugin mode injects the dedicated docs infrastructure collections; disabled mode remains an exact no-op. No sync endpoint, auth verification, CLI, or Payload upsert engine exists yet.

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
- `src/collections/` contains the docs, sync runs, and nonce collection builders.
- `src/sync/` contains pure manifest/path/frontmatter/hash/validation/planning utilities and unit tests.
- `dev/` contains the local Payload app used for tests and manual development.
- `dev/int.spec.ts` contains skeleton tests and a dev app integration smoke test.
- `dev/e2e.spec.ts` contains Playwright e2e tests.
- `package.json`, `tsconfig.json`, `.swcrc`, `eslint.config.js`, `vitest.config.js`, and `playwright.config.js` control build/test tooling.

Expected future source organization:

- Keep `src/index.ts`, `src/plugin.ts`, `src/types.ts`, `src/constants.ts`, `src/collections/`, and `src/sync/` as the Phase 3 storage and validation skeleton.
- `src/endpoints/` can hold the sync endpoint and endpoint helpers.
- Future Payload upsert logic should live outside the pure `src/sync/` validation core or in a clearly separated module.
- `src/security/` can hold signing verification, canonical request logic, and nonce abstractions.
- `src/cli/` can be introduced later only when the CLI phase starts.

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

## Guardrails

- Avoid implementing all phases at once.
- Avoid package manager churn. Do not add, remove, update, or reinstall dependencies unless the phase explicitly requires it.
- Auth, sync, delete, archive, and publish behavior must be security-first.
- Future implementation should stay modular.
- Future implementation should prefer small phased passes with focused tests.
- Do not let the request body choose target collections, arbitrary fields, destructive behavior, or server authority.
- Dedicated docs collection mode should be the MVP default; existing collection and block target modes are later advanced features.
