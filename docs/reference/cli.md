---
title: CLI Reference
navTitle: CLI
description: Commands and flags for the native pmdocs CLI.
order: 600
status: published
tags:
  - reference
  - cli
---

# CLI Reference

The supported operator CLI is the native system-level `pmdocs` binary. Install
it through Homebrew or the Valkyrian Labs Debian repository.

The npm package `@valkyrianlabs/payload-markdown-docs` installs the Payload
plugin and runtime helpers only. It does not provide the supported CLI surface.

:::toc {title="On this page" depth="3" theme="compact"}
:::

## install

Debian/Ubuntu:

```bash
sudo install -d -m 0755 /etc/apt/keyrings
sudo curl -fsSL https://apt.valkyrianlabs.com/pubkey.gpg \
  -o /etc/apt/keyrings/valkyrianlabs.gpg
sudo chmod 0644 /etc/apt/keyrings/valkyrianlabs.gpg

echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/valkyrianlabs.gpg] https://apt.valkyrianlabs.com stable main" | \
  sudo tee /etc/apt/sources.list.d/valkyrianlabs.list > /dev/null

sudo apt-get update
sudo apt-get install -y pmdocs

pmdocs --version
pmdocs --help
```

Homebrew:

```bash
brew tap valkyrianlabs/tap
brew install pmdocs

pmdocs --version
pmdocs --help
```

## doctor

```bash
pmdocs doctor
```

Prints local native CLI diagnostics. It does not check networking, Payload
server configuration, auth, OIDC, or signing.

## validate

```bash
pmdocs validate --source main-docs
pmdocs validate ./docs --source main-docs
```

Validates the conventional docs package by building and validating an in-memory
manifest. By default this includes Markdown docs from `./docs`, skill artifacts
from `./skills/<source>` when that directory exists, and optional custom
`llms.txt` / `llms-full.txt` fallback assets when present. The default
`./skills` directory is optional; only an explicitly supplied missing
`--skills <path>` fails validation.

## manifest

```bash
pmdocs manifest --source main-docs --pretty
pmdocs manifest ./docs --source main-docs --pretty
```

Prints manifest JSON. Docs records remain under `files`; skill artifacts and
optional custom static fallback files are emitted under `assets`.

## plan

```bash
pmdocs plan --source main-docs
pmdocs plan ./docs --source main-docs
```

Plans against an optional local existing-records JSON file. Without
`--existing`, all valid docs are planned as creates.

## keygen

```bash
pmdocs keygen --out .docs-sync
```

Generates Ed25519 PEM keys for signed sync. Add the public key to an Ed25519
record in `Docs Globals > Access`. `push` also accepts unencrypted OpenSSH
Ed25519 private keys when the matching `ssh-ed25519 ...` public key is stored in
Access.

## push

`push` uploads the conventional docs package by default:

- docs from `./docs` as manifest `files`
- skills from `./skills/<source>` as manifest `assets` when that directory
  exists
- `./llms.txt` and `./llms-full.txt` as optional custom static fallback assets
  when present

Projects do not need to ship native skills. A missing default `./skills`
directory is skipped during `push`; pass `--no-skills` to opt out explicitly or
`--skills <path>` when skills live somewhere else.

Ed25519:

```bash
pmdocs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id local-docs \
  --private-key-env DOCS_SYNC_PRIVATE_KEY
```

Explicit dry-run:

```bash
pmdocs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id local-docs \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --dry-run
```

GitHub OIDC:

```bash
pmdocs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc
```

`push` defaults to sync mode. `--dry-run` submits a validation-only request.
`--publish` is separate from sync mode and requests published output. Publishing
and writes remain server-owned.

If assets are included and public Next asset route files are missing from the
current working tree, `push` prints a warning. Add `--strict-routes` in CI to
turn that warning into a failure.

Common push flags:

- `--endpoint <url>`
- `--source <id>`
- `--docs <path>`
- `--skills <path>`
- `--llms <path>`
- `--llms-full <path>`
- `--no-docs`
- `--no-skills`
- `--no-llms`
- `--no-llms-full`
- `--dry-run`
- `--strict-routes`
- `--publish`
- `--delete-behavior <archive|delete|draft|ignore>`

OIDC-specific flags:

- `--github-oidc`
- `--oidc-token-env <env-name>`

When `--source` is omitted in GitHub Actions, the CLI derives it from
`GITHUB_REPOSITORY`.

## install skill

```bash
pmdocs install skill --agent codex
pmdocs install skill --agent claude
```

Installs the bundled `payload-markdown-docs` AI-agent guidance plus the
companion `payload-markdown` authoring skill for Codex or Claude. Codex defaults
to `.agents/skills/payload-markdown-docs/` and
`.agents/skills/payload-markdown/`; Claude defaults to
`.claude/skills/payload-markdown-docs/` and
`.claude/skills/payload-markdown/`. `pmdocs skill install` remains as a Codex
compatibility alias.

Useful flags:

- `--out <path>`
- `--docs-root <path>`
- `--package-manager <pnpm|npm|yarn|bun>`
- `--agent <codex|claude>`
- `--codex`
- `--claude`
- `--force`
- `--dry-run`

The installer writes Markdown guidance files only. It does not sync docs or run
package manager commands.

## install routes

```bash
pmdocs install routes --payload-app "src/app/(payload)"
```

Installs public Next App Router files that delegate raw AI asset requests to the
plugin-owned asset handlers. Commit and deploy these files when a site should
serve canonical public routes outside `/api`:

```text
/llms.txt
/llms-full.txt
/plugins/<docs-set>/llms.txt
/plugins/<docs-set>/llms-full.txt
/plugins/<docs-set>/skills/<agent>
/plugins/<docs-set>/skills/<agent>/SKILL.md
/plugins/<docs-set>/skills/<agent>.zip
/plugins/<docs-set>/skills/<agent>/<path...>
```

Useful flags:

- `--payload-app <path>`
- `--force`
- `--dry-run`

`install routes` does not publish assets. It only creates Next route files.
`install skill` does not publish assets either; it only installs local agent
guidance.

:::details {title="Common flags"}

- `--source <id>`
- `--docs <path>`
- `--skills <path>`
- `--llms <path>`
- `--llms-full <path>`
- `--no-docs`
- `--no-skills`
- `--no-llms`
- `--no-llms-full`
- `--repository <repo>`
- `--branch <branch>`
- `--commit <sha>`
- `--strict-routes`
- `--json`
- `--pretty`
- `--max-files <number>`
- `--max-file-bytes <number>`
- `--max-total-bytes <number>`

:::
