# Codex Context

## Repository

- Package/repository name: `@valkyrianlabs/payload-markdown-docs`
- Current package metadata still reflects template setup in `package.json`; align naming and description during Phase 1.
- Purpose: Git-backed Markdown documentation sync into Payload CMS.
- Current state: Payload plugin template is up and running with sample plugin behavior, sample endpoint, sample dashboard components, integration tests, and a dev Payload app.

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

Current template structure:

- `src/index.ts` is the plugin entrypoint.
- `src/endpoints/` contains custom endpoint handlers.
- `src/components/` and `src/exports/` contain sample admin UI exports.
- `dev/` contains the local Payload app used for tests and manual development.
- `dev/int.spec.ts` contains integration tests.
- `dev/e2e.spec.ts` contains Playwright e2e tests.
- `package.json`, `tsconfig.json`, `.swcrc`, `eslint.config.js`, `vitest.config.js`, and `playwright.config.js` control build/test tooling.

Expected future source organization:

- `src/index.ts` should export `payloadMarkdownDocs()` and public config types.
- `src/types.ts` should hold public and internal config types once they grow.
- `src/plugin.ts` can hold the plugin factory when `src/index.ts` becomes too busy.
- `src/collections/` can hold optional docs, sync run, and nonce collection builders.
- `src/endpoints/` can hold the sync endpoint and endpoint helpers.
- `src/sync/` can hold manifest validation, planning, hashing, and Payload upsert logic.
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

For Phase 0, prefer lightweight validation only: `pnpm lint`, `pnpm build`, and `pnpm test:int`. Avoid `pnpm test` unless deliberately running Playwright e2e.

## Guardrails

- Avoid implementing all phases at once.
- Avoid package manager churn. Do not add, remove, update, or reinstall dependencies unless the phase explicitly requires it.
- Auth, sync, delete, archive, and publish behavior must be security-first.
- Future implementation should stay modular.
- Future implementation should prefer small phased passes with focused tests.
- Do not let the request body choose target collections, arbitrary fields, destructive behavior, or server authority.
- Dedicated docs collection mode should be the MVP default; existing collection and block target modes are later advanced features.
