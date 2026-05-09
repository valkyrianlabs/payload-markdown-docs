# Dev Harness

This folder is the local test range for the dedicated docs workflow:

```text
Markdown fixtures -> CLI manifest -> signed endpoint -> generated docs -> route adapter
```

It intentionally does not cover existing collection targets, block targets, or Pages mutation.

## Setup

1. Configure the dev database:

```bash
cp dev/.env.example dev/.env
# edit DATABASE_URL and PAYLOAD_SECRET
```

The dev Payload config and dev Payload scripts load `dev/.env` directly. Keep the file in `dev/`; do not move it to the repository root.

2. Generate local dev sync keys:

```bash
pnpm dev:docs:keygen
```

This writes `dev/.docs-sync/docs-sync-public.pem` and
`dev/.docs-sync/docs-sync-private.pem`. The directory is ignored. Do not commit
private keys.

The docs seed script reads the public key in this order and stores it in
`Docs Globals > Keys`:

- `DOCS_SYNC_PUBLIC_KEY`
- `DOCS_SYNC_PUBLIC_KEY_FILE`
- `dev/.docs-sync/docs-sync-public.pem`

The default local key id is `dev-local`. Override it with `DOCS_SYNC_KEY_ID` if needed.

3. Seed the docs group and docs set:

```bash
pnpm dev:docs:seed
```

Seeded docs group:

- title: `Plugins`
- route path: `/plugins` derived from slug `plugins`
- serveIndex: `false`

Seeded docs set:

- title: `Payload Markdown Docs`
- slug/source: `payload-markdown-docs`
- route base: `/plugins/payload-markdown-docs` derived from group + slug

Seeded docs key:

- key id: `dev-local` unless `DOCS_SYNC_KEY_ID` is set

4. Start the dev server:

```bash
pnpm dev
```

If the server was already running when keys were generated, rerun
`pnpm dev:docs:seed` so the global Keys record stores the public key.

## Local Commands

This package checkout does not self-link its published binary into
`node_modules/.bin`, so `pnpm exec payload-markdown-docs` is for consuming
projects that install the package. Use `pnpm cli` here to run the source CLI.

Validate the happy-path fixture:

```bash
pnpm dev:docs:validate
```

Print the manifest:

```bash
pnpm dev:docs:manifest
```

Preview the local plan against an empty target:

```bash
pnpm dev:docs:plan
```

Dry-run against the local endpoint:

```bash
pnpm cli push ./dev/docs-fixtures/basic \
  --endpoint "http://localhost:3000/api/payload-markdown-docs/sync" \
  --source payload-markdown-docs \
  --key-id dev-local \
  --private-key-file dev/.docs-sync/docs-sync-private.pem \
  --dry-run
```

Apply as draft records:

```bash
pnpm cli push ./dev/docs-fixtures/basic \
  --endpoint "http://localhost:3000/api/payload-markdown-docs/sync" \
  --source payload-markdown-docs \
  --key-id dev-local \
  --private-key-file dev/.docs-sync/docs-sync-private.pem \
  --sync
```

Apply and publish:

```bash
pnpm cli push ./dev/docs-fixtures/publishing \
  --endpoint "http://localhost:3000/api/payload-markdown-docs/sync" \
  --source payload-markdown-docs \
  --key-id dev-local \
  --private-key-file dev/.docs-sync/docs-sync-private.pem \
  --sync \
  --publish
```

Reset the generated dev docs state:

```bash
pnpm dev:docs:reset
```

## Manual Browser Checks

Open Payload Admin:

```text
http://localhost:3000/admin
```

Login:

- email: `dev@payloadcms.com`
- password: `test`

Check:

- `/` renders the dev landing page with links to Admin and docs routes.
- The `Docs Globals` sidebar group contains `Sets`, `Groups`, `Keys`, and `Trusted`.
- `Docs Globals > Groups` contains `Plugins`.
- `Docs Globals > Sets` contains `Payload Markdown Docs`.
- The docs set edit view shows the read-only Generated Docs manager.
- Generated docs records are hidden from the main sidebar; open them from the Generated Docs manager links.
- Docs sync runs and nonces are hidden from the main sidebar.
- After `push --sync --publish`, the frontend route renders:

```text
http://localhost:3000/plugins/payload-markdown-docs
```

Check the sidebar by visiting:

```text
http://localhost:3000/plugins/payload-markdown-docs/getting-started/installation
http://localhost:3000/plugins/payload-markdown-docs/configuration/sync
```

Draft and publish behavior:

- Run `push --sync` without `--publish`; generated records should be drafts and the frontend route should not resolve them.
- Run `push --sync --publish`; generated records should be published and the frontend route should render them.

Archived docs:

- Sync `dev/docs-fixtures/basic`.
- Then sync `dev/docs-fixtures/publishing` with the same command shape.
- Records missing from the second fixture should be archived in the generated docs manager.

## Failure Checks

Bad signature:

- Generate a second keypair somewhere outside `dev/.docs-sync`.
- Push with that private key while the server still uses `dev-local`.
- Expected response: `invalid_signature`.

Nonce replay:

- Replay the exact same signed HTTP request with the same body and headers.
- Expected response: `nonce_replay`.

Route collision:

- In Admin, manually create a generated doc with route `/plugins/payload-markdown-docs/conflicting-page`.
- Push `dev/docs-fixtures/route-collisions` with `--dry-run`.
- Expected response: `route_collision`.

Manual edit conflict:

- Sync `dev/docs-fixtures/basic`.
- Open a generated doc and edit its Markdown content directly.
- Sync the same fixture again.
- Expected response: `manual_edit_conflict`.
