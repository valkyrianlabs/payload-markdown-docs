# Codex Context

## Repository

- Package/repository name: `@valkyrianlabs/payload-markdown-docs`
- Package metadata now uses the scoped package name and real description.
- Purpose: Git-backed Markdown documentation sync into Payload CMS.
- Current package state: v1 stabilization. The root package export is Payload plugin/config API only: `payloadMarkdownDocs()` plus public plugin config and block-install selection types. Frontend and route helpers live under `/next`; admin import-map support lives under `/admin`; optional block schemas and field helpers live under `/blocks` and `/fields`. Constants, routing internals, sync planning, hashing, frontmatter parsing, security helpers, manifest builders, and admin data loaders are internal implementation details. Enabled plugin mode injects docs groups, docs sets, generated docs, docs assets, sync-run, nonce, key, and trusted-owner collections and registers authenticated sync and asset endpoints. Disabled mode remains an exact no-op. Payload Admin shows docs sets and docs groups under `Docs`; generated docs, assets, sync runs, and nonces are internal/system collections by default. The npm CLI supports `validate`, `manifest`, `plan`, `keygen`, authenticated `push`, `push --publish`, GitHub OIDC push via `--github-oidc`, `install skill`, and `install routes`. `push` already means sync; there is no separate sync flag. Sync writes require `sync.allowWrites: true`. Publishing requires `sync.allowPublish: true` and a draft-enabled dedicated docs collection. Hard delete requires `sync.allowHardDelete: true`. Docs group routes derive from group slugs and `pageMode`; docs set routes derive from group nesting, docs set slug, and `routeMode`. Docs set `openGraph` metadata feeds the `/next` metadata helpers only and does not render a hero/banner. Raw AI-facing routes and static assets are served publicly when route files are installed, but sitemap inclusion is opt-in through `includeLlms`, `includeSkills`, or `includeAssets`.
- Current native CLI state: `cpp-cli` contains a Meson-built C++ `pmdocs` binary using CLI11, nlohmann-json, doctest, libcurl, and OpenSSL 3. Native tests pass for `doctor`, `skill install`, local `validate` / `manifest` / `plan`, `keygen`, and pre-network `push` behavior. The local docs commands match the npm CLI package-collection contract for docs, bundled skill assets, `llms.txt`, `llms-full.txt`, package summaries, manifests, and local plans; legacy AI export manifests are ignored rather than treated as v1 input. Native `keygen` now generates Ed25519 PEM or base64 keys and writes the same file names as the npm CLI. Native `push` now builds/validates the sync manifest, supports Ed25519 signing, base64/PEM/OpenSSH private-key input, GitHub OIDC bearer auth, dry-run mode, publish requests, delete behavior, strict route checks, JSON output, and libcurl transport. Live endpoint push/OIDC smoke coverage still needs a safe local or protected test endpoint before treating the native remote workflow as fully release-qualified.
- Current release tooling state: root `VERSION` is now the canonical release version. `python -m tools.release check`, `sync`, `set-version`, `set-release`, and `bump` enforce/sync `VERSION`, root `package.json`, root `meson.build`, `debian/changelog`, and `homebrew/Formula/pmdocs.rb`. The current synced version is `0.16.1`; Debian is `0.16.1-1`, and the Homebrew formula URL targets tag `v0.16.1` with a placeholder archive SHA until a protected tag release computes it. Debian build/validation is now Meson-driven for the native `pmdocs` package, Nexus publication is routed through `tools.release publish-deb`, and Homebrew formula staging is available through `tools.release prepare-homebrew-formula`. The release workflow now builds Debian/Homebrew package surfaces on the self-hosted Linux runner, gates Nexus/tap publication in the Production environment, publishes npm last from GitHub-hosted `ubuntu-latest` through npm trusted publishing, attaches release artifacts, and pushes docs only after package publication succeeds. Changelog schema names and AI prompt role text still retain imported Vaulthalla naming and should be cleaned separately. Do not run live AI/provider, Nexus, npm, GitHub, Homebrew, or docs sync publication from routine local tests; keep provider and publication behavior mocked or disabled unless explicitly validating a protected release path.

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
- `skills/payload-markdown-docs/codex/` and `skills/payload-markdown-docs/claude/` contain bundled agent skill artifacts served as sync assets and copied by the npm installer. The native `pmdocs skill install` command copies the Codex bundle from this tree into `.codex/skills/payload-markdown-docs/`.
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
- `cli/` contains the native C++ `pmdocs` implementation, Meson build, doctest suite, and optional npm parity harness.
- `debian/` contains the native `pmdocs` Debian package skeleton for Valkyrian Labs' Nexus-backed apt repository.
- `homebrew/` contains the native `pmdocs` Homebrew formula skeleton and tap notes.

Public package surface:

- Root: `payloadMarkdownDocs` and public plugin config/block selection types only.
- `/next`: route resolution, page/navbar/components, metadata, sitemap, nav/header helpers, and public asset route handler factory.
- `/admin`: `DocsSetManager` only.
- `/blocks`: optional Payload block schemas, field helpers, and related option types.
- `/fields`: reusable field helpers that support optional blocks.

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

Native CLI checks:

- `meson setup build --reconfigure`
- `meson compile -C build`
- `meson test -C build`

Optional native/npm parity checks:

- `meson setup build-parity -Dnative_cli_parity_tests=true`
- `meson compile -C build-parity`
- `meson test -C build-parity`

The parity check compares native local-command JSON with the npm CLI reference
for `validate`, `manifest`, and `plan`.

## Native CLI Completion Roadmap

### 1. Restore Native/NPM Parity For Local Commands

Status: implemented and verified for the current offline local-command scope.

Make `pmdocs validate`, `pmdocs manifest`, and `pmdocs plan` match the npm CLI
contract before adding remote mutation behavior.

Scope:

- Replace the native docs-only walker with a package collector equivalent to
  `src/cli/filesystem.ts`.
- Support npm CLI flags and defaults: positional `[docs-root]`, `--docs`,
  `--skills`, `--llms`, `--llms-full`, `--no-docs`, `--no-skills`,
  `--no-llms`, `--no-llms-full`, limits, source/repository/branch/commit, JSON,
  and pretty output.
- Emit manifest `files` and `assets` with matching paths, routes, content types,
  hashes, and optional package summary.
- Remove native legacy AI export manifest behavior; those manifests are
  migration artifacts only and must not be part of v1 native validation.
- Fix native help text and subcommand `--help` output so implemented commands are
  not described as planned.
- Update native tests and make the parity harness pass for `validate`,
  `manifest`, and `plan`.

Done when:

- `meson test -C build` passes.
- `meson test -C build-parity` passes for local commands.
- `pnpm test:int`, `pnpm lint`, and `pnpm build` still pass.

### 2. Port Keygen And Push Protocol Cleanly

Status: implementation landed for the native CLI command surface; remaining
work is safe endpoint parity/smoke coverage and any fixes found there.

Scope:

- Implemented OpenSSL EVP key generation, PEM/base64 output, PEM/base64/OpenSSH
  private-key read/sign, body SHA-256, canonical signing string construction,
  and Ed25519 signature headers matching `src/security`.
- Implemented npm `keygen` flags: `--format <pem|base64>`, `--out`, and
  `--force`.
- Implemented libcurl endpoint validation and JSON GET/POST transport with
  timeout, status code handling, user-agent, JSON response parsing, and response
  body capture.
- Implemented `push` flags: endpoint, source metadata, Ed25519 auth,
  GitHub OIDC, dry-run, publish, delete behavior, strict routes, JSON output,
  and package collection flags.
- Keep server authority intact: native `push` may request sync, publish, or hard
  delete behavior, but the server decides.
- Added focused C++ tests for hashing, canonical strings, PEM/base64 signing,
  keygen output/write behavior, endpoint validation, auth flag conflicts,
  malformed keys, strict route checks, and invalid GitHub OIDC request URL
  handling.
- Still needed: local/mock HTTP response tests for push success/failure output,
  plus protected endpoint smoke tests for Ed25519 dry-run, GitHub OIDC dry-run,
  and publish requests.

Done when:

- Native `keygen` output is verified against the existing Payload sync endpoint
  or an equivalent local test endpoint.
- Native `push --dry-run`, Ed25519 `push`, GitHub OIDC `push`, and
  `push --publish` match npm CLI behavior against a local/test endpoint.
- Parity coverage includes representative `keygen` and dry-run/push cases that
  do not require real production credentials.

### 3. Make Debian And Homebrew Installation Release-Grade

Finish native packaging after command parity is real.

Scope:

- Sync Meson project version, Debian changelog version, Homebrew formula URL,
  and package release tags with `package.json` / v1 release strategy.
- Confirm Meson install paths for binary and skill data:
  `/usr/bin/pmdocs` plus `/usr/share/pmdocs/skills/...` for Debian, and the
  equivalent Homebrew prefix/share layout.
- Add CI jobs that build and smoke-test `.deb` artifacts with
  `dpkg-buildpackage`, inspect package contents, install into a clean container
  or runner, and run `pmdocs doctor`, local validation, and skill install.
- Add release workflow steps to upload Debian artifacts to the configured Nexus
  apt repository. Keep Nexus URL, repository name, credentials, and optional GPG
  material in GitHub secrets/vars.
- Finalize the Homebrew formula and either publish to `valkyrianlabs/homebrew-tap`
  or document the first manual tap release. Formula builds should run native
  Meson tests only, not npm parity tests.

Done when:

- A tagged release publishes npm, Debian artifacts to Nexus apt, and a usable
  Homebrew formula/tap update from one release workflow or a documented two-step
  release process.
- Fresh Debian and macOS machines can install `pmdocs`, run `pmdocs doctor`, and
  execute validate/manifest/plan/push without Node.

### 4. Tighten Docs And Release Gates

Make the native CLI a supported v1 surface, not a side project.

Scope:

- Update `docs/reference/cli.md`, `cli/README.md`, `debian/README.md`,
  `homebrew/README.md`, and release docs once native behavior is final.
- Add a short native install page covering apt, Homebrew, and when to choose
  `pmdocs` over the npm CLI.
- Keep npm CLI docs as canonical until native parity is complete; after parity,
  document both CLIs as equivalent for shared commands.
- Remove or archive stale phase language once Phase 3 is complete.
- Treat failing native parity, Debian package smoke checks, or Homebrew formula
  smoke checks as release blockers.

Done when:

- v1 docs describe exactly what ships.
- CI blocks regressions in npm CLI, native CLI, packaging, and public API drift.

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
- The npm CLI may install local agent guidance with `install skill --agent codex` or `install skill --agent claude`. Native `pmdocs skill install` currently installs Codex guidance. Installers write Markdown files only; they must not fetch remote docs, run package managers, or mutate Payload.
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
