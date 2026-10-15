import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG } from '../constants.js'
import { isRecord } from '../shared/records.js'
import { createDocsGroupsRouteHooks, createDocsSetsRouteHooks } from './docsRouteHooks.js'
import { DocsRouteCollisionError, rewriteDocsSetRoutes } from './rewriteDocsSetRoutes.js'

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: cacheMocks.revalidatePath,
  revalidateTag: cacheMocks.revalidateTag,
}))

/**
 * In-memory stand-in for the Payload operations the route rewrite and its hooks use. It
 * enforces the unique docs `route` on main rows like the database does and keeps one
 * latest version per doc.
 */
type Row = Record<string, unknown>

const getPath = (row: Row, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => (isRecord(value) ? value[key] : undefined), row)

const matches = (row: Row, where: unknown): boolean => {
  if (!isRecord(where)) {
    return true
  }

  return Object.entries(where).every(([key, condition]) => {
    if (key === 'or') {
      return (condition as unknown[]).some((part) => matches(row, part))
    }

    if (key === 'and') {
      return (condition as unknown[]).every((part) => matches(row, part))
    }

    const value = getPath(row, key)
    const normalized = typeof value === 'number' ? String(value) : value

    if (!isRecord(condition)) {
      return false
    }

    if ('equals' in condition) {
      return String(normalized) === String(condition.equals)
    }

    if ('in' in condition) {
      return (condition.in as unknown[]).map(String).includes(String(normalized))
    }

    return true
  })
}

const createStore = ({
  drafts = true,
  rows,
}: {
  drafts?: boolean
  rows: Record<string, Row[]>
}) => {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(rows).map(([collection, list]) => [collection, list.map((row) => ({ ...row }))]),
  )
  const versions: Row[] = drafts
    ? (tables.docs ?? []).map((row) => ({
        id: `v-${String(row.id)}`,
        latest: true,
        parent: row.id,
        version: { ...row },
      }))
    : []
  const writes: { collection: string; data: Row; id: number | string }[] = []

  const payload = {
    collections: {
      docs: { config: { versions: drafts ? { drafts: true } : false } },
    },
    db: {
      findOne: ({ collection, where }: { collection: string; where: unknown }) =>
        Promise.resolve((tables[collection] ?? []).find((row) => matches(row, where)) ?? null),
      findVersions: ({ where }: { where?: unknown }) =>
        Promise.resolve({ docs: versions.filter((row) => matches(row, where)) }),
      updateOne: ({ id, collection, data }: { collection: string; data: Row; id: number | string }) => {
        const table = tables[collection] ?? []
        const row = table.find((candidate) => String(candidate.id) === String(id))

        if (!row) {
          return Promise.reject(new Error(`missing ${collection} ${String(id)}`))
        }

        if (
          collection === 'docs' &&
          typeof data.route === 'string' &&
          table.some((other) => other !== row && other.route === data.route)
        ) {
          return Promise.reject(new Error(`unique violation: ${data.route}`))
        }

        writes.push({ id, collection, data })
        Object.assign(row, data)

        return Promise.resolve(row)
      },
      updateVersion: ({ id, versionData }: { id: number | string; versionData: Row }) => {
        const version = versions.find((row) => row.id === id)

        if (version && isRecord(version.version) && isRecord(versionData.version)) {
          Object.assign(version.version, versionData.version)
        }

        return Promise.resolve(version)
      },
    },
    find: ({ collection, where }: { collection: string; where?: unknown }) =>
      Promise.resolve({ docs: (tables[collection] ?? []).filter((row) => matches(row, where)) }),
  }

  return {
    payload,
    route: (collection: string, id: string) =>
      (tables[collection] ?? []).find((row) => String(row.id) === id)?.route,
    tables,
    versionRoute: (id: string) => {
      const version = versions.find((row) => String(row.parent) === id)

      return isRecord(version?.version) ? version.version.route : undefined
    },
    writes,
  }
}

const doc = (id: string, docsSet: string, route: string, sourcePath: string, extra: Row = {}) => ({
  id,
  _status: 'published',
  docsSet,
  route,
  sourcePath,
  sync: { sourceId: docsSet },
  ...extra,
})

const hookOptions = {
  docsAssetsCollectionSlug: 'assets',
  docsCollectionSlug: 'docs',
  docsGroupsCollectionSlug: 'docs-groups',
  docsSetsCollectionSlug: 'docs-sets',
}

const tagCalls = () => cacheMocks.revalidateTag.mock.calls as [string, unknown][]

beforeEach(() => {
  cacheMocks.revalidatePath.mockClear()
  cacheMocks.revalidateTag.mockClear()
})

describe('rewriteDocsSetRoutes', () => {
  it('rewrites docs (main rows and latest drafts) and assets of the target set only', async () => {
    const store = createStore({
      rows: {
        assets: [
          {
            id: 'a1',
            docsSet: 'x',
            kind: 'skill',
            route: '/a/x/skills/claude/SKILL.md',
            sourceId: 'x',
            sourcePath: 'skills/x/claude/SKILL.md',
          },
          { id: 'a2', docsSet: 'x', kind: 'llms', route: '/llms.txt', sourcePath: 'llms.txt' },
        ],
        docs: [
          doc('1', 'x', '/a/x', 'index.md'),
          doc('2', 'x', '/a/x/guide', 'guide.md', { _status: 'draft' }),
          doc('3', 'x', 'archived:3:/a/x/old', 'old.md'),
          doc('4', 'y', '/a/y/guide', 'guide.md'),
        ],
      },
    })

    const result = await rewriteDocsSetRoutes({
      collections: { docs: 'docs', docsAssets: 'assets' },
      payload: store.payload,
      targets: [
        {
          docsSetId: 'x',
          hints: [{ productRoute: '/a/x', routeBase: '/a/x' }],
          routes: { productRoute: '/b/x', routeBase: '/b/x' },
        },
      ],
    })

    expect(store.route('docs', '1')).toBe('/b/x')
    expect(store.route('docs', '2')).toBe('/b/x/guide')
    expect(store.route('docs', '3')).toBe('archived:3:/b/x/old')
    expect(store.route('docs', '4')).toBe('/a/y/guide')
    expect(store.versionRoute('2')).toBe('/b/x/guide')
    expect(store.versionRoute('4')).toBe('/a/y/guide')
    expect(store.route('assets', 'a1')).toBe('/b/x/skills/claude/SKILL.md')
    expect(store.route('assets', 'a2')).toBe('/llms.txt')
    expect(result.sets[0]).toMatchObject({ assets: 1, docs: 3, unresolved: [], versions: 3 })
    expect(result.paths).toEqual(expect.arrayContaining(['/a/x/guide', '/b/x/guide', '/a/x', '/b/x']))
  })

  it('swaps two docs sets without a transient unique-route collision', async () => {
    const store = createStore({
      rows: {
        docs: [
          doc('1', 'x', '/one', 'index.md'),
          doc('2', 'x', '/one/guide', 'guide.md'),
          doc('3', 'y', '/two', 'index.md'),
          doc('4', 'y', '/two/guide', 'guide.md'),
        ],
      },
    })

    await rewriteDocsSetRoutes({
      collections: { docs: 'docs' },
      payload: store.payload,
      targets: [
        {
          docsSetId: 'x',
          hints: [{ productRoute: '/one', routeBase: '/one' }],
          routes: { productRoute: '/two', routeBase: '/two' },
        },
        {
          docsSetId: 'y',
          hints: [{ productRoute: '/two', routeBase: '/two' }],
          routes: { productRoute: '/one', routeBase: '/one' },
        },
      ],
    })

    expect(['1', '2', '3', '4'].map((id) => store.route('docs', id))).toEqual([
      '/two',
      '/two/guide',
      '/one',
      '/one/guide',
    ])
  })

  it('parks docs whose target is still held by another moving doc (docs-root -> product-nested)', async () => {
    const store = createStore({
      rows: {
        docs: [doc('1', 'x', '/x/y', 'y.md'), doc('2', 'x', '/x/docs/y', 'docs/y.md')],
      },
    })

    await rewriteDocsSetRoutes({
      collections: { docs: 'docs' },
      payload: store.payload,
      targets: [
        {
          docsSetId: 'x',
          hints: [{ productRoute: '/x', routeBase: '/x' }],
          routes: { productRoute: '/x', routeBase: '/x/docs' },
        },
      ],
    })

    expect(store.route('docs', '1')).toBe('/x/docs/y')
    expect(store.route('docs', '2')).toBe('/x/docs/docs/y')
    expect(store.writes.some((write) => String(write.data.route).startsWith('rewriting:'))).toBe(true)
  })

  it('refuses (throw) or skips (repair) moves onto a route held by another docs set', async () => {
    const rows = {
      docs: [
        doc('1', 'x', '/a/x/guide', 'guide.md'),
        doc('2', 'x', '/a/x/other', 'other.md'),
        doc('9', 'z', '/b/x/guide', 'guide.md'),
      ],
    }
    const target = {
      docsSetId: 'x',
      hints: [{ productRoute: '/a/x', routeBase: '/a/x' }],
      routes: { productRoute: '/b/x', routeBase: '/b/x' },
    }
    const throwing = createStore({ rows })

    await expect(
      rewriteDocsSetRoutes({
        collections: { docs: 'docs' },
        payload: throwing.payload,
        targets: [target],
      }),
    ).rejects.toBeInstanceOf(DocsRouteCollisionError)
    expect(throwing.writes).toEqual([])

    const skipping = createStore({ rows })
    const result = await rewriteDocsSetRoutes({
      collections: { docs: 'docs' },
      onCollision: 'skip',
      payload: skipping.payload,
      targets: [target],
    })

    expect(skipping.route('docs', '1')).toBe('/a/x/guide')
    expect(skipping.route('docs', '2')).toBe('/b/x/other')
    expect(result.sets[0]?.collisions).toEqual([{ id: '1', holderId: '9', route: '/b/x/guide' }])
  })

  it('repairs already-stale routes without hints (inference)', async () => {
    const store = createStore({
      rows: {
        docs: [
          doc('1', 'x', '/old/x', 'index.md'),
          doc('2', 'x', '/old/x/guide/intro', 'guide/intro.md'),
          doc('3', 'x', '/old/x/custom', 'page.md'),
        ],
      },
    })

    await rewriteDocsSetRoutes({
      collections: { docs: 'docs' },
      onCollision: 'skip',
      payload: store.payload,
      targets: [{ docsSetId: 'x', routes: { productRoute: '/new/x', routeBase: '/new/x' } }],
    })

    expect(['1', '2', '3'].map((id) => store.route('docs', id))).toEqual([
      '/new/x',
      '/new/x/guide/intro',
      '/new/x/custom',
    ])
  })
})

const groupsAndSets = (extraDocs: Row[] = []) =>
  createStore({
    rows: {
      assets: [],
      docs: [
        doc('1', 'x', '/plugins/x', 'index.md'),
        doc('2', 'x', '/plugins/x/guide', 'guide.md'),
        doc('3', 'y', '/y', 'index.md'),
        ...extraDocs,
      ],
      'docs-groups': [
        { id: 'g1', slug: 'plugins', title: 'Plugins' },
        { id: 'g2', slug: 'tools', title: 'Tools' },
      ],
      'docs-sets': [
        { id: 'x', slug: 'x', _status: 'published', group: 'g1', title: 'X' },
        { id: 'y', slug: 'y', _status: 'published', title: 'Y' },
      ],
    },
  })

const hookReq = (store: ReturnType<typeof createStore>, context: Row = {}) =>
  ({ context, payload: store.payload }) as never

const setRow = (store: ReturnType<typeof createStore>, index: number): Row =>
  store.tables['docs-sets'][index]

const groupRow = (store: ReturnType<typeof createStore>, index: number): Row =>
  store.tables['docs-groups'][index]

describe('docs set hooks', () => {
  it("rewrites the set's docs when its group changes and expires the nav tag immediately", async () => {
    const store = groupsAndSets()
    const hooks = createDocsSetsRouteHooks(hookOptions)
    const req = hookReq(store)
    const previousDoc = { ...setRow(store, 0) }

    await hooks.beforeChange({ data: {}, operation: 'update', originalDoc: previousDoc, req } as never)
    Object.assign(setRow(store, 0), { group: 'g2' })
    await hooks.afterChange({ doc: setRow(store, 0), operation: 'update', previousDoc, req } as never)

    expect(store.route('docs', '1')).toBe('/tools/x')
    expect(store.route('docs', '2')).toBe('/tools/x/guide')
    expect(store.route('docs', '3')).toBe('/y')
    expect(tagCalls()).toContainEqual([PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG, { expire: 0 }])
    expect(tagCalls().every(([, profile]) => profile !== 'max')).toBe(true)
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith('/plugins/x/guide')
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith('/tools/x/guide')
  })

  it('rewrites on slug and routeMode changes', async () => {
    const store = groupsAndSets()
    const hooks = createDocsSetsRouteHooks(hookOptions)
    const previousDoc = { ...setRow(store, 0) }

    Object.assign(setRow(store, 0), { slug: 'x2', routeMode: 'product-nested' })
    await hooks.afterChange({
      doc: setRow(store, 0),
      operation: 'update',
      previousDoc,
      req: hookReq(store),
    } as never)

    expect(store.route('docs', '1')).toBe('/plugins/x2/docs')
    expect(store.route('docs', '2')).toBe('/plugins/x2/docs/guide')
  })

  it('leaves routes and caches alone for a draft saved over a published set', async () => {
    const store = groupsAndSets()
    const hooks = createDocsSetsRouteHooks(hookOptions)
    const previousDoc = { ...setRow(store, 0) }

    await hooks.afterChange({
      doc: { ...previousDoc, _status: 'draft', group: 'g2' },
      operation: 'update',
      previousDoc,
      req: hookReq(store),
    } as never)

    expect(store.route('docs', '1')).toBe('/plugins/x')
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalled()
  })

  it('expires the nav tag when a set is deleted, unless revalidation is disabled', async () => {
    const store = groupsAndSets()
    const hooks = createDocsSetsRouteHooks(hookOptions)

    await hooks.afterDelete({
      id: 'y',
      doc: setRow(store, 1),
      req: hookReq(store, { disableRevalidate: true }),
    } as never)
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalled()

    await hooks.afterDelete({ id: 'y', doc: setRow(store, 1), req: hookReq(store) } as never)
    expect(tagCalls()).toContainEqual([PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG, { expire: 0 }])
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith('/y')
  })

  it('skips the rewrite with the payloadMarkdownDocsSkipRouteRewrite context flag', async () => {
    const store = groupsAndSets()
    const hooks = createDocsSetsRouteHooks(hookOptions)
    const previousDoc = { ...setRow(store, 0) }

    Object.assign(setRow(store, 0), { group: 'g2' })
    await hooks.afterChange({
      doc: setRow(store, 0),
      operation: 'update',
      previousDoc,
      req: hookReq(store, { payloadMarkdownDocsSkipRouteRewrite: true }),
    } as never)

    expect(store.route('docs', '1')).toBe('/plugins/x')
    expect(tagCalls()).toContainEqual([PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG, { expire: 0 }])
  })
})

describe('docs group hooks', () => {
  it('rewrites sets below a group whose slug changes and leaves other sets alone', async () => {
    const store = groupsAndSets()
    const hooks = createDocsGroupsRouteHooks(hookOptions)
    const previousDoc = { ...groupRow(store, 0) }

    Object.assign(groupRow(store, 0), { slug: 'packages' })
    await hooks.afterChange({
      doc: groupRow(store, 0),
      operation: 'update',
      previousDoc,
      req: hookReq(store),
    } as never)

    expect(store.route('docs', '2')).toBe('/packages/x/guide')
    expect(store.route('docs', '3')).toBe('/y')
    expect(tagCalls()).toContainEqual([PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG, { expire: 0 }])
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith('/plugins')
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith('/packages')
  })

  it('rewrites sets when a group moves under another parent', async () => {
    const store = groupsAndSets()
    const hooks = createDocsGroupsRouteHooks(hookOptions)
    const previousDoc = { ...groupRow(store, 0) }

    Object.assign(groupRow(store, 0), { parent: 'g2' })
    await hooks.afterChange({
      doc: groupRow(store, 0),
      operation: 'update',
      previousDoc,
      req: hookReq(store),
    } as never)

    expect(store.route('docs', '2')).toBe('/tools/plugins/x/guide')
  })

  it('rewrites sets whose group is deleted (relationship cleared by the database)', async () => {
    const store = groupsAndSets()
    const hooks = createDocsGroupsRouteHooks(hookOptions)
    const req = hookReq(store)
    const deleted = groupRow(store, 0)

    await hooks.beforeDelete({ id: 'g1', req } as never)
    store.tables['docs-groups'] = store.tables['docs-groups'].filter((group) => group !== deleted)
    setRow(store, 0).group = null
    await hooks.afterDelete({ id: 'g1', doc: deleted, req } as never)

    expect(store.route('docs', '1')).toBe('/x')
    expect(store.route('docs', '2')).toBe('/x/guide')
    expect(tagCalls()).toContainEqual([PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG, { expire: 0 }])
  })

  it('aborts a group change that would move docs onto another set\'s routes', async () => {
    // Renaming group "plugins" to "y" would move set x's guide onto /y/x... and set y
    // already serves /y/x/guide (a page whose source path is x/guide.md).
    const store = groupsAndSets([doc('4', 'y', '/y/x/guide', 'x/guide.md')])
    const hooks = createDocsGroupsRouteHooks(hookOptions)
    const previousDoc = { ...groupRow(store, 0) }

    Object.assign(groupRow(store, 0), { slug: 'y' })

    await expect(
      hooks.afterChange({
        doc: groupRow(store, 0),
        operation: 'update',
        previousDoc,
        req: hookReq(store),
      } as never),
    ).rejects.toBeInstanceOf(DocsRouteCollisionError)
    expect(store.writes).toEqual([])
  })
})
