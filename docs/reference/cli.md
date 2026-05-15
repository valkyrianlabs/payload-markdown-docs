---
title: CLI Reference
navTitle: CLI
description: Commands and flags for payload-markdown-docs.
order: 600
status: published
tags:
  - reference
  - cli
---

# CLI Reference

The package exposes the `payload-markdown-docs` binary.

:::toc {title="On this page" depth="3" theme="compact"}
:::

## validate

```bash
payload-markdown-docs validate --source main-docs
```

Validates the conventional docs package by building and validating an in-memory
manifest. By default this includes Markdown docs from `./docs`, skill artifacts
from `./skills/<source>`, and optional custom `llms.txt` / `llms-full.txt`
fallback assets when present.

## manifest

```bash
payload-markdown-docs manifest --source main-docs --pretty
```

Prints manifest JSON. Docs records remain under `files`; skill artifacts and
optional custom static fallback files are emitted under `assets`.

## plan

```bash
payload-markdown-docs plan --source main-docs
```

Plans against an optional local existing-records JSON file. Without
`--existing`, all valid docs are planned as creates.

## keygen

```bash
payload-markdown-docs keygen --out .docs-sync
```

Generates Ed25519 PEM keys for signed sync. Add the public key to
`Docs Globals > Keys`. `push` also accepts unencrypted OpenSSH Ed25519 private
keys when the matching `ssh-ed25519 ...` public key is stored in Keys.

## push

`push` uploads the conventional docs package by default:

- docs from `./docs` as manifest `files`
- skills from `./skills/<source>` as manifest `assets`
- `./llms.txt` and `./llms-full.txt` as optional custom static fallback assets
  when present

Ed25519:

```bash
payload-markdown-docs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id local-docs \
  --private-key-env DOCS_SYNC_PRIVATE_KEY
```

Explicit dry-run:

```bash
payload-markdown-docs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id local-docs \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --dry-run
```

GitHub OIDC:

```bash
payload-markdown-docs push \
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
payload-markdown-docs install skill --agent codex
payload-markdown-docs install skill --agent claude
```

Installs native AI-agent guidance from the package `skills/` tree and installs
the companion `@valkyrianlabs/payload-markdown` authoring skill beside it. Codex
defaults to `.agents/skills/payload-markdown-docs/` plus
`.agents/skills/payload-markdown/` and creates or updates `AGENTS.md`. Claude
defaults to `.claude/skills/payload-markdown-docs/` plus
`.claude/skills/payload-markdown/` and does not update `AGENTS.md` by default.

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
payload-markdown-docs install routes --payload-app "src/app/(payload)"
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
