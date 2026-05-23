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

Native Debian, Nexus, Homebrew formula staging, Homebrew tap publication, and
docs sync run on the self-hosted Linux release runner. npm publication runs
after Debian/Nexus and Homebrew tap publication succeed, using npm trusted
publishing from a GitHub-hosted runner. No `NPM_TOKEN` secret is required.

## npm trusted publishing

npm publication is driven by npm's trusted publisher configuration for this
repository/workflow, not a long-lived automation token. The `publish-npm` job
runs on `ubuntu-latest` with `id-token: write` available at workflow scope and
publishes the tarball produced by the earlier npm package job:

```bash
npm publish ./release/npm/<package>.tgz --access public
```

The publish job is intentionally ordered after the native package publication
jobs, so a Nexus or Homebrew tap failure cannot leave npm as the only published
package surface for the release.

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

The workflow validates formula syntax and native source-build parity before
copying `release/homebrew/Formula/pmdocs.rb` into the configured tap repository.
The tap update itself is a Git repository update and does not require a
GitHub-hosted runner. The current workflow stages and publishes the tap update
from the self-hosted Linux release runner. A Homebrew install smoke test should
run on a machine with Homebrew available, preferably a protected macOS runner,
before v1 if macOS install validation is required in CI.

## Docs sync

The docs publication step runs only after npm, Debian, and Homebrew publication
steps succeed. It installs the published native `pmdocs` package from the
Valkyrian Labs APT repository, validates the installed binary, then uses GitHub
OIDC and the configured `DOCS_SYNC_ENDPOINT`:

```bash
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://apt.valkyrianlabs.com/pubkey.asc \
  | gpg --dearmor \
  | sudo tee /etc/apt/keyrings/valkyrianlabs.gpg > /dev/null
sudo chmod 0644 /etc/apt/keyrings/valkyrianlabs.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/valkyrianlabs.gpg] https://apt.valkyrianlabs.com stable main" \
  | sudo tee /etc/apt/sources.list.d/valkyrianlabs.list > /dev/null
sudo apt-get update
sudo apt-get install -y pmdocs

pmdocs --version
pmdocs --help

pmdocs push ./docs \
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
