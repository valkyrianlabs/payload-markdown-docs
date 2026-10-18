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

The npm package `payload-markdown-docs` installs the Payload
plugin and runtime helpers only. It does not provide the supported CLI surface.

Examples use `main-docs` as a sample docs set slug. Replace it with the Payload
docs set slug for your upstream docs package.

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

The packages recommend `valkyrianlabs-archive-keyring` (APT installs it by default), which puts the repository key at
`/usr/share/keyrings/valkyrianlabs.gpg` and keeps it current through normal upgrades (for example when its
expiry changes). When the key downloaded above is unmodified, the package replaces it with a symlink to the
packaged key, so the source line above keeps working and you never need to download the key again. Removing
the package turns the symlink back into a plain copy. Signing key fingerprint:
`494D 71A1 EEDD F87B D48E  5048 6D64 CB7B DFC3 0EC6`.

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

`doctor` exits `0` with `status: ok` when both skills `pmdocs install skill`
installs are available, and `1` with `status: degraded` when either is missing.
The `payload-markdown-docs` skill comes from the bundled skill data. The
`payload-markdown` skill comes from the project's installed `payload-markdown`
package when there is one (`companion_skill_source: project: ...`), and from the
bundled copy otherwise; the Debian package and the Homebrew formula both bundle
it.

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

What the docs walk includes:

- every lowercase `.md` file below the docs root, at any depth
- hidden files and directories (names starting with `.`), each reported as a
  warning; pass `--skip-hidden` to leave them out

What it leaves out, always reported as a `skipped_path` warning:

- `.git` and `node_modules` directories at any depth
- `build`, `dist`, and `.next` directories directly below the docs root (the
  same names deeper in the tree are ordinary docs sections)
- symbolic links (not followed)
- Markdown-like files that are not lowercase `.md`, such as `README.MD` or
  `notes.markdown`

Files that are not valid UTF-8 fail validation with an `invalid_encoding`
error that names the file.

`stack.toml` at the docs root is project metadata, not a page: the walk never
publishes it as a doc. When it exists, `validate` checks it and prints
`stack.toml: present` with the title/description it sets and its categories
(`missing` without the file, `invalid` with errors). Its errors fail validation
like any other. Each one has the path `stack.toml` and names the key to fix,
such as `stack.languages[0].name`. A file without a `[stack]` table produces a
`missing_stack` warning because it clears the synchronized stack. With
`--json`, `package.stackToml` reports the state and `project` summarizes the
metadata. See [stack.toml](/reference/stack-toml).

Two files that derive the same route (`index.md` and `Index.md`, or
`guide.md` and `guide/index.md`) fail validation with a `route_collision` error
on each file; the sync endpoint would reject them. Routes that differ only in
letter case produce a `route_case_collision` warning. `push` reports local
collisions as warnings and leaves the decision to the server, which knows the
docs set's real route base.

Size limits: `--max-file-bytes` (500,000) applies to each docs file and asset,
`--max-total-bytes` (5,000,000) to the sum of all docs and asset contents, and
`--max-body-bytes` (5,000,000) to the serialized JSON request body. The body
limit is the one the server enforces first (`maxBodyBytes`, HTTP 413), and JSON
escaping can make the body noticeably larger than the content, so `validate`,
`manifest`, and `plan` check the largest body `push` could send and `push`
checks the exact body. Pass `--max-body-bytes` when the server is configured
with a different `maxBodyBytes`. Skill packages follow the same walk rules and report
files other than `.md`, `.txt`, `.json`, `.yaml`, and `.yml`.

## manifest

```bash
pmdocs manifest --source main-docs --pretty
pmdocs manifest ./docs --source main-docs --pretty
```

Prints manifest JSON. Docs records remain under `files`; skill artifacts and
optional custom static fallback files are emitted under `assets`. A valid
`stack.toml` becomes the `project` object right after `source`. Without the file
there is no `project` key, and the docs set's project metadata stays as it is.

## plan

```bash
pmdocs plan --source main-docs
pmdocs plan ./docs --source main-docs
```

Plans against optional local existing-records JSON files. Without
`--existing`, all valid docs are planned as creates; without
`--existing-assets`, all assets are planned as creates.

The plan is a local approximation of the server's dry-run. To match it:

- pass `--publish` when the push will use `--publish` (otherwise existing
  published records are planned as status updates)
- pass `--route-base` for docs sets that are not served at `/<source>`: a
  grouped docs set uses `/<group-route>/<source>`, a product-nested one
  `/<group-route>/<source>/docs` (also pass
  `--asset-route-base /<group-route>/<source>` so skill asset routes match)
- export current records with the `--existing` (docs) and `--existing-assets`
  (assets) shapes: arrays of `{ "sourcePath", "route", "sourceHash", "status",
  "archived" }` and `{ "sourcePath", "kind", "contentType", "route",
  "sourceHash", "archived" }`

The text and `--json` output also show the `stack.toml` summary.

`pmdocs push --dry-run` asks the server for the authoritative plan.
`validate` accepts `--route-base` and `--asset-route-base` too, so route
collision checks use the same routes.

## keygen

```bash
pmdocs keygen --out .docs-sync
```

Generates Ed25519 PEM keys for signed sync. The private key file is created
with mode `0600` (and a newly created `--out` directory with `0700`), whatever
the current umask, including when `--force` replaces an existing key. `push`
warns when `--private-key-file` is readable by group or other users. Add the
public key to an Ed25519 record in `Docs Globals > Access`. `push` also accepts unencrypted OpenSSH
Ed25519 private keys when the matching `ssh-ed25519 ...` public key is stored in
Access.

## push

`push` uploads the conventional docs package by default:

- docs from `./docs` as manifest `files`
- skills from `./skills/<source>` as manifest `assets` when that directory
  exists
- `./llms.txt` and `./llms-full.txt` as optional custom static fallback assets
  when present
- `stack.toml` from the docs root as the manifest `project` object when present
  ([stack.toml](/reference/stack-toml))

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
  --source <docs-set-slug> \
  --github-oidc
```

`push` defaults to sync mode. `--dry-run` submits a validation-only request.

`--endpoint` must use `https://`. Plain `http://` is accepted only for loopback
hosts (`localhost`, `127.x.x.x`, `::1`) so a GitHub OIDC bearer token or a
signed manifest never crosses a network in clear text; pass
`--allow-insecure-http` only for a trusted private network.
`--publish` is separate from sync mode and requests published output. Publishing
and writes remain server-owned.

When the server rejects a push, `pmdocs` prints the error message followed by
every detail the server returns: validation `issues` (with path, code, and
severity), `routeCollisions`, and manual-edit `conflicts`. With `--json`, the
output adds a normalized `failure` object with `code`, `message`, `issues`,
`routeCollisions`, and `conflicts` (empty arrays when an older server does not
send them).

When the push sent `stack.toml`, the server reports what it did with it, and
the output prints a line like `Project metadata: stack updated, title manual,
description not_provided`. `(not applied)` is added for dry runs. Servers
older than payload-markdown-docs 1.3.0 ignore project metadata without saying
so. `push` then still succeeds, because the docs were synced, but it prints a
warning that the stack, title and description were not synchronized. With
`--json` the output carries `project: { "sent": true, "acknowledged": false }`
and a `project_not_acknowledged` warning.

If assets are included and public Next asset route files are missing from the
current working tree, `push` prints a warning. Add `--strict-routes` in CI to
turn that warning into a failure.

Common push flags:

- `--endpoint <url>`
- `--allow-insecure-http`
- `--source <id>`
- `--docs <path>`
- `--skills <path>`
- `--llms <path>`
- `--llms-full <path>`
- `--no-docs`
- `--no-skills`
- `--no-llms`
- `--no-llms-full`
- `--skip-hidden`
- `--dry-run`
- `--strict-routes`
- `--publish`
- `--delete-behavior <archive|delete|draft|ignore>`

OIDC-specific flags:

- `--github-oidc`
- `--oidc-token-env <env-name>`

Pass `--source` explicitly in CI. The CLI can derive it from
`GITHUB_REPOSITORY` only when the docs set slug matches the repository name,
but copied workflow templates should not rely on that fallback.

`--repository`, `--branch`, and `--commit` are optional source metadata flags.
They are not required for GitHub OIDC authentication because Payload verifies
repository, ref, and SHA from the OIDC token claims.

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

The `payload-markdown` skill is taken from the project's installed
`payload-markdown` package (`node_modules/payload-markdown` or
`node_modules/payload-markdown`, searched upwards from the
working directory) so it matches the version the site renders with; otherwise
from the copy bundled with `pmdocs`. Its files are copied unchanged, so
`npx payload-markdown skill check` accepts them. If neither is available the
command fails instead of installing half the guidance.

Each installed skill carries a `skill.json` manifest (version and content
hash). Re-running `install skill` replaces an install that nobody edited without
`--force`; edited files are reported as conflicts.

The installer writes Markdown guidance files only. It does not sync docs or run
package manager commands.

## skill check

```bash
pmdocs skill check
pmdocs skill check --agent claude --json
```

Reports each installed skill (`payload-markdown-docs` and `payload-markdown`,
for every agent installed in the project, or `--agent`) as:

| Status | Meaning |
| --- | --- |
| `current` | Matches what this `pmdocs` (or the project's `payload-markdown`) installs. |
| `outdated` | Installed from an older version, or before manifests existed. |
| `modified` | Edited since it was installed. |
| `missing` | Not installed. |

Exits `0` only when every skill is `current`.

## skill update

```bash
pmdocs skill update
pmdocs skill update --agent codex --dry-run
```

Replaces outdated or missing skills for every installed agent (or `--agent`),
keeping the `--docs-root` and `--package-manager` they were installed with
(override either with the same flag). Skills that were edited since install are
left alone and the command fails; pass `--force` to replace them too.

`pmdocs validate` and `pmdocs plan` print a reminder on stderr when an installed
skill is outdated; they never change their exit code for it. Set
`PMDOCS_SKILL_CHECK=0` to silence it. The installed skill tells agents to run
`pmdocs skill update` when they see `outdated`, and to ask first when it says
`modified`.

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
- `--skip-hidden`
- `--repository <repo>`
- `--branch <branch>`
- `--commit <sha>`
- `--json`
- `--pretty`
- `--max-files <number>`
- `--max-file-bytes <number>`
- `--max-total-bytes <number>`
- `--max-body-bytes <number>`
- `--route-base <path>` and `--asset-route-base <path>` (`validate` and `plan`)

`--strict-routes` is a `push` flag only. Without `--source`, the docs set slug
comes from `GITHUB_REPOSITORY` (the repository name) when it is set, otherwise
from the docs root directory name, or `local-docs` when that directory is named
`docs`.

:::
