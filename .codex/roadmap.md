# Payload Markdown Docs Roadmap

This is the working roadmap for shipping `payload-markdown-docs` v1 with a
native `pmdocs` CLI and release automation for npm, Debian/APT, and Homebrew.
The npm CLI remains the reference implementation until native command parity is
proven end to end.

## Current State

- Package state: the Payload plugin, npm CLI, docs sync endpoint, docs assets,
  Next route helpers, and skill bundles are in v1 stabilization.
- Branch state: `cpp-cli` has merged `main` and contains the native CLI work
  plus imported Python release tooling under `tools/release`.
- Native CLI state: `pmdocs doctor`, `pmdocs skill install`, `pmdocs validate`,
  `pmdocs manifest`, `pmdocs plan`, `pmdocs keygen`, and `pmdocs push` are
  implemented.
- Local-command parity: native `validate` / `manifest` / `plan` match the npm
  CLI docs-plus-assets package shape for docs, skill assets, `llms.txt`,
  `llms-full.txt`, package summaries, manifests, and plans.
- Remote-command port: native `keygen` generates Ed25519 PEM/base64 keys and
  writes the npm-compatible key file names. Native `push` builds and validates
  the sync manifest, supports Ed25519 signing, base64/PEM/OpenSSH private keys,
  GitHub OIDC bearer auth, dry-run, publish requests, delete behavior, strict
  route checks, JSON output, and libcurl transport.
- Verified local checks after the remote-command port: `git diff --check`,
  `meson compile -C build`, `meson test -C build`, direct phase-2 parity,
  `meson test -C build-parity`, safe direct `keygen` / `push --help` checks,
  and `pnpm test:int`.
- Remaining native CLI gap: add safe mock/local endpoint tests and protected
  smoke tests for Ed25519 dry-run, GitHub OIDC dry-run, and publish requests.
- Release packaging: Debian build/validation is adapted to the native `pmdocs`
  Meson package. Nexus publication is wired through `tools.release publish-deb`.
  Homebrew formula staging is wired through
  `tools.release prepare-homebrew-formula`. Protected workflow publication still
  needs the Production environment variables/secrets configured before live use.
- Version state: Option B is active. Root `VERSION` is canonical and
  `python -m tools.release check`, `sync`, `set-version`, `set-release`, and
  `bump` enforce/sync root `package.json`, root `meson.build`,
  `debian/changelog`, and `homebrew/Formula/pmdocs.rb`. The current synced
  version is `0.16.1`.

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

Status: initial native implementation is complete; remaining work is endpoint
coverage and release qualification.

Scope:

- Add mock/local HTTP response tests for native `push` success, server errors,
  non-JSON errors, JSON output, and route warnings.
- Add protected smoke coverage against a local/test Payload endpoint for:
  Ed25519 dry-run, GitHub OIDC dry-run, signed sync, and `push --publish`.
- Confirm native `keygen` output is accepted by the existing Payload key config
  or equivalent endpoint fixture.
- Keep all routine tests credential-free and offline.

Done when:

- Native `push --dry-run`, signed push, GitHub OIDC push, and `push --publish`
  match npm CLI behavior against local/test endpoints.
- Parity coverage includes representative remote workflow cases without
  production credentials.

### 2. Adapt `tools.release` To This Plugin

Goal: make release tooling understand this repository instead of Vaulthalla.

Status: versioning integration is active for Option B. Root `VERSION` is now
canonical, version checks include npm/Meson/Debian/Homebrew, and the current
repo state passes `python -m tools.release check`.

Scope:

- Keep root `VERSION` as canonical and require release version changes through
  `python -m tools.release bump <major|minor|patch>`, `set-version`, or the
  `set-release` alias.
- Maintain release path discovery for root `package.json`, `meson.build`,
  `debian/changelog`, and `homebrew/Formula/pmdocs.rb`.
- Keep the Homebrew formula URL synced to the release tag and reset the formula
  `sha256` to `TODO_REPLACE_WITH_RELEASE_ARCHIVE_SHA256` when the version
  changes.
- Rename CLI descriptions, schema identifiers, prompt roles, and request IDs to
  `payload-markdown-docs` / `pmdocs`.
- Retarget changelog categories to plugin, npm CLI, native CLI, sync, frontend,
  admin, docs assets, docs, Debian, Homebrew, release tooling, and tests.
- Convert Debian tooling from Vaulthalla web/service packaging to Meson-driven
  `pmdocs` packaging. Current status: done for build, artifact validation,
  local install smoke checks, and Nexus publication command wiring.
- Add Homebrew tooling for formula version/URL/checksum updates, syntax
  validation, smoke tests where available, and dry-run-first tap publication.
  Current status: done for checksum staging and workflow tap publication gates.
- Keep release tests offline by default with provider and publication mocks.

Done when:

- `python -m tools.release check` succeeds for this repo shape. Current status:
  done for versioning.
- Version sync dry-runs show root npm, Meson, Debian, and Homebrew changes
  without writing files. Current status: done for versioning.
- Release tooling unit tests pass with real provider and publication calls
  blocked. Current status: packaging tests are retargeted to `pmdocs`; changelog
  schema/prompt naming still needs a separate cleanup pass.

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
  and has protected Nexus/tap publication jobs.
- Remaining: configure Production secrets/vars, run one protected dry-run on a
  tag, then add live APT repository validation after Nexus metadata/signing
  details are confirmed.

Done when:

- Fresh Debian/Ubuntu and macOS machines can install `pmdocs` and run
  `doctor`, `skill install`, `validate`, `manifest`, `plan`, and `push`.
- Publication jobs fail closed when credentials or expected artifacts are
  missing.

### 4. Wire The Release Workflow

Goal: make a tagged v1 release reproducible and low-touch.

Scope:

- Keep npm publication checks from the existing release workflow. Current
  status: done, including tarball artifact upload and protected npm publish.
- Add native build/test jobs for Linux and macOS. Current status: done.
- Add release-tooling checks with live providers and publication disabled.
  Current status: done for offline release-tooling unit tests.
- Build and validate Debian artifacts. Current status: done.
- Publish Debian artifacts to Nexus in a protected environment. Current status:
  workflow job added; Production variables/secrets required.
- Update or publish the Homebrew tap formula in a dry-run-first flow. Current
  status: workflow job added; tap variables/token required.
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
- Document when to use npm CLI vs native `pmdocs`; after command parity, mark
  shared commands as equivalent.
- Remove stale Vaulthalla language from imported release tooling docs and tests.
- Treat failing native parity, Debian package smoke checks, Homebrew formula
  smoke checks, or release-tooling offline tests as release blockers.

Done when:

- v1 docs describe exactly what ships.
- CI blocks regressions in npm CLI, native CLI, packaging, release tooling, and
  public API drift.
