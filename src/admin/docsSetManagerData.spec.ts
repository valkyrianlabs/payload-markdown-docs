import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import type { DocsSetManagerPayloadOperations } from './docsSetManagerTypes.js'

import {
  buildDocsSetManagerData,
  getDocsSetManagerData,
  getGeneratedDocAdminURL,
  isDocsRecordForDocsSet,
} from './docsSetManagerData.js'

const docsSet = {
  id: 'set-1',
  routeBase: '/plugins/payload-markdown',
  sourceId: 'payload-markdown',
  sync: {
    docsCount: 5,
    lastStatus: 'success' as const,
    lastSyncedAt: '2026-01-01T00:00:00.000Z',
  },
  title: 'Payload Markdown',
}

const doc = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  docsSet: 'set-1',
  order: 10,
  route: '/plugins/payload-markdown/getting-started/installation',
  sourcePath: 'getting-started/installation.md',
  sync: {
    archived: false,
    sourceId: 'payload-markdown',
  },
  title: 'Installation',
  ...overrides,
})

const getRelationshipId = (value: unknown): string | undefined => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id?: number | string }).id

    return id === undefined ? undefined : String(id)
  }

  return undefined
}

const getValue = (record: Record<string, unknown>, key: string): unknown => {
  if (key.includes('.')) {
    return key.split('.').reduce<unknown>((current, segment) => {
      if (typeof current !== 'object' || current === null) {
        return undefined
      }

      return (current as Record<string, unknown>)[segment]
    }, record)
  }

  return record[key]
}

const matchesWhere = (record: Record<string, unknown>, where: unknown): boolean => {
  if (!where || typeof where !== 'object' || Array.isArray(where)) {
    return true
  }

  return Object.entries(where as Record<string, unknown>).every(([key, condition]) => {
    if (key === 'or' && Array.isArray(condition)) {
      return condition.some((child) => matchesWhere(record, child))
    }

    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
      return true
    }

    const value = getValue(record, key)
    const comparableValue = getRelationshipId(value) ?? value

    if ('equals' in condition) {
      return String(comparableValue) === String(condition.equals)
    }

    return true
  })
}

const createPayloadMock = ({
  docs = [],
  docsSetRecord = docsSet,
}: {
  docs?: Record<string, unknown>[]
  docsSetRecord?: Record<string, unknown>
}): {
  find: ReturnType<typeof vi.fn>
  findByID: ReturnType<typeof vi.fn>
} & DocsSetManagerPayloadOperations => ({
  find: vi.fn((args) =>
    Promise.resolve({
      docs: docs.filter((record) => matchesWhere(record, args.where)),
    }),
  ),
  findByID: vi.fn(() => Promise.resolve(docsSetRecord)),
})

describe('docs set manager data helpers', () => {
  it('builds summary counts and sync metadata', () => {
    const data = buildDocsSetManagerData({
      adminRoute: '/admin',
      docs: [
        doc({
          _status: 'published',
          overrides: {
            heroTitle: 'Hero',
            hideFromNav: true,
            navTitle: 'Install',
            seoTitle: 'Install SEO',
          },
        }),
        doc({
          id: 'doc-2',
          _status: 'draft',
          route: '/plugins/payload-markdown/configuration/sync',
          sourcePath: 'configuration/sync.md',
          sync: {
            archived: true,
            sourceId: 'payload-markdown',
          },
          title: 'Sync',
        }),
      ],
      docsSet,
    })

    expect(data.summary).toEqual({
      archived: 1,
      drafts: 0,
      hiddenFromNav: 1,
      published: 1,
      total: 2,
      withOverrides: 1,
    })
    expect(data.sync).toEqual({
      docsCount: 5,
      lastStatus: 'success',
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(
      data.docs.find((item) => item.id === 'doc-1')?.overrideSummary,
    ).toEqual([
      'Nav title override',
      'Hidden from nav',
      'Hero override',
      'SEO override',
    ])
  })

  it('sorts docs deterministically and builds a source path tree', () => {
    const data = buildDocsSetManagerData({
      docs: [
        doc({
          id: 'doc-3',
          order: 20,
          route: '/plugins/payload-markdown/configuration/sync',
          sourcePath: 'configuration/sync.md',
          title: 'Sync',
        }),
        doc({
          id: 'doc-1',
          order: 0,
          route: '/plugins/payload-markdown',
          sourcePath: 'index.md',
          title: 'Overview',
        }),
        doc({
          id: 'doc-2',
          order: 10,
          sourcePath: 'getting-started/installation.md',
        }),
      ],
      docsSet,
    })

    expect(data.docs.map((item) => item.sourcePath)).toEqual([
      'index.md',
      'getting-started/installation.md',
      'configuration/sync.md',
    ])
    expect(data.tree).toEqual([
      expect.objectContaining({
        kind: 'doc',
        sourcePath: 'index.md',
      }),
      expect.objectContaining({
        children: [
          expect.objectContaining({
            kind: 'doc',
            sourcePath: 'getting-started/installation.md',
          }),
        ],
        kind: 'folder',
        sourcePath: 'getting-started',
      }),
      expect.objectContaining({
        children: [
          expect.objectContaining({
            kind: 'doc',
            sourcePath: 'configuration/sync.md',
          }),
        ],
        kind: 'folder',
        sourcePath: 'configuration',
      }),
    ])
  })

  it('adds warnings for missing generated doc fields', () => {
    const data = buildDocsSetManagerData({
      docs: [
        {
          id: 'doc-1',
          docsSet: 'set-1',
          sync: {
            sourceId: 'payload-markdown',
          },
        },
      ],
      docsSet,
    })

    expect(data.warnings).toEqual([
      expect.objectContaining({
        message: 'Generated doc is missing a route.',
      }),
      expect.objectContaining({
        message: 'Generated doc is missing a source path.',
      }),
      expect.objectContaining({
        message: 'Generated doc is missing a title.',
      }),
    ])
  })

  it('supports migration compatibility by source id', () => {
    expect(
      isDocsRecordForDocsSet({
        doc: doc({
          docsSet: undefined,
        }),
        docsSetId: 'set-1',
        sourceId: 'payload-markdown',
      }),
    ).toBe(true)
    expect(
      isDocsRecordForDocsSet({
        doc: doc({
          docsSet: 'other-set',
        }),
        docsSetId: 'set-1',
        sourceId: 'payload-markdown',
      }),
    ).toBe(false)
  })

  it('builds generated doc admin URLs', () => {
    expect(
      getGeneratedDocAdminURL({
        id: 'doc 1',
        adminRoute: '/manage/',
        docsCollectionSlug: 'docs',
      }),
    ).toBe('/manage/collections/docs/doc%201')
  })

  it('reads manager data with custom collection slugs and filters unrelated docs', async () => {
    const payload = createPayloadMock({
      docs: [
        doc(),
        doc({
          id: 'legacy-doc',
          docsSet: undefined,
          route: '/plugins/payload-markdown/legacy',
          sourcePath: 'legacy.md',
        }),
        doc({
          id: 'other-doc',
          docsSet: 'other-set',
          route: '/other',
          sourcePath: 'other.md',
        }),
      ],
    })

    const data = await getDocsSetManagerData({
      adminRoute: '/admin',
      docsCollectionSlug: 'generated-docs',
      docsSetId: 'set-1',
      docsSetsCollectionSlug: 'knowledge-sets',
      payload,
    })

    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'set-1',
        collection: 'knowledge-sets',
      }),
    )
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'generated-docs',
        where: {
          or: [
            {
              docsSet: {
                equals: 'set-1',
              },
            },
            {
              'sync.sourceId': {
                equals: 'payload-markdown',
              },
            },
          ],
        },
      }),
    )
    expect(data.docs.map((item) => item.id)).toEqual(['doc-1', 'legacy-doc'])
    expect(data.docs[0]?.adminURL).toBe('/admin/collections/generated-docs/doc-1')
  })

  it('declares the admin package export for Payload import maps', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as {
      exports: Record<string, unknown>
      files: string[]
      main: string
      types: string
    }

    expect(packageJson.main).toBe('./dist/index.js')
    expect(packageJson.types).toBe('./dist/index.d.ts')
    expect(packageJson.files).toEqual(['dist'])
    expect(packageJson.exports['.']).toMatchObject({
      import: './dist/index.js',
      types: './dist/index.d.ts',
    })
    expect(packageJson.exports['./admin']).toMatchObject({
      import: './dist/admin/index.js',
      types: './dist/admin/index.d.ts',
    })
    expect(packageJson.exports['./next']).toMatchObject({
      import: './dist/next/index.js',
      types: './dist/next/index.d.ts',
    })
    expect(JSON.stringify(packageJson.exports)).not.toContain('./src/')
  })
})
