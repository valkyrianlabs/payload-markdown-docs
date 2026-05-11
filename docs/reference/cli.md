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
payload-markdown-docs validate ./docs --source main-docs
```

Validates local Markdown files by building and validating an in-memory manifest.

## manifest

```bash
payload-markdown-docs manifest ./docs --source main-docs --pretty
```

Prints manifest JSON.

## plan

```bash
payload-markdown-docs plan ./docs --source main-docs
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
payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id local-docs \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --dry-run
```

GitHub OIDC:

```bash
payload-markdown-docs push ./docs \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc \
  --sync
```

`push` supports `--dry-run`, `--sync`, and `--publish`. Dry-run is the default.
Publishing and writes remain server-owned.

OIDC-specific flags:

- `--github-oidc`
- `--oidc-token-env <env-name>`

When `--source` is omitted in GitHub Actions, the CLI derives it from
`GITHUB_REPOSITORY`.

## install skill

```bash
payload-markdown-docs install skill --codex
```

Installs local AI-agent guidance under
`.agents/skills/payload-markdown-docs/` and creates or updates `AGENTS.md` so
Codex can discover the skill guidance.

Alias:

```bash
payload-markdown-docs install ai-skill --codex
```

Useful flags:

- `--out <path>`
- `--docs-root <path>`
- `--package-manager <pnpm|npm|yarn|bun>`
- `--force`
- `--dry-run`

The installer writes Markdown guidance files only. It does not sync docs or run
package manager commands.

:::details {title="Common flags"}
- `--source <id>`
- `--repository <repo>`
- `--branch <branch>`
- `--commit <sha>`
- `--json`
- `--pretty`
- `--max-files <number>`
- `--max-file-bytes <number>`
- `--max-total-bytes <number>`
:::
