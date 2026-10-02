/**
 * Real-Postgres regression tests for the docs sync endpoint and the public read side.
 *
 * Gated on PAYLOAD_MARKDOWN_DOCS_RUN_DB_TESTS=1 (and DATABASE_URL). These scenarios were
 * only reproducible with real Payload semantics (drafts/versions, unique indexes, default
 * access), which the mocked unit tests cannot model. Endpoint handlers come from the dev
 * config, which imports `../dist`: run `pnpm build` first.
 */
import type { Payload } from 'payload'

import config from '@payload-config'
import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import { prepareDocsSyncMigration } from '../src/migrations/index.js'
import { resolvePayloadMarkdownDocsRoute } from '../src/next/route.js'
import { sha256Hex } from '../src/sync/hash.js'
import {
  buildManifest,
  callGet,
  callRawSync,
  callSync,
  createDocsSet,
  createSyncKey,
  findDocsBySource,
  registerSyncKey,
  runDbTests,
  type SyncKey,
  uniqueSlug,
} from './helpers/syncHarness.js'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

const describeDb = runDbTests ? describe : describe.skip

let payload: Payload
let key: SyncKey

const sync = (manifest: unknown, options: { nonce?: string; timestamp?: Date } = {}) =>
  callSync({ key, manifest, payload, ...options })

const getLlms = async (slug: string, file: 'llms.txt' | 'llms-full.txt' = 'llms-full.txt') => {
  const response = await callGet({
    path: `/:routeBase*/${file}`,
    payload,
    url: `http://localhost:3000/${slug}/${file}`,
  })

  return {
    status: response.status,
    text: await response.text(),
  }
}

describeDb('docs sync real-DB regressions', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
    key = createSyncKey()
    await registerSyncKey(payload, key)
  })

  afterAll(async () => {
    await payload?.destroy()
  })

  describe('route lifecycle and atomic apply (DOCS-2, DOCS-3, DOCS-17)', () => {
    const routesOf = async (slug: string) =>
      (await findDocsBySource(payload, slug)).map((doc) => [
        doc.sourcePath,
        doc.route,
        doc.sync?.archived === true,
      ])

    test('moving guide.md to guide/index.md (same route) syncs and later syncs keep working', async () => {
      const slug = uniqueSlug('move')
      await createDocsSet(payload, slug)
      expect(
        (await sync(buildManifest(slug, [{ content: '# Guide\n', path: 'guide.md' }]))).status,
      ).toBe(200)

      const moved = await sync(
        buildManifest(slug, [
          { content: '# Aaa new\n', path: 'aaa-new.md' },
          { content: '# Guide moved\n', path: 'guide/index.md' },
        ]),
      )
      expect(moved.status).toBe(200)
      expect(moved.json.summary).toMatchObject({ archive: 1, create: 2 })

      const docs = await findDocsBySource(payload, slug)
      const live = docs.filter((doc) => doc.sync?.archived !== true)
      expect(live.map((doc) => [doc.sourcePath, doc.route]).sort()).toEqual([
        ['aaa-new.md', `/${slug}/aaa-new`],
        ['guide/index.md', `/${slug}/guide`],
      ])
      const archived = docs.find((doc) => doc.sourcePath === 'guide.md')
      expect(archived?.sync?.archived).toBe(true)
      expect(String(archived?.route)).toMatch(/^archived:/)

      const route = await resolvePayloadMarkdownDocsRoute({
        path: `/${slug}/guide`,
        payload: payload as never,
      })
      expect(route?.type).toBe('doc')
      expect((route as { doc?: { sourcePath?: string } }).doc?.sourcePath).toBe('guide/index.md')

      // Moving back reactivates the archived record onto its original route.
      const back = await sync(buildManifest(slug, [{ content: '# Guide\n', path: 'guide.md' }]))
      expect(back.status).toBe(200)
      const after = await routesOf(slug)
      expect(after).toContainEqual(['guide.md', `/${slug}/guide`, false])
      expect(
        after.filter(([, route]) => route === `/${slug}/guide`),
      ).toHaveLength(1)
    })

    test('swapping slugs between two docs succeeds', async () => {
      const slug = uniqueSlug('swap')
      await createDocsSet(payload, slug)
      expect(
        (
          await sync(
            buildManifest(slug, [
              { content: '---\nslug: x\n---\n# A\n', path: 'a.md' },
              { content: '---\nslug: y\n---\n# B\n', path: 'b.md' },
            ]),
          )
        ).status,
      ).toBe(200)

      const swapped = await sync(
        buildManifest(slug, [
          { content: '---\nslug: y\n---\n# A\n', path: 'a.md' },
          { content: '---\nslug: x\n---\n# B\n', path: 'b.md' },
        ]),
      )
      expect(swapped.status).toBe(200)
      expect(await routesOf(slug)).toEqual([
        ['a.md', `/${slug}/y`, false],
        ['b.md', `/${slug}/x`, false],
      ])
    })

    test('renaming a file that keeps its slug frontmatter succeeds', async () => {
      const slug = uniqueSlug('rename')
      await createDocsSet(payload, slug)
      await sync(buildManifest(slug, [{ content: '---\nslug: keep\n---\n# K\n', path: 'old.md' }]))
      const renamed = await sync(
        buildManifest(slug, [{ content: '---\nslug: keep\n---\n# K\n', path: 'new.md' }]),
      )
      expect(renamed.status).toBe(200)
      expect(await routesOf(slug)).toContainEqual(['new.md', `/${slug}/keep`, false])
    })

    test('a non-publish sync that claims a route still served by a published doc is rejected before writes', async () => {
      const slug = uniqueSlug('retained')
      await createDocsSet(payload, slug)
      await sync(buildManifest(slug, [{ content: '# Guide\n', path: 'guide.md' }]))
      const before = await routesOf(slug)

      // guide.md moves away in a draft (version only) while a new doc claims its route;
      // the published guide.md still serves /guide, so the sync cannot proceed.
      const result = await sync(
        buildManifest(
          slug,
          [
            { content: '---\nslug: guide-old\n---\n# Guide\n', path: 'guide.md' },
            { content: '---\nslug: guide\n---\n# New\n', path: 'new.md' },
          ],
          { publish: false },
        ),
      )
      expect(result.status).toBe(409)
      expect(result.json.error.code).toBe('route_collision')
      expect(result.json.routeCollisions).toContainEqual(
        expect.objectContaining({
          reason: 'route_retained_by_published_doc',
          route: `/${slug}/guide`,
        }),
      )
      expect(await routesOf(slug)).toEqual(before)
    })

    test('a draft slug swap followed by a publish sync converges', async () => {
      const slug = uniqueSlug('swap-draft')
      await createDocsSet(payload, slug)
      const first = buildManifest(slug, [
        { content: '---\nslug: x\n---\n# A\n', path: 'a.md' },
        { content: '---\nslug: y\n---\n# B\n', path: 'b.md' },
      ])
      const swapped = buildManifest(slug, [
        { content: '---\nslug: y\n---\n# A\n', path: 'a.md' },
        { content: '---\nslug: x\n---\n# B\n', path: 'b.md' },
      ])
      expect((await sync(first)).status).toBe(200)
      expect((await sync({ ...swapped, publish: false })).status).toBe(200)

      const published = await sync(swapped)
      expect(published.status).toBe(200)
      expect(await routesOf(slug)).toEqual([
        ['a.md', `/${slug}/y`, false],
        ['b.md', `/${slug}/x`, false],
      ])
    })

    test('archived records created before route release (pre-fix data) are released on demand', async () => {
      const slug = uniqueSlug('stale')
      const set = await createDocsSet(payload, slug)
      await payload.create({
        collection: 'docs',
        data: {
          _status: 'published',
          content: '# Old\n',
          docsSet: set.id,
          route: `/${slug}/guide`,
          sourcePath: 'old-guide.md',
          sync: {
            archived: true,
            contentHashAtLastSync: sha256Hex('# Old\n'),
            managedBy: 'payload-markdown-docs',
            sourceId: slug,
            sourcePath: 'old-guide.md',
          },
          title: 'Old',
        } as never,
        overrideAccess: true,
      })

      const result = await sync(buildManifest(slug, [{ content: '# Guide\n', path: 'guide.md' }]))
      expect(result.json).toMatchObject({ ok: true })
      expect(result.status).toBe(200)
      expect(await routesOf(slug)).toContainEqual(['guide.md', `/${slug}/guide`, false])
    })

    test('a failing apply leaves no partial state and marks the sync run failed', async () => {
      const slug = uniqueSlug('atomic')
      await createDocsSet(payload, slug)
      await sync(buildManifest(slug, [{ content: '# A v1\n', path: 'a.md' }]))

      const hooks = payload.collections.docs.config.hooks
      const failingHook = ({ data }: { data: Record<string, unknown> }) => {
        if (data?.sourcePath === 'boom.md') {
          throw new Error('SECRET-DB-DETAIL simulated failure')
        }

        return data
      }
      hooks.beforeChange.push(failingHook as never)

      try {
        const failed = await sync(
          buildManifest(slug, [
            { content: '# A v2\n', path: 'a.md' },
            { content: '# Boom\n', path: 'boom.md' },
          ]),
        )
        expect(failed.status).toBe(500)
        expect(failed.json.error.code).toBe('sync_apply_failed')
        expect(JSON.stringify(failed.json)).not.toContain('SECRET-DB-DETAIL')
      } finally {
        hooks.beforeChange.splice(hooks.beforeChange.indexOf(failingHook as never), 1)
      }

      const docs = await findDocsBySource(payload, slug)
      expect(docs.map((doc) => [doc.sourcePath, doc.content])).toEqual([['a.md', '# A v1\n']])

      const runs = await payload.find({
        collection: 'docs-sync-runs',
        overrideAccess: true,
        sort: '-createdAt',
        where: { sourceId: { equals: slug } },
      })
      expect(runs.docs.map((run) => run.status)).toEqual(['failed', 'success'])
      expect(runs.docs.some((run) => run.status === 'pending')).toBe(false)

      // The same manifest succeeds once the failure is gone (no stuck state).
      const retry = await sync(
        buildManifest(slug, [
          { content: '# A v2\n', path: 'a.md' },
          { content: '# Boom\n', path: 'boom.md' },
        ]),
      )
      expect(retry.status).toBe(200)
    })

    test('removing a doc in a non-publish sync takes the published doc offline', async () => {
      const slug = uniqueSlug('unpub')
      await createDocsSet(payload, slug)
      await sync(
        buildManifest(slug, [
          { content: '# A\n', path: 'a.md' },
          { content: '# B\n', path: 'b.md' },
        ]),
      )
      expect(
        (await resolvePayloadMarkdownDocsRoute({ path: `/${slug}/b`, payload: payload as never }))
          ?.type,
      ).toBe('doc')

      const removal = await sync(
        buildManifest(slug, [{ content: '# A\n', path: 'a.md' }], { publish: false }),
      )
      expect(removal.status).toBe(200)
      expect(removal.json.summary.archive).toBe(1)

      const publishedView = await payload.find({
        collection: 'docs',
        draft: false,
        overrideAccess: true,
        where: { sourcePath: { equals: 'b.md' }, 'sync.sourceId': { equals: slug } },
      })
      expect(publishedView.docs[0]?.sync?.archived).toBe(true)
      expect(
        await resolvePayloadMarkdownDocsRoute({ path: `/${slug}/b`, payload: payload as never }),
      ).toBeNull()
      expect((await getLlms(slug, 'llms.txt')).text).not.toContain(`/${slug}/b`)
    })
  })

  describe('archive churn and asset removal (DOCS-9, DOCS-10)', () => {
    test('already-archived docs are not re-archived on later syncs', async () => {
      const slug = uniqueSlug('churn')
      await createDocsSet(payload, slug)
      await sync(
        buildManifest(slug, [
          { content: '# A\n', path: 'a.md' },
          { content: '# B\n', path: 'b.md' },
        ]),
      )
      const removal = await sync(buildManifest(slug, [{ content: '# A\n', path: 'a.md' }]))
      expect(removal.json.summary.archive).toBe(1)

      const archivedB = (await findDocsBySource(payload, slug)).find(
        (doc) => doc.sourcePath === 'b.md',
      )
      const archivedAt = archivedB?.sync?.archivedAt
      const versionsBefore = await payload.countVersions({
        collection: 'docs',
        where: { parent: { equals: archivedB?.id } },
      })

      for (let index = 0; index < 2; index += 1) {
        const again = await sync(buildManifest(slug, [{ content: '# A\n', path: 'a.md' }]))
        expect(again.status).toBe(200)
        expect(again.json.summary.archive).toBe(0)
      }

      const after = (await findDocsBySource(payload, slug)).find((doc) => doc.sourcePath === 'b.md')
      expect(after?.sync?.archivedAt).toBe(archivedAt)
      expect(
        (
          await payload.countVersions({
            collection: 'docs',
            where: { parent: { equals: archivedB?.id } },
          })
        ).totalDocs,
      ).toBe(versionsBefore.totalDocs)
    })

    test('a manifest with assets: [] archives every existing asset', async () => {
      const slug = uniqueSlug('assets-empty')
      await createDocsSet(payload, slug)
      const skill = {
        content: '# Skill\n',
        contentType: 'text/markdown; charset=utf-8',
        kind: 'skill',
        path: `skills/${slug}/codex/SKILL.md`,
      }
      const withAssets = await sync(
        buildManifest(slug, [{ content: '# A\n', path: 'a.md' }], { assets: [skill] }),
      )
      expect(withAssets.status).toBe(200)

      const skillUrl = `http://localhost:3000/${slug}/skills/codex/SKILL.md`
      const getSkill = () =>
        callGet({
          path: '/:routeBase*/skills/:agent/:assetPath*',
          payload,
          routeParams: { agent: 'codex', assetPath: ['SKILL.md'], routeBase: [slug] },
          url: skillUrl,
        })
      expect((await getSkill()).status).toBe(200)

      const emptied = await sync(
        buildManifest(slug, [{ content: '# A\n', path: 'a.md' }], { assets: [] }),
      )
      expect(emptied.status).toBe(200)
      expect(emptied.json.summary.assetArchive).toBe(1)
      expect((await getSkill()).status).toBe(404)
    })
  })

  describe('plugin collection access (DOCS-6)', () => {
    test('non-admin authenticated users cannot register sync keys or touch nonces', async () => {
      const adminCollection = payload.config.admin.user
      const customer = { id: 999, collection: 'customers', email: 'c@example.com' }

      await expect(
        payload.create({
          collection: 'docs-access',
          data: {
            accessType: 'ed25519',
            keyId: uniqueSlug('evil'),
            publicKey: 'ssh-ed25519 AAAA',
            title: 'evil',
          } as never,
          overrideAccess: false,
          user: customer as never,
        }),
      ).rejects.toThrow()

      await expect(
        payload.find({
          collection: 'docs-sync-nonces',
          overrideAccess: false,
          user: customer as never,
        }),
      ).rejects.toThrow()

      const adminUser = { id: 1, collection: adminCollection, email: 'a@example.com' }
      const created = await payload.create({
        collection: 'docs-access',
        data: {
          accessType: 'ed25519',
          keyId: uniqueSlug('admin-key'),
          publicKey: 'ssh-ed25519 AAAA',
          title: 'admin key',
        } as never,
        overrideAccess: false,
        user: adminUser as never,
      })
      expect(created.id).toBeDefined()

      // Replay nonces are read-only for every human, admins included.
      await expect(
        payload.delete({
          collection: 'docs-sync-nonces',
          overrideAccess: false,
          user: adminUser as never,
          where: { id: { exists: true } },
        }),
      ).rejects.toThrow()
    })
  })

  describe('replay protection and pre-auth surface (DOCS-7, DOCS-8, DOCS-15)', () => {
    test('concurrent requests with one nonce: exactly one is accepted', async () => {
      const slug = uniqueSlug('race')
      await createDocsSet(payload, slug)
      const manifest = buildManifest(slug, [{ content: '# A\n', path: 'a.md' }], {
        mode: 'dry-run',
      })
      const nonce = `race-${uniqueSlug('n')}`
      const timestamp = new Date()
      const results = await Promise.all(
        [1, 2, 3, 4].map(() => sync(manifest, { nonce, timestamp })),
      )

      expect(results.map((result) => result.status).sort()).toEqual([200, 409, 409, 409])
      const rows = await payload.find({
        collection: 'docs-sync-nonces',
        overrideAccess: true,
        where: { nonce: { equals: nonce } },
      })
      expect(rows.totalDocs).toBe(1)
    })

    test('a nonce is consumed even when the request is rejected after authentication', async () => {
      const slug = uniqueSlug('burn')
      await createDocsSet(payload, slug)
      const nonce = `burn-${uniqueSlug('n')}`
      const timestamp = new Date()
      const invalid = buildManifest(slug, [{ content: '# A\n', path: '../escape.md' }])

      const first = await sync(invalid, { nonce, timestamp })
      expect(first.status).toBe(400)
      expect(first.json.error.code).toBe('invalid_manifest')
      expect(first.json.error.issues).toContainEqual(
        expect.objectContaining({
          code: 'path_traversal',
          path: '../escape.md',
          severity: 'error',
        }),
      )

      const replay = await sync(invalid, { nonce, timestamp })
      expect(replay.status).toBe(409)
      expect(replay.json.error.code).toBe('nonce_replay')
    })

    test('prepareDocsSyncMigration lets the unique nonce index be created on old data', async () => {
      // Installs before 1.1 had no unique (keyId, nonce) index, so duplicates can exist.
      const db = payload.db as unknown as { drizzle: { execute: (query: unknown) => Promise<unknown> } }
      const keyId = uniqueSlug('legacy-key')
      const createIndex = sql`CREATE UNIQUE INDEX IF NOT EXISTS "keyId_nonce_idx" ON "docs_sync_nonces" USING btree ("key_id","nonce")`
      const insert = (nonce: string, expiresAt: Date) =>
        payload.create({
          collection: 'docs-sync-nonces',
          data: { expiresAt: expiresAt.toISOString(), keyId, nonce },
          overrideAccess: true,
        })
      const past = new Date(Date.now() - 60_000)
      const future = new Date(Date.now() + 60 * 60_000)

      await db.drizzle.execute(sql`DROP INDEX "keyId_nonce_idx"`)
      try {
        await insert('expired', past)
        await insert('expired', past)
        const kept = await insert('live', future)
        await insert('live', future)
        await insert('other', future)

        await expect(db.drizzle.execute(createIndex)).rejects.toThrow()

        const result = await prepareDocsSyncMigration({ payload })
        expect(result.expiredNoncesRemoved).toBeGreaterThanOrEqual(2)
        expect(result.duplicateNoncesRemoved).toBe(1)

        const rows = await payload.find({
          collection: 'docs-sync-nonces',
          overrideAccess: true,
          sort: 'nonce',
          where: { keyId: { equals: keyId } },
        })
        expect(rows.docs.map((doc) => doc.nonce)).toEqual(['live', 'other'])
        expect(rows.docs[0]?.id).toBe(kept.id)

        await expect(prepareDocsSyncMigration({ payload })).resolves.toEqual({
          duplicateNoncesRemoved: 0,
          expiredNoncesRemoved: 0,
        })
      } finally {
        await db.drizzle.execute(createIndex)
      }
    })

    test('unauthenticated requests get the same answer for existing and missing docs sets', async () => {
      const slug = uniqueSlug('oracle')
      await createDocsSet(payload, slug)
      const responses = await Promise.all(
        [slug, 'does-not-exist'].map((id) =>
          callRawSync({ body: JSON.stringify({ source: { id }, version: 1 }), payload }),
        ),
      )

      expect(responses.map((response) => response.status)).toEqual([401, 401])
      expect(responses[0]?.json).toEqual(responses[1]?.json)
    })

    test('non-slug source ids are rejected without echoing them', async () => {
      for (const id of [{ like: '%' }, ['a', 'b'], 12345, { equals: 'x' }, 'x'.repeat(100_000)]) {
        const response = await callRawSync({
          body: JSON.stringify({ source: { id }, version: 1 }),
          payload,
        })

        expect(response.status).toBe(400)
        expect(JSON.stringify(response.json).length).toBeLessThan(400)
      }
    })
  })

  describe('credential scope (DOCS-5)', () => {
    test('an Ed25519 key limited to one docs set cannot sync another', async () => {
      const allowedSlug = uniqueSlug('scope-a')
      const otherSlug = uniqueSlug('scope-b')
      const allowedSet = await createDocsSet(payload, allowedSlug)
      await createDocsSet(payload, otherSlug)
      const scopedKey = createSyncKey()
      await registerSyncKey(payload, scopedKey, { docsSets: [allowedSet.id] })

      const ok = await callSync({
        key: scopedKey,
        manifest: buildManifest(allowedSlug, [{ content: '# A\n', path: 'a.md' }]),
        payload,
      })
      expect(ok.status).toBe(200)

      const denied = await callSync({
        key: scopedKey,
        manifest: buildManifest(otherSlug, [{ content: '# A\n', path: 'a.md' }]),
        payload,
      })
      expect(denied.status).toBe(403)
      expect(denied.json.error.code).toBe('source_not_allowed')
      expect(await findDocsBySource(payload, otherSlug)).toEqual([])
    })
  })

  describe('docs set bookkeeping (DOCS-11)', () => {
    test('a --publish sync does not publish unrelated admin drafts on the docs set', async () => {
      const slug = uniqueSlug('wip')
      const set = await createDocsSet(payload, slug, { description: 'Published description' })
      await payload.update({
        id: set.id,
        collection: 'docs-sets',
        data: { description: 'ADMIN WIP DRAFT - not ready' } as never,
        draft: true,
        overrideAccess: true,
      })

      const result = await sync(buildManifest(slug, [{ content: '# A\n', path: 'a.md' }]))
      expect(result.status).toBe(200)

      const published = await payload.findByID({
        id: set.id,
        collection: 'docs-sets',
        draft: false,
        overrideAccess: true,
      })
      expect(published.description).toBe('Published description')
      expect(published.sync?.lastStatus).toBe('success')

      const latestDraft = await payload.findByID({
        id: set.id,
        collection: 'docs-sets',
        draft: true,
        overrideAccess: true,
      })
      expect(latestDraft.description).toBe('ADMIN WIP DRAFT - not ready')
    })

    test('a --publish sync still publishes a never-published docs set', async () => {
      const slug = uniqueSlug('first-publish')
      await createDocsSet(payload, slug, { _status: 'draft' })
      expect((await sync(buildManifest(slug, [{ content: '# A\n', path: 'a.md' }]))).status).toBe(
        200,
      )
      expect(
        (
          await resolvePayloadMarkdownDocsRoute({ path: `/${slug}/a`, payload: payload as never })
        )?.type,
      ).toBe('doc')
    })
  })

  describe('asset serving policy (DOCS-4)', () => {
    const skillAsset = (slug: string, file: string, content: string, contentType: string) => ({
      content,
      contentType,
      kind: 'skill',
      path: `skills/${slug}/codex/${file}`,
    })
    const getSkillFile = (slug: string, file: string) =>
      callGet({
        path: '/:routeBase*/skills/:agent/:assetPath*',
        payload,
        routeParams: { agent: 'codex', assetPath: [file], routeBase: [slug] },
        url: `http://localhost:3000/${slug}/skills/codex/${file}`,
      })

    test('script-capable asset content types are rejected', async () => {
      const slug = uniqueSlug('xss')
      await createDocsSet(payload, slug)
      const result = await sync(
        buildManifest(slug, [{ content: '# A\n', path: 'a.md' }], {
          assets: [skillAsset(slug, 'x.html', '<script>alert(1)</script>', 'text/html')],
        }),
      )

      expect(result.status).toBe(400)
      expect(result.json.error.issues).toContainEqual(
        expect.objectContaining({ code: 'invalid_asset', path: `skills/${slug}/codex/x.html` }),
      )
      expect((await getSkillFile(slug, 'x.html')).status).toBe(404)
    })

    test('assets from a non-publish sync do not go live until a publish sync', async () => {
      const slug = uniqueSlug('asset-draft')
      await createDocsSet(payload, slug)
      const manifestWith = (publish: boolean) =>
        buildManifest(slug, [{ content: '# A\n', path: 'a.md' }], {
          assets: [skillAsset(slug, 'SKILL.md', '# Skill\n', 'text/markdown; charset=utf-8')],
          publish,
        })

      const draft = await sync(manifestWith(false))
      expect(draft.status).toBe(200)
      expect(draft.json.warnings).toContainEqual(
        expect.objectContaining({ code: 'assets_deferred_until_publish' }),
      )
      expect((await getSkillFile(slug, 'SKILL.md')).status).toBe(404)

      expect((await sync(manifestWith(true))).status).toBe(200)
      const live = await getSkillFile(slug, 'SKILL.md')
      expect(live.status).toBe(200)
      expect(live.headers.get('x-content-type-options')).toBe('nosniff')
      expect(live.headers.get('content-security-policy')).toContain('sandbox')
    })
  })

  describe('manual edit protection (DOCS-21)', () => {
    test('admin edits to synced metadata are reported instead of overwritten', async () => {
      const slug = uniqueSlug('edit')
      await createDocsSet(payload, slug)
      const v1 = '---\ntitle: Guide\ndescription: First\norder: 2\n---\n# Guide\n'
      expect((await sync(buildManifest(slug, [{ content: v1, path: 'guide.md' }]))).status).toBe(
        200,
      )

      // Frontmatter changes made in Git are applied normally.
      const v2 = v1.replace('description: First', 'description: Second')
      expect((await sync(buildManifest(slug, [{ content: v2, path: 'guide.md' }]))).status).toBe(
        200,
      )

      const [doc] = await findDocsBySource(payload, slug)
      await payload.update({
        id: doc?.id,
        collection: 'docs',
        data: { title: 'Edited in CMS' } as never,
        overrideAccess: true,
      })

      const v3 = v2.replace('# Guide', '# Guide\n\nMore.')
      const blocked = await sync(buildManifest(slug, [{ content: v3, path: 'guide.md' }]))
      expect(blocked.status).toBe(409)
      expect(blocked.json.error.code).toBe('manual_edit_conflict')
      expect(blocked.json.conflicts).toContainEqual(
        expect.objectContaining({ reason: 'current_fields_hash_mismatch', sourcePath: 'guide.md' }),
      )
      expect((await findDocsBySource(payload, slug))[0]?.title).toBe('Edited in CMS')
    })
  })

  describe('public visibility (DOCS-1, DOCS-12)', () => {
    test('non-publish (draft) docs never appear in llms.txt / llms-full.txt', async () => {
      const slug = uniqueSlug('vis')
      await createDocsSet(payload, slug)
      const published = await sync(
        buildManifest(slug, [{ content: '# Public\n\nPUBLIC-CONTENT\n', path: 'public.md' }]),
      )
      expect(published.status).toBe(200)

      const draft = await sync(
        buildManifest(
          slug,
          [
            { content: '# Public\n\nPUBLIC-CONTENT\n', path: 'public.md' },
            { content: '# Secret Draft\n\nUNRELEASED-CONTENT-123\n', path: 'secret.md' },
          ],
          { publish: false },
        ),
      )
      expect(draft.status).toBe(200)

      const route = await resolvePayloadMarkdownDocsRoute({
        path: `/${slug}/secret`,
        payload: payload as never,
      })
      expect(route).toBeNull()

      const full = await getLlms(slug, 'llms-full.txt')
      expect(full.status).toBe(200)
      expect(full.text).toContain('PUBLIC-CONTENT')
      expect(full.text).not.toContain('UNRELEASED-CONTENT-123')
      expect(full.text).not.toContain('Secret Draft')

      const spoofed = await callGet({
        headers: { host: 'docs.example.com', 'x-forwarded-host': 'evil.example' },
        path: '/:routeBase*/llms-full.txt',
        payload,
        url: `http://docs.example.com/${slug}/llms-full.txt`,
      })
      // Forwarded headers are ignored unless endpoint.trustForwardedHeaders (DOCS-18).
      expect(await spoofed.text()).not.toContain('evil.example')

      const index = await getLlms(slug, 'llms.txt')
      expect(index.text).not.toContain('Secret Draft')

      const rootFull = await callGet({
        path: '/llms-full.txt',
        payload,
        url: 'http://localhost:3000/llms-full.txt',
      })
      expect(await rootFull.text()).not.toContain('UNRELEASED-CONTENT-123')
    })

    test('draft-only docs sets are not served by llms endpoints or the root index', async () => {
      const slug = uniqueSlug('vis-set')
      await createDocsSet(payload, slug, { _status: 'draft' })
      await payload.create({
        collection: 'docs',
        data: {
          _status: 'published',
          content: '# Hidden set doc\n\nHIDDEN-SET-CONTENT\n',
          docsSet: undefined,
          route: `/${slug}/page`,
          sourcePath: 'page.md',
          sync: { managedBy: 'payload-markdown-docs', sourceId: slug },
          title: 'Hidden set doc',
        } as never,
        overrideAccess: true,
      })

      expect((await getLlms(slug, 'llms-full.txt')).status).toBe(404)

      const rootIndex = await callGet({
        path: '/llms.txt',
        payload,
        url: 'http://localhost:3000/llms.txt',
      })
      expect(await rootIndex.text()).not.toContain(`/${slug}`)
    })

    test('sitemap excludes draft-only docs', async () => {
      const { getDocsForSitemap } = await import('../src/next/sitemap.js')
      const slug = uniqueSlug('sitemap')
      const set = await createDocsSet(payload, slug)
      await payload.create({
        collection: 'docs',
        data: {
          _status: 'draft',
          content: '# Draft',
          docsSet: set.id,
          route: `/${slug}/draft-only`,
          sourcePath: 'draft-only.md',
          sync: { managedBy: 'payload-markdown-docs', sourceId: slug },
          title: 'Draft only',
        } as never,
        draft: true,
        overrideAccess: true,
      })
      await payload.create({
        collection: 'docs',
        data: {
          _status: 'published',
          content: '# Live',
          docsSet: set.id,
          route: `/${slug}/live`,
          sourcePath: 'live.md',
          sync: { managedBy: 'payload-markdown-docs', sourceId: slug },
          title: 'Live',
        } as never,
        overrideAccess: true,
      })

      const entries = await getDocsForSitemap({
        payload: payload as never,
        siteUrl: 'https://site.test',
      } as never)
      const urls = entries.map((entry) => entry.url)

      expect(urls).toContain(`https://site.test/${slug}/live`)
      expect(urls.some((url) => url.includes('draft-only'))).toBe(false)
    })

    test('selecting _status on a collection without drafts does not throw', async () => {
      await expect(
        payload.find({
          collection: 'posts',
          depth: 0,
          draft: false,
          limit: 1,
          select: { _status: true } as never,
        }),
      ).resolves.toBeDefined()
    })

    test('findDocsBySource helper sees synced docs', async () => {
      const slug = uniqueSlug('helper')
      await createDocsSet(payload, slug)
      await sync(buildManifest(slug, [{ content: '# A\n', path: 'a.md' }]))
      expect((await findDocsBySource(payload, slug)).map((doc) => doc.sourcePath)).toEqual([
        'a.md',
      ])
    })
  })
})
