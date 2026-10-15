/**
 * Real-Postgres tests for the docs route rewrite (docs set / docs group hooks) and the
 * `repairDocsRoutes` repair: stored docs routes follow docs set route changes, with the
 * real unique `route` index, drafts/versions and transactions.
 *
 * Gated on PAYLOAD_MARKDOWN_DOCS_RUN_DB_TESTS=1 (and DATABASE_URL). The hooks come from
 * the dev config, which imports `../dist`: run `pnpm build` first.
 */
import type { Payload } from 'payload'

import config from '@payload-config'
import { createLocalReq, getPayload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import { repairDocsRoutes } from '../src/migrations/index.js'
import { resolvePayloadMarkdownDocsRoute } from '../src/next/route.js'
import {
  buildManifest,
  callSync,
  createDocsSet,
  createSyncKey,
  findDocsBySource,
  registerSyncKey,
  runDbTests,
  type SyncKey,
  uniqueSlug,
} from './helpers/syncHarness.js'

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: cacheMocks.revalidatePath,
  revalidateTag: cacheMocks.revalidateTag,
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

const describeDb = runDbTests ? describe : describe.skip

let payload: Payload
let key: SyncKey

const files = [
  { content: '# Home\n', path: 'index.md' },
  { content: '# Guide\n', path: 'guide.md' },
  { content: '# Nested\n', path: 'docs/nested.md' },
]

const createGroup = async (slug: string, data: Record<string, unknown> = {}) =>
  payload.create({
    collection: 'docs-groups',
    data: { slug, title: slug, ...data } as never,
    overrideAccess: true,
  })

const syncSet = async (slug: string, extra: Record<string, unknown> = {}) => {
  const result = await callSync({ key, manifest: buildManifest(slug, files, extra), payload })

  expect(result.status, JSON.stringify(result.json)).toBe(200)
}

/** Live routes by source path: main rows (published) or latest versions (draft). */
const routesOf = async (slug: string, draft = false) =>
  Object.fromEntries(
    (await findDocsBySource(payload, slug, draft))
      .filter((doc) => doc.sync?.archived !== true)
      .map((doc) => [doc.sourcePath, doc.route]),
  )

const updateSet = (id: number | string, data: Record<string, unknown>, context = {}) =>
  payload.update({
    id,
    collection: 'docs-sets',
    context,
    data: data as never,
    draft: false,
    overrideAccess: true,
  })

const navTagExpired = () =>
  cacheMocks.revalidateTag.mock.calls.some(
    ([tag, profile]) =>
      tag === 'payload-markdown-docs:nav' && JSON.stringify(profile) === JSON.stringify({ expire: 0 }),
  )

describeDb('docs route rewrite (real DB)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
    key = createSyncKey()
    await registerSyncKey(payload, key)
  })

  afterAll(async () => {
    await payload?.destroy()
  })

  beforeEach(() => {
    cacheMocks.revalidatePath.mockClear()
    cacheMocks.revalidateTag.mockClear()
  })

  test("changing a docs set's group rewrites its docs (published and draft) and expires the nav", async () => {
    const [from, to] = [await createGroup(uniqueSlug('from')), await createGroup(uniqueSlug('to'))]
    const slug = uniqueSlug('set')
    const other = uniqueSlug('other')
    const docsSet = await createDocsSet(payload, slug, { group: from.id })

    await createDocsSet(payload, other, { group: from.id })
    await syncSet(slug)
    await syncSet(other)
    // A non-publish sync leaves a newer draft version on guide.md.
    expect(
      (
        await callSync({
          key,
          manifest: buildManifest(
            slug,
            [files[0], { content: '# Guide v2\n', path: 'guide.md' }, files[2]],
            { publish: false },
          ),
          payload,
        })
      ).status,
    ).toBe(200)

    await updateSet(docsSet.id, { group: to.id })

    const expected = {
      'docs/nested.md': `/${to.slug}/${slug}/docs/nested`,
      'guide.md': `/${to.slug}/${slug}/guide`,
      'index.md': `/${to.slug}/${slug}`,
    }

    expect(await routesOf(slug)).toEqual(expected)
    expect(await routesOf(slug, true)).toEqual(expected)
    expect(await routesOf(other)).toEqual({
      'docs/nested.md': `/${from.slug}/${other}/docs/nested`,
      'guide.md': `/${from.slug}/${other}/guide`,
      'index.md': `/${from.slug}/${other}`,
    })
    expect(navTagExpired()).toBe(true)
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(`/${from.slug}/${slug}/guide`)
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith(`/${to.slug}/${slug}/guide`)

    const resolved = await resolvePayloadMarkdownDocsRoute({
      path: `/${to.slug}/${slug}/guide`,
      payload: payload as never,
    })
    expect(resolved?.type).toBe('doc')

    // Publishing the draft from the admin keeps the new route.
    const guide = (await findDocsBySource(payload, slug)).find((doc) => doc.sourcePath === 'guide.md')!
    await payload.update({
      id: guide.id,
      collection: 'docs',
      data: { _status: 'published' } as never,
      draft: false,
      overrideAccess: true,
    })
    expect((await routesOf(slug))['guide.md']).toBe(`/${to.slug}/${slug}/guide`)

    // The next sync finds nothing to move.
    const resync = await callSync({ key, manifest: buildManifest(slug, files), payload })
    expect(resync.status).toBe(200)
    expect(await routesOf(slug)).toEqual(expected)
  })

  test('routeMode switches swap nested routes without unique collisions', async () => {
    const slug = uniqueSlug('nest')
    const docsSet = await createDocsSet(payload, slug)
    const nestedFiles = [...files, { content: '# Docs guide\n', path: 'docs/guide.md' }]

    expect(
      (await callSync({ key, manifest: buildManifest(slug, nestedFiles), payload })).status,
    ).toBe(200)

    // guide.md moves onto /<slug>/docs/guide, the current route of docs/guide.md, which
    // moves on to /<slug>/docs/docs/guide in the same transaction.
    await updateSet(docsSet.id, { routeMode: 'product-nested' })
    expect(await routesOf(slug)).toEqual({
      'docs/guide.md': `/${slug}/docs/docs/guide`,
      'docs/nested.md': `/${slug}/docs/docs/nested`,
      'guide.md': `/${slug}/docs/guide`,
      'index.md': `/${slug}/docs`,
    })

    // And back: docs/guide.md needs the route guide.md is leaving.
    await updateSet(docsSet.id, { routeMode: 'docs-root' })
    expect(await routesOf(slug)).toEqual({
      'docs/guide.md': `/${slug}/docs/guide`,
      'docs/nested.md': `/${slug}/docs/nested`,
      'guide.md': `/${slug}/guide`,
      'index.md': `/${slug}`,
    })

    await updateSet(docsSet.id, { slug: `${slug}-renamed` })
    expect((await routesOf(slug))['guide.md']).toBe(`/${slug}-renamed/guide`)
  })

  test("changing a group's slug or parent, or deleting it, rewrites the sets below it", async () => {
    const parent = await createGroup(uniqueSlug('parent'))
    const group = await createGroup(uniqueSlug('group'))
    const slug = uniqueSlug('grouped')

    await createDocsSet(payload, slug, { group: group.id })
    await syncSet(slug)

    const renamed = uniqueSlug('renamed')
    await payload.update({
      id: group.id,
      collection: 'docs-groups',
      data: { slug: renamed } as never,
      overrideAccess: true,
    })
    expect((await routesOf(slug))['guide.md']).toBe(`/${renamed}/${slug}/guide`)
    expect(navTagExpired()).toBe(true)

    await payload.update({
      id: group.id,
      collection: 'docs-groups',
      data: { parent: parent.id } as never,
      overrideAccess: true,
    })
    expect((await routesOf(slug))['guide.md']).toBe(`/${parent.slug}/${renamed}/${slug}/guide`)

    await payload.delete({ id: parent.id, collection: 'docs-groups', overrideAccess: true })
    expect((await routesOf(slug))['guide.md']).toBe(`/${renamed}/${slug}/guide`)
  })

  test('a change that would collide with another docs set is rejected and rolled back', async () => {
    const owner = uniqueSlug('owner')
    const mover = uniqueSlug('mover')

    // The owner set serves /<owner>/<mover>/guide (source path <mover>/guide.md).
    await createDocsSet(payload, owner)
    expect(
      (
        await callSync({
          key,
          manifest: buildManifest(owner, [{ content: '# X\n', path: `${mover}/guide.md` }]),
          payload,
        })
      ).status,
    ).toBe(200)

    const moverSet = await createDocsSet(payload, mover)
    await syncSet(mover)

    // Moving the mover set into a group named like the owner set would put its guide on
    // the owner's route.
    const group = await createGroup(owner)

    await expect(updateSet(moverSet.id, { group: group.id })).rejects.toThrow(/already in use/)

    expect((await routesOf(mover))['guide.md']).toBe(`/${mover}/guide`)
    expect((await routesOf(owner))[`${mover}/guide.md`]).toBe(`/${owner}/${mover}/guide`)
    const stored = await payload.findByID({ id: moverSet.id, collection: 'docs-sets', depth: 0 })
    expect(stored.group ?? null).toBeNull()
  })

  test('an MCP agent changing a docs set group still rewrites the (Git-owned) doc routes', async () => {
    const group = await createGroup(uniqueSlug('agent'))
    const slug = uniqueSlug('agentset')
    const docsSet = await createDocsSet(payload, slug)

    await syncSet(slug)

    const req = await createLocalReq({}, payload)
    ;(req as { payloadAPI: string }).payloadAPI = 'MCP'

    await payload.update({
      id: docsSet.id,
      collection: 'docs-sets',
      data: { group: group.id } as never,
      draft: false,
      overrideAccess: true,
      req,
    })

    expect((await routesOf(slug))['guide.md']).toBe(`/${group.slug}/${slug}/guide`)
  })

  test('repairDocsRoutes fixes routes that went stale before the hooks existed', async () => {
    const group = await createGroup(uniqueSlug('stale'))
    const slug = uniqueSlug('repair')
    const docsSet = await createDocsSet(payload, slug)

    await syncSet(slug)
    // Simulate pre-fix data: the group changes without the rewrite.
    await updateSet(docsSet.id, { group: group.id }, { payloadMarkdownDocsSkipRouteRewrite: true })
    expect((await routesOf(slug))['guide.md']).toBe(`/${slug}/guide`)

    const dryRun = await repairDocsRoutes({ docsSetId: docsSet.id, dryRun: true, payload })
    expect(dryRun.sets[0]).toMatchObject({ collisions: [], docs: 3, unresolved: [] })
    expect((await routesOf(slug))['guide.md']).toBe(`/${slug}/guide`)

    const result = await repairDocsRoutes({ payload })
    expect(result.sets.find((set) => set.docsSetId === String(docsSet.id))).toMatchObject({ docs: 3 })
    expect(await routesOf(slug)).toEqual({
      'docs/nested.md': `/${group.slug}/${slug}/docs/nested`,
      'guide.md': `/${group.slug}/${slug}/guide`,
      'index.md': `/${group.slug}/${slug}`,
    })
    expect(await routesOf(slug, true)).toEqual(await routesOf(slug))

    // Idempotent.
    const again = await repairDocsRoutes({ docsSetId: docsSet.id, payload })
    expect(again.sets[0]).toMatchObject({ docs: 0, versions: 0 })
  })
})
