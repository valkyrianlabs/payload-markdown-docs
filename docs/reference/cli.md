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
from `./skills/<source>`, and root `llms.txt` files when present.

## manifest

```bash
payload-markdown-docs manifest --source main-docs --pretty
```

Prints manifest JSON. Docs records remain under `files`; static AI-facing
artifacts such as skills and `llms.txt` are emitted under `assets`.

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
`--sync` is still accepted for compatibility but is no longer required.
Publishing and writes remain server-owned.

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

Installs native AI-agent guidance from the package `skills/` tree. Codex
defaults to `.agents/skills/payload-markdown-docs/` and creates or updates
`AGENTS.md`. Claude defaults to `.claude/skills/payload-markdown-docs/` and does
not update `AGENTS.md` by default.

Alias:

```bash
payload-markdown-docs install ai-skill --agent codex
payload-markdown-docs install ai-skill --agent claude
```

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
- `--json`
- `--pretty`
- `--max-files <number>`
- `--max-file-bytes <number>`
- `--max-total-bytes <number>`
:::
