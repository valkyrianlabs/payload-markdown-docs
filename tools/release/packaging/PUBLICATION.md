# Native Package Publication

This document defines the protected publication boundary for the native
`pmdocs` package surfaces: npm, Debian/APT artifacts, Homebrew formula updates,
and dogfood docs sync.

## Release workflow contract

The canonical release workflow is `.github/workflows/release.yml`.

It always validates the root `VERSION` contract first:

```bash
python3 -m tools.release check
```

Protected publication requires a tag named `v<VERSION>`. Dry-run workflow
dispatches can run against a branch or SHA without publishing.

## Debian and Nexus

Debian publication is driven by:

- `RELEASE_PUBLISH_MODE` (`disabled` or `nexus`)
- `RELEASE_PUBLISH_REQUIRED` (`auto`, `true`, or `false`)
- `NEXUS_REPO_URL`
- `NEXUS_USER`
- `NEXUS_PASS`

The workflow builds and validates artifacts with:

```bash
python3 -m tools.release build-deb --output-dir release
python3 -m tools.release validate-release-artifacts --output-dir release --skip-changelog
```

Publication runs only in the protected path:

```bash
python3 -m tools.release publish-deb --output-dir release --require-enabled
```

When publication is not required, CI forces `--mode disabled --dry-run` so a
manual dry-run cannot upload to Nexus even if repository variables are already
configured for production.

`publish-deb` publishes all staged `*.deb` files from the release output
directory in deterministic order.

## Homebrew tap

Homebrew tap publication is driven by:

- `HOMEBREW_TAP_PUBLISH_MODE` (`disabled` or `tap`)
- `HOMEBREW_TAP_REPOSITORY` (for example `valkyrianlabs/homebrew-tap`)
- `HOMEBREW_TAP_BRANCH` (defaults to `main`)
- `HOMEBREW_TAP_TOKEN`

For protected tag releases, CI computes the GitHub tag archive SHA-256 and
stages the release formula with:

```bash
python3 -m tools.release prepare-homebrew-formula \
  --output-dir release \
  --archive-url "https://github.com/valkyrianlabs/payload-markdown-docs/archive/refs/tags/v<VERSION>.tar.gz" \
  --sha256 "<sha256>"
```

The workflow then runs a local formula install/test on macOS before copying
`release/homebrew/Formula/pmdocs.rb` into the configured tap repository.

## Docs sync

The docs publication step runs only after npm, Debian, and Homebrew publication
steps succeed. It uses GitHub OIDC and the configured `DOCS_SYNC_ENDPOINT`:

```bash
node ./dist/cli/index.js push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source payload-markdown-docs \
  --github-oidc \
  --publish
```

## Live APT validation follow-up

The current release workflow validates local `.deb` installation. A later
protected job should validate the published Nexus/APT repository from a clean
Debian or Ubuntu target:

1. Configure the production APT source and signing material.
2. Run `apt update`.
3. Install `pmdocs` from the configured repository.
4. Verify `pmdocs --version`, `pmdocs doctor`, `pmdocs skill install --dry-run`,
   and a fixture `pmdocs validate` run.
5. Publish a newer package revision and validate `apt upgrade pmdocs`.
