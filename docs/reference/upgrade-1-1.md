---
title: Upgrading to 1.1
navTitle: Upgrade to 1.1
description: Install, schema, and behavior changes when upgrading an existing 1.0.x install to 1.1.
order: 638
status: published
tags:
  - reference
  - migration
---

# Upgrading to 1.1

1.1 changes how the package is installed and adds database schema. Existing
docs, docs sets, groups, Access records and assets are kept; no content has to
be re-synced.

## 1. Install the peer packages

`@valkyrianlabs/payload-markdown` and `@payloadcms/plugin-seo` are now peer
dependencies instead of bundled dependencies, so the app installs them itself:

```bash
pnpm add @valkyrianlabs/payload-markdown-docs@^1.1.0 \
  @valkyrianlabs/payload-markdown@^1.6.0 \
  @payloadcms/plugin-seo
```

Then regenerate the import map, because the plugin registers admin components
from both packages (including the payload-markdown 1.6 block params field):

```bash
pnpm payload generate:importmap
```

## 2. Migrate the database

### What changes

| Table | Change |
| --- | --- |
| `docs_sets` | New `allow_tag_refs` column (default `true`; existing rows get `true`) |
| `docs_sets_repositories` | New table: the docs set `Allowed repositories` list |
| `docs_access_rels` | New table: the Access record `Allowed docs sets` relationship |
| `docs` | New `sync_fields_hash_at_last_sync` column |
| `_docs_v`, `_docs_sets_v` | The same columns for versions, when drafts are enabled |
| `docs_sync_nonces` | New **unique** index on `(key_id, nonce)` |

Payload 3.90 itself also adds `users.reset_password_requested_at`, so that
column can appear in the same migration.

Every change is additive except the unique nonce index: creating it fails if
the nonces table holds two rows with the same key id and nonce. Earlier
versions did not prevent that, so clean the table up first. Expired nonces are
no longer needed for replay protection and are removed as well.

The table names above use the default collection slugs; they follow your
slugs if you changed them.

### With migrations (recommended)

1. Upgrade the packages (step 1).
2. Create the migration:

   ```bash
   pnpm payload migrate:create docs_1_1
   ```

3. Call `prepareDocsSyncMigration` at the top of the generated `up`, before the
   generated SQL:

   ```ts
   import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'
   import { prepareDocsSyncMigration } from '@valkyrianlabs/payload-markdown-docs/migrations'

   export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
     await prepareDocsSyncMigration({ payload, req })

     await db.execute(sql`
       -- generated SQL, unchanged
     `)
   }
   ```

   Pass `noncesCollectionSlug` if you changed `collections.nonces.slug`. The
   helper uses the migration's `req`, so it runs in the same transaction: if
   the migration fails, nothing is deleted. It returns how many expired and
   duplicate nonces it removed, keeps the oldest row of each duplicate pair, and
   can run more than once.

4. Run it:

   ```bash
   pnpm payload migrate
   ```

Without the helper, `migrate` fails with
`could not create unique index "keyId_nonce_idx"` when duplicates exist, and
the migration is rolled back.

### With dev schema push

Starting the app in development (`push` mode) applies the schema directly. If
it stops with `could not create unique index "keyId_nonce_idx"`, remove the
expired and duplicate nonces, then start it again:

```sql
DELETE FROM docs_sync_nonces WHERE expires_at < now();

DELETE FROM docs_sync_nonces a
USING docs_sync_nonces b
WHERE a.key_id = b.key_id
  AND a.nonce = b.nonce
  AND a.id > b.id;
```

Push mode applies the other changes before it reaches the index, so the second
start finishes the upgrade.

### MongoDB

There is no SQL migration. Mongoose builds the unique index in the background
when the app starts; while duplicates exist that build fails with a logged
error and the app starts anyway. Sync still rejects replays without the index,
but concurrent requests are only handled atomically once it exists. Remove the
duplicates once with `payload run`:

```ts
// scripts/prepare-docs-1-1.ts
import config from '@payload-config'
import { getPayload } from 'payload'
import { prepareDocsSyncMigration } from '@valkyrianlabs/payload-markdown-docs/migrations'

const payload = await getPayload({ config })
console.log(await prepareDocsSyncMigration({ payload }))
process.exit(0)
```

```bash
pnpm payload run scripts/prepare-docs-1-1.ts
```

Then restart the app so the index is built. Apps that set `autoIndex: false`
in `connectOptions` create indexes their own way and need this index created
too.

## 3. Review changed defaults

- **Collection access.** Plugin collections are admin-only by default: only
  users of the admin user collection (`config.admin.user`) can manage docs
  records, and sync runs and nonces are read-only. If other users edited docs
  records, add `access` overrides. See
  [Collection Access](/configuration/plugin-config).
- **Draft syncs and assets.** With drafts enabled, a sync without `--publish`
  no longer applies asset creates and updates; the next `--publish` sync does.
  Set `sync.applyAssetsOnDraftSync: true` for the old behavior. See
  [Sync Config](/configuration/sync-config).
- **Forwarded headers.** Public URLs are no longer built from
  `X-Forwarded-Host` unless `endpoint.trustForwardedHeaders: true`. Set
  `serverURL` in production.
- **Tag refs.** Existing docs sets keep accepting GitHub OIDC tokens from tag
  refs (`Allow tag refs` is on). Turn it off per docs set to publish only from
  the branch. See [GitHub OIDC](/configuration/github-oidc).
- **Ed25519 key scope.** Keys without `Allowed docs sets` still work for every
  docs set and log a warning. Scope them to the docs sets they publish.

## 4. Update the CLI

Install the matching `pmdocs`. The docs walk no longer drops files silently:

- Hidden files and directories are published, each with a warning. Pass
  `--skip-hidden` to leave them out.
- `build`, `dist` and `.next` are skipped only directly below the docs root;
  deeper directories with those names are published as ordinary sections.

Run `pmdocs validate` before the first push to see what is included. See
[CLI](/reference/cli).
