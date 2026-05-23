# Payload Markdown Docs Roadmap

This is the working roadmap for shipping `payload-markdown-docs` v1 with a
native `pmdocs` CLI and release automation for npm, Debian/APT, and Homebrew.
The npm package is now the Payload plugin/runtime package only; the native
`pmdocs` binary is the authoritative CLI.

## Current State

- Package state: the Payload plugin/runtime, docs sync endpoint, docs assets,
  Next route helpers, and skill bundles are in v1 stabilization. The Node/npm
  CLI surface has been removed before v1.
- Branch state: `cpp-cli` has merged `main` and contains the native CLI work
  plus imported Python release tooling under `tools/release`.
- Native CLI state: `pmdocs doctor`, `pmdocs skill install`, `pmdocs validate`,
  `pmdocs manifest`, `pmdocs plan`, `pmdocs keygen`, and `pmdocs push` are
  implemented.
- Local-command behavior: native `validate` / `manifest` / `plan` implement the
  docs-plus-assets package shape for docs, skill assets, `llms.txt`,
  `llms-full.txt`, package summaries, manifests, and plans.
- Remote-command port: native `keygen` generates Ed25519 PEM/base64 keys and
  writes the npm-compatible key file names. Native `push` builds and validates
  the sync manifest, supports Ed25519 signing, base64/PEM/OpenSSH private keys,
  GitHub OIDC bearer auth, dry-run, publish requests, delete behavior, strict
  route checks, JSON output, and libcurl transport.
- Verified local checks after the remote-command port include `meson compile -C
  build`, `meson test -C build`, safe direct `keygen` / `push --help` checks,
  and `pnpm test:int`. The native doctest suite now includes local HTTP endpoint tests
  for OIDC bearer push, `--publish`, JSON output, JSON server errors, and
  non-JSON server errors.
- Remaining native CLI gap: run protected smoke tests for Ed25519 dry-run,
  GitHub OIDC dry-run, and publish requests against the real endpoint path.
- Release packaging: Debian build/validation is adapted to the native `pmdocs`
  Meson package. Nexus publication is wired through `tools.release publish-deb`.
  Homebrew formula staging is wired through
  `tools.release prepare-homebrew-formula`. Native Debian/Nexus/Homebrew work
  runs on the self-hosted Linux release runner, and npm trusted publishing for
  the plugin package runs last on GitHub-hosted `ubuntu-latest`. npm publication reads the scoped
  package name from `package.json`, optionally verifies it against
  `NPM_PACKAGE_NAME`, and checks the tarball package identity before publish.
- Version state: Option B is active. Root `VERSION` is canonical and
  `python -m tools.release check`, `sync`, `set-version`, `set-release`, and
  `bump` enforce/sync root `package.json`, root `meson.build`,
  `debian/changelog`, and `homebrew/Formula/pmdocs.rb`. The current synced
  version is `0.17.0`.

## Safety Rules

- Do not run live AI/provider release commands in normal tests. Unit tests must
  mock provider construction and clear or override provider token environment.
- Do not run live Nexus, npm, GitHub, Homebrew, or docs sync publication from
  local tests.
- Keep live APT validation as a separate explicit manual or protected CI job
  using purpose-scoped credentials.
- Keep server authority intact: CLI `push` can request sync, publish, or hard
  delete behavior, but Payload decides what is allowed.

## Big Tasks

### 1. Finish Native Push Qualification

Status: local endpoint coverage is complete; remaining work is protected release
qualification against the real endpoint path.

Scope:

- Added mock/local HTTP response tests for native `push` success, server errors,
  non-JSON errors, JSON output, and publish requests.
- Add protected smoke coverage against a local/test Payload endpoint for:
  Ed25519 dry-run, GitHub OIDC dry-run, signed sync, and `push --publish`.
- Confirm native `keygen` output is accepted by the existing Payload key config
  or equivalent endpoint fixture.
- Keep all routine tests credential-free and offline.

Done when:

- Native `push --dry-run`, signed push, GitHub OIDC push, and `push --publish`
  match the v1 sync contract against local/test endpoints.
- Parity coverage includes representative remote workflow cases without
  production credentials.

### 2. Adapt `tools.release` To This Plugin

Goal: make release tooling understand this repository instead of the imported
project it came from.

Status: versioning integration and repository retargeting are active for Option
B. Root `VERSION` is canonical, version checks include npm/Meson/Debian/Homebrew,
schema/prompt/request identifiers are renamed, categories are retargeted, and
the release tests pass offline.

Scope:

- Keep root `VERSION` as canonical and require release version changes through
  `python -m tools.release bump <major|minor|patch>`, `set-version`, or the
  `set-release` alias.
- Maintain release path discovery for root `package.json`, `meson.build`,
  `debian/changelog`, and `homebrew/Formula/pmdocs.rb`.
- Keep the Homebrew formula URL synced to the release tag and reset the formula
  `sha256` to `TODO_REPLACE_WITH_RELEASE_ARCHIVE_SHA256` when the version
  changes.
- Renamed CLI descriptions, schema identifiers, prompt roles, and request IDs to
  `payload-markdown-docs` / `pmdocs`.
- Retargeted changelog path inference to plugin, native CLI, sync,
  frontend, admin, docs assets, docs, Debian, Homebrew, release tooling, and
  tests. Legacy cached context category names are only retained as ordering
  aliases for old artifacts/tests and are not emitted by the current path
  categorizer.
- Convert Debian tooling from the imported web/service packaging model to Meson-driven
  `pmdocs` packaging. Current status: done for build, artifact validation,
  local install smoke checks, and Nexus publication command wiring.
- Add Homebrew tooling for formula version/URL/checksum updates, syntax
  validation, smoke tests where available, and dry-run-first tap publication.
  Current status: done for checksum staging and workflow tap publication gates.
- Keep release tests offline by default with provider and publication mocks.

Done when:

- `python -m tools.release check` succeeds for this repo shape. Current status:
  done.
- Version sync dry-runs show root npm, Meson, Debian, and Homebrew changes
  without writing files. Current status: done for versioning.
- Release tooling unit tests pass with real provider and publication calls
  blocked. Current status: done.

### 3. Finish Debian/Nexus And Homebrew Publication

Goal: make native installation real on Debian/Ubuntu and macOS.

Scope:

- Ensure Meson install paths are correct:
  `/usr/bin/pmdocs` and `/usr/share/pmdocs/skills/payload-markdown-docs`.
- Build `.deb` artifacts with `dpkg-buildpackage` and validate package contents
  with `dpkg-deb` without requiring a live APT repo.
- Publish Debian artifacts to Nexus only when `RELEASE_PUBLISH_MODE=nexus` and
  required secrets are present.
- Stage release Homebrew formula artifacts with a real GitHub tag archive URL
  and SHA-256 only in protected publication mode.
- Update the configured Homebrew tap only when
  `HOMEBREW_TAP_PUBLISH_MODE=tap`, `HOMEBREW_TAP_REPOSITORY`, and
  `HOMEBREW_TAP_TOKEN` are configured.
- Add protected live APT validation: configure test APT source, install
  `pmdocs`, run `pmdocs doctor`, validate a docs package, and test upgrade
  behavior.
- Generate or update the Homebrew formula for tagged releases and validate
  install/test behavior on macOS CI.

Current status:

- Done: release tooling builds native `.deb` artifacts, validates package
  contents, performs local install smoke checks in CI, stages Homebrew formulas,
  and has protected Nexus/tap publication jobs. npm publish is ordered after
  Debian/Nexus and Homebrew tap success and uses trusted publishing, not
  `NPM_TOKEN`.
- Remaining: run one protected dry-run on a tag, add Homebrew install smoke
  coverage on a runner with Homebrew available, then add live APT repository
  validation after Nexus metadata/signing details are confirmed.

Done when:

- Fresh Debian/Ubuntu and macOS machines can install `pmdocs` and run
  `doctor`, `skill install`, `validate`, `manifest`, `plan`, and `push`.
- Publication jobs fail closed when credentials or expected artifacts are
  missing.

### 4. Wire The Release Workflow

Goal: make a tagged v1 release reproducible and low-touch.

Scope:

- Keep npm publication checks from the existing release workflow. Current
  status: done, including tarball artifact upload, package-name verification
  from `package.json` / optional `NPM_PACKAGE_NAME`, and protected trusted npm
  publish after native package publication succeeds.
- Add native build/test jobs for Linux and macOS. Current status: done.
- Add release-tooling checks with live providers and publication disabled.
  Current status: done for offline release-tooling unit tests.
- Build and validate Debian artifacts. Current status: done.
- Publish Debian artifacts to Nexus in a protected environment. Current status:
  workflow job added; Production environment has been configured by the repo
  owner.
- Update or publish the Homebrew tap formula in a dry-run-first flow. Current
  status: workflow job added; tap publication still needs first protected run.
- Publish docs only after package publication succeeds. Current status: done.

Done when:

- Release workflow can run a full dry-run path without external publication.
- Protected publication path publishes npm, Debian/APT, Homebrew tap update, and
  docs with clear failure boundaries.

### 5. Tighten Docs And Release Gates

Goal: make the native CLI and release process supported v1 surfaces.

Scope:

- Update `docs/reference/cli.md`, `cli/README.md`, `debian/README.md`,
  `homebrew/README.md`, and release docs once native behavior is final.
- Add native install docs covering apt and Homebrew.
- Document that the npm package installs the Payload plugin/runtime and native
  `pmdocs` is the supported CLI.
- Remove stale imported-project language from release tooling docs and tests.
- Treat failing native parity, Debian package smoke checks, Homebrew formula
  smoke checks, or release-tooling offline tests as release blockers.

Done when:

- v1 docs describe exactly what ships.
- CI blocks regressions in native CLI, plugin package, packaging, release
  tooling, and public API drift.
