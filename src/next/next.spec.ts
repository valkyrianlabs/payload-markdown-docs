import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type {
  PayloadMarkdownDocsReadPayload,
  ResolvedPayloadMarkdownDocsRecord,
  ResolvedPayloadMarkdownDocsSet,
} from './types.js'

import { createPayloadMarkdownDocsAssetResponse } from './assets.js'
import {
  DocsBanner,
  DocsCallout,
  DocsCTA,
  DocsNativeHero,
  DocsPreview,
  DocsProductHero,
  SkillCTAGroup,
  SkillTabs,
} from './index.js'
import {
  appendPayloadMarkdownDocsHeaderNavItems,
  getPayloadMarkdownDocsHeaderNavItems,
  getPayloadMarkdownDocsNavItems,
} from './links.js'
import { getPayloadMarkdownDocsMetadata } from './metadata.js'
import { PayloadMarkdownDocsNavbar } from './PayloadMarkdownDocsNavbar.js'
import { PayloadMarkdownDocsPage } from './PayloadMarkdownDocsPage.js'
import { getPayloadMarkdownDocsRoutePath, resolvePayloadMarkdownDocsRoute } from './route.js'
import { buildPayloadMarkdownDocsSidebar, getPayloadMarkdownDocsSidebar } from './sidebar.js'
import {
  getDocsForSitemap,
  getPaginatedDocsForSitemap,
  getPayloadMarkdownDocsAiSitemapRoutes,
} from './sitemap.js'

const cacheMocks = vi.hoisted(() => ({
  unstableCache: vi.fn((callback: (...args: unknown[]) => Promise<unknown>) => callback),
}))

vi.mock('next/cache', () => ({
  unstable_cache: cacheMocks.unstableCache,
}))

vi.mock('@valkyrianlabs/payload-markdown/server', () => ({
  MarkdownRenderer: ({ markdown }: { markdown?: string }) => markdown ?? null,
}))

type TestPayloadData = {
  docs?: Record<string, unknown>[]
  docsAssets?: Record<string, unknown>[]
  docsGroups?: Record<string, unknown>[]
  docsSets?: Record<string, unknown>[]
}

const docsSet = {
  id: 'set-1',
  slug: 'payload-markdown',
  description: 'Docs set description.',
  order: 10,
  title: 'Payload Markdown',
}

const docsGroup = {
  id: 'group-1',
  slug: 'plugins',
  description: 'Plugin documentation.',
  order: 0,
  title: 'Plugins',
}

const createDoc = (overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> => ({
  id: 'doc-1',
  content: '# Installation\n',
  depth: 1,
  description: 'Install docs.',
  docsSet,
  order: 10,
  route: '/payload-markdown/getting-started/installation',
  sourceHash: 'hash-1',
  sourcePath: 'getting-started/installation.md',
  sync: {
    archived: false,
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

const getValue = (doc: Record<string, unknown>, key: string): unknown => {
  if (key.includes('.')) {
    return key.split('.').reduce<unknown>((current, segment) => {
      if (typeof current !== 'object' || current === null) {
        return undefined
      }

      return (current as Record<string, unknown>)[segment]
    }, doc)
  }

  return doc[key]
}

const matchesWhere = (doc: Record<string, unknown>, where: unknown): boolean => {
  if (!where || typeof where !== 'object' || Array.isArray(where)) {
    return true
  }

  return Object.entries(where as Record<string, unknown>).every(([key, condition]) => {
    if (key === 'and' && Array.isArray(condition)) {
      return condition.every((child) => matchesWhere(doc, child))
    }

    if (key === 'or' && Array.isArray(condition)) {
      return condition.some((child) => matchesWhere(doc, child))
    }

    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
      return true
    }

    const value = getValue(doc, key)
    const comparableValue = getRelationshipId(value) ?? value

    if ('equals' in condition) {
      return String(comparableValue) === String(condition.equals)
    }

    return true
  })
}

const createPayloadMock = ({
  docs = [],
  docsAssets = [],
  docsGroups = [],
  docsSets = [],
}: TestPayloadData): {
  find: ReturnType<typeof vi.fn>
} & PayloadMarkdownDocsReadPayload => {
  const collections: Record<string, Record<string, unknown>[]> = {
    docs,
    'docs-groups': docsGroups,
    'docs-sets': docsSets,
    'payload-markdown-docs-assets': docsAssets,
  }

  return {
    find: vi.fn((args) =>
      Promise.resolve({
        docs: (collections[args.collection] ?? [])
          .filter((doc) => args.draft === true || doc._status !== 'draft')
          .filter((doc) => matchesWhere(doc, args.where)),
      }),
    ),
  }
}

const resolvedRecord = (
  overrides: Partial<ResolvedPayloadMarkdownDocsRecord> = {},
): ResolvedPayloadMarkdownDocsRecord => ({
  id: 'doc-1',
  archived: false,
  content: '# Installation\n',
  depth: 1,
  description: 'Install docs.',
  docsSetId: 'set-1',
  order: 10,
  route: '/payload-markdown/getting-started/installation',
  sourcePath: 'getting-started/installation.md',
  title: 'Installation',
  ...overrides,
})

const resolvedDocsSet: ResolvedPayloadMarkdownDocsSet = {
  id: 'set-1',
  slug: 'payload-markdown',
  description: 'Docs set description.',
  order: 0,
  productRoute: '/payload-markdown',
  routeBase: '/payload-markdown',
  routeMode: 'docs-root',
  title: 'Payload Markdown',
}

describe('Payload Markdown Docs route adapter', () => {
  it('normalizes slug array and direct path inputs', () => {
    expect(
      getPayloadMarkdownDocsRoutePath({
        slug: ['plugins', 'payload-markdown', 'configuration', 'themes'],
      }),
    ).toBe('/plugins/payload-markdown/configuration/themes')
    expect(
      getPayloadMarkdownDocsRoutePath({
        path: 'plugins/payload-markdown/',
      }),
    ).toBe('/plugins/payload-markdown')
  })

  it('resolves an exact generated doc route', async () => {
    const payload = createPayloadMock({
      docs: [createDoc()],
      docsSets: [docsSet],
    })

    const resolved = await resolvePayloadMarkdownDocsRoute({
      path: '/payload-markdown/getting-started/installation',
      payload,
    })

    expect(resolved).toMatchObject({
      type: 'doc',
      doc: {
        id: 'doc-1',
        title: 'Installation',
      },
      docsSet: {
        id: 'set-1',
      },
    })
    expect(resolved?.type === 'doc' ? resolved.sidebar.length : 0).toBe(1)
  })

  it('uses access override for server-side route adapter reads', async () => {
    const route = '/payload-markdown/getting-started/installation'
    const payload = createPayloadMock({
      docs: [createDoc()],
      docsSets: [docsSet],
    })

    await resolvePayloadMarkdownDocsRoute({
      path: route,
      payload,
    })

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs-sets',
        draft: false,
        overrideAccess: true,
      }),
    )
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
        draft: false,
        overrideAccess: true,
        where: {
          route: {
            equals: route,
          },
        },
      }),
    )
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
        draft: false,
        overrideAccess: true,
        where: {
          docsSet: {
            equals: docsSet.id,
          },
        },
      }),
    )
  })

  it('resolves a docs set route base with an index doc', async () => {
    const payload = createPayloadMock({
      docs: [
        createDoc({
          id: 'doc-index',
          route: '/payload-markdown',
          sourcePath: 'index.md',
          title: 'Overview',
        }),
      ],
      docsSets: [docsSet],
    })

    const resolved = await resolvePayloadMarkdownDocsRoute({
      slug: ['payload-markdown'],
      payload,
    })

    expect(resolved).toMatchObject({
      type: 'docsSetIndex',
      doc: {
        id: 'doc-index',
      },
      docsSet: {
        routeBase: '/payload-markdown',
      },
    })
  })

  it('resolves a docs set route base without an index doc', async () => {
    const payload = createPayloadMock({
      docs: [],
      docsSets: [docsSet],
    })

    const resolved = await resolvePayloadMarkdownDocsRoute({
      path: '/payload-markdown',
      payload,
    })

    expect(resolved).toMatchObject({
      type: 'docsSetIndex',
      docsSet: {
        id: 'set-1',
      },
    })
    expect(resolved?.type === 'docsSetIndex' ? resolved.doc : undefined).toBeUndefined()
  })

  it('normalizes docs set SEO metadata on resolved routes', async () => {
    const payload = createPayloadMock({
      docs: [],
      docsSets: [
        {
          ...docsSet,
          meta: {
            description: 'Social description.',
            image: {
              relationTo: 'media',
              value: {
                id: 'media-1',
                alt: 'Social preview',
                height: 630,
                url: '/media/social.png',
                width: 1200,
              },
            },
            title: 'Social title',
          },
        },
      ],
    })

    const resolved = await resolvePayloadMarkdownDocsRoute({
      path: '/payload-markdown',
      payload,
    })

    expect(resolved).toMatchObject({
      type: 'docsSetIndex',
      docsSet: {
        openGraph: {
          description: 'Social description.',
          image: {
            id: 'media-1',
            alt: 'Social preview',
            height: 630,
            relationTo: 'media',
            url: '/media/social.png',
            width: 1200,
          },
          title: 'Social title',
        },
      },
    })
  })

  it('resolves product-nested docs under the docs segment', async () => {
    const productDocsSet = {
      ...docsSet,
      routeMode: 'product-nested',
    }
    const payload = createPayloadMock({
      docs: [
        createDoc({
          docsSet: productDocsSet,
          route: '/plugins/payload-markdown/docs/getting-started',
          sourcePath: 'getting-started/index.md',
          title: 'Getting Started',
        }),
      ],
      docsGroups: [docsGroup],
      docsSets: [
        {
          ...productDocsSet,
          group: docsGroup,
        },
      ],
    })

    await expect(
      resolvePayloadMarkdownDocsRoute({
        path: '/plugins/payload-markdown/docs',
        payload,
      }),
    ).resolves.toMatchObject({
      type: 'docsSetIndex',
      docsSet: {
        productRoute: '/plugins/payload-markdown',
        routeBase: '/plugins/payload-markdown/docs',
        routeMode: 'product-nested',
      },
    })

    await expect(
      resolvePayloadMarkdownDocsRoute({
        path: '/plugins/payload-markdown/docs/getting-started',
        payload,
      }),
    ).resolves.toMatchObject({
      type: 'doc',
      doc: {
        title: 'Getting Started',
      },
      docsSet: {
        routeBase: '/plugins/payload-markdown/docs',
      },
    })
  })

  it('does not resolve the product route for product-nested docs sets', async () => {
    const payload = createPayloadMock({
      docsGroups: [docsGroup],
      docsSets: [
        {
          ...docsSet,
          group: docsGroup,
          routeMode: 'product-nested',
        },
      ],
    })

    await expect(
      resolvePayloadMarkdownDocsRoute({
        path: '/plugins/payload-markdown',
        payload,
      }),
    ).resolves.toBeNull()
  })

  it('resolves docs group routes when pageMode is auto', async () => {
    const childGroup = {
      id: 'group-guides',
      slug: 'guides',
      order: 0,
      parent: docsGroup,
      title: 'Guides',
    }
    const payload = createPayloadMock({
      docsGroups: [
        {
          ...docsGroup,
          pageMode: 'auto',
        },
        childGroup,
      ],
      docsSets: [
        {
          ...docsSet,
          group: docsGroup,
        },
      ],
    })

    const resolved = await resolvePayloadMarkdownDocsRoute({
      path: '/plugins',
      payload,
    })

    expect(resolved).toMatchObject({
      type: 'docsGroupIndex',
      childGroups: [
        {
          id: 'group-guides',
          routePath: '/plugins/guides',
        },
      ],
      docsSets: [
        {
          id: 'set-1',
        },
      ],
    })

    const disabledPayload = createPayloadMock({
      docsGroups: [
        {
          ...docsGroup,
          pageMode: 'custom',
        },
      ],
    })

    await expect(
      resolvePayloadMarkdownDocsRoute({
        path: '/plugins',
        payload: disabledPayload,
      }),
    ).resolves.toBeNull()
  })

  it('does not resolve custom docs group routes', async () => {
    const payload = createPayloadMock({
      docsGroups: [
        {
          ...docsGroup,
          pageMode: 'custom',
        },
      ],
    })

    await expect(
      resolvePayloadMarkdownDocsRoute({
        path: '/plugins',
        payload,
      }),
    ).resolves.toBeNull()
  })

  it('uses access override for docs group and child docs set reads', async () => {
    const payload = createPayloadMock({
      docsGroups: [docsGroup],
      docsSets: [
        {
          ...docsSet,
          group: docsGroup,
        },
      ],
    })

    await resolvePayloadMarkdownDocsRoute({
      path: '/plugins',
      payload,
    })

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs-groups',
        overrideAccess: true,
      }),
    )
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs-sets',
        overrideAccess: true,
      }),
    )
  })

  it('returns null for unknown routes', async () => {
    const payload = createPayloadMock({
      docs: [],
      docsGroups: [],
      docsSets: [],
    })

    await expect(
      resolvePayloadMarkdownDocsRoute({
        path: '/missing',
        payload,
      }),
    ).resolves.toBeNull()
  })

  it('does not resolve archived docs or drafts by default', async () => {
    const archivedPayload = createPayloadMock({
      docs: [
        createDoc({
          sync: {
            archived: true,
          },
        }),
      ],
      docsSets: [docsSet],
    })

    await expect(
      resolvePayloadMarkdownDocsRoute({
        path: '/payload-markdown/getting-started/installation',
        payload: archivedPayload,
      }),
    ).resolves.toBeNull()

    const draftPayload = createPayloadMock({
      docs: [
        createDoc({
          _status: 'draft',
        }),
      ],
      docsSets: [docsSet],
    })

    await expect(
      resolvePayloadMarkdownDocsRoute({
        path: '/payload-markdown/getting-started/installation',
        payload: draftPayload,
      }),
    ).resolves.toBeNull()
    await expect(
      resolvePayloadMarkdownDocsRoute({
        includeDrafts: true,
        path: '/payload-markdown/getting-started/installation',
        payload: draftPayload,
      }),
    ).resolves.toMatchObject({
      type: 'doc',
    })
  })

  it('does not resolve draft docs sets by default', async () => {
    const payload = createPayloadMock({
      docs: [
        createDoc({
          route: '/payload-markdown',
          sourcePath: 'index.md',
        }),
      ],
      docsSets: [
        {
          ...docsSet,
          _status: 'draft',
        },
      ],
    })

    await expect(
      resolvePayloadMarkdownDocsRoute({
        path: '/payload-markdown',
        payload,
      }),
    ).resolves.toBeNull()
    await expect(
      resolvePayloadMarkdownDocsRoute({
        includeDrafts: true,
        path: '/payload-markdown',
        payload,
      }),
    ).resolves.toMatchObject({
      type: 'docsSetIndex',
    })
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs-sets',
        draft: true,
      }),
    )
  })

  it('builds sitemap docs with resolved group URLs and last modified dates', async () => {
    cacheMocks.unstableCache.mockClear()

    const childGroup = {
      id: 'group-2',
      slug: 'cms',
      parent: docsGroup.id,
      title: 'CMS',
    }
    const payload = createPayloadMock({
      docsGroups: [docsGroup, childGroup],
      docsSets: [
        {
          ...docsSet,
          _status: 'published',
          group: childGroup.id,
          updatedAt: '2026-05-14T12:00:00.000Z',
        },
        {
          id: 'set-2',
          slug: 'guides',
          _status: 'published',
          title: 'Guides',
          updatedAt: '2026-05-13T12:00:00.000Z',
        },
        {
          id: 'set-draft',
          slug: 'draft-docs',
          _status: 'draft',
          title: 'Draft Docs',
          updatedAt: '2026-05-12T12:00:00.000Z',
        },
      ],
    })

    const result = await getPaginatedDocsForSitemap({
      cacheKey: ['custom-sitemap-docs'],
      payload,
      siteUrl: 'https://example.com/base/',
      tags: ['custom-sitemap'],
    })

    expect(result.docs).toEqual([
      {
        lastModified: '2026-05-13T12:00:00.000Z',
        url: 'https://example.com/base/guides',
      },
      {
        lastModified: '2026-05-14T12:00:00.000Z',
        url: 'https://example.com/base/plugins/cms/payload-markdown',
      },
    ])
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs-sets',
        limit: 10000,
        overrideAccess: true,
        select: {
          id: true,
          slug: true,
          group: true,
          routeMode: true,
          updatedAt: true,
        },
        where: {
          _status: {
            equals: 'published',
          },
        },
      }),
    )
    expect(cacheMocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ['custom-sitemap-docs'],
      {
        tags: ['custom-sitemap'],
      },
    )
  })

  it('returns ready-to-use Next sitemap entries', async () => {
    const payload = createPayloadMock({
      docsGroups: [docsGroup],
      docsSets: [
        {
          ...docsSet,
          _status: 'published',
          group: docsGroup.id,
          updatedAt: '2026-05-14T12:00:00.000Z',
        },
      ],
    })

    const result = await getDocsForSitemap({
      payload,
      siteUrl: 'https://example.com',
    })

    expect(result).toEqual([
      {
        lastModified: '2026-05-14T12:00:00.000Z',
        url: 'https://example.com/plugins/payload-markdown',
      },
    ])
  })

  it('uses product-nested docs route bases in sitemap output', async () => {
    const payload = createPayloadMock({
      docsGroups: [docsGroup],
      docsSets: [
        {
          ...docsSet,
          _status: 'published',
          group: docsGroup.id,
          routeMode: 'product-nested',
          updatedAt: '2026-05-14T12:00:00.000Z',
        },
      ],
    })

    const result = await getDocsForSitemap({
      payload,
      recursive: false,
      siteUrl: 'https://example.com',
    })

    expect(result).toEqual([
      {
        lastModified: '2026-05-14T12:00:00.000Z',
        url: 'https://example.com/plugins/payload-markdown/docs',
      },
    ])
  })

  it('maps recursive product-nested docs records under the docs route base', async () => {
    const payload = createPayloadMock({
      docs: [
        createDoc({
          id: 'doc-index',
          _status: 'published',
          docsSet: docsSet.id,
          route: '/plugins/payload-markdown',
          sourcePath: 'index.md',
          title: 'Overview',
          updatedAt: '2026-05-15T12:00:00.000Z',
        }),
        createDoc({
          id: 'doc-install',
          _status: 'published',
          docsSet: docsSet.id,
          route: '/plugins/payload-markdown/getting-started/installation',
          sourcePath: 'getting-started/installation.md',
          title: 'Installation',
          updatedAt: '2026-05-14T12:00:00.000Z',
        }),
      ],
      docsGroups: [docsGroup],
      docsSets: [
        {
          ...docsSet,
          _status: 'published',
          group: docsGroup.id,
          routeMode: 'product-nested',
          updatedAt: '2026-05-14T11:00:00.000Z',
        },
      ],
    })

    const result = await getDocsForSitemap({
      payload,
      siteUrl: 'https://example.com',
    })

    expect(result).toEqual([
      {
        lastModified: '2026-05-15T12:00:00.000Z',
        url: 'https://example.com/plugins/payload-markdown/docs',
      },
      {
        lastModified: '2026-05-14T12:00:00.000Z',
        url: 'https://example.com/plugins/payload-markdown/docs/getting-started/installation',
      },
    ])
  })

  it('includes additional routes in paginated sitemap docs', async () => {
    const payload = createPayloadMock({})

    const result = await getPaginatedDocsForSitemap({
      additionalRoutes: [
        {
          lastModified: new Date('2026-05-14T12:00:00.000Z'),
          path: 'llms.txt',
        },
        {
          path: '/llms-full.txt',
        },
        {
          lastModified: '2026-05-13T12:00:00.000Z',
          url: 'https://static.example.com/agent-index.txt',
        },
        {
          path: '   ',
        },
        {
          url: '',
        },
      ],
      payload,
      siteUrl: 'https://example.com/docs/',
    })

    expect(result.docs).toEqual([
      {
        lastModified: null,
        url: 'https://example.com/docs/llms-full.txt',
      },
      {
        lastModified: '2026-05-14T12:00:00.000Z',
        url: 'https://example.com/docs/llms.txt',
      },
      {
        lastModified: '2026-05-13T12:00:00.000Z',
        url: 'https://static.example.com/agent-index.txt',
      },
    ])
  })

  it('includes additional routes in Next sitemap entries and keeps latest duplicates', async () => {
    const payload = createPayloadMock({
      docsGroups: [docsGroup],
      docsSets: [
        {
          ...docsSet,
          _status: 'published',
          group: docsGroup.id,
          updatedAt: '2026-05-10T12:00:00.000Z',
        },
      ],
    })

    const result = await getDocsForSitemap({
      additionalRoutes: [
        {
          lastModified: '2026-05-15T12:00:00.000Z',
          path: '/plugins/payload-markdown',
        },
        {
          lastModified: '2026-05-13T12:00:00.000Z',
          path: '/legal',
        },
      ],
      payload,
      recursive: false,
      siteUrl: 'https://example.com',
    })

    expect(result).toEqual([
      {
        lastModified: '2026-05-13T12:00:00.000Z',
        url: 'https://example.com/legal',
      },
      {
        lastModified: '2026-05-15T12:00:00.000Z',
        url: 'https://example.com/plugins/payload-markdown',
      },
    ])
  })

  it('builds common AI sitemap routes for llms files and skill artifacts', () => {
    const routes = getPayloadMarkdownDocsAiSitemapRoutes({
      includeLlmsFull: true,
      skills: [
        {
          agents: ['codex', 'claude'],
          basePath: '/plugins/payload-markdown-docs/skills',
          files: ['SKILL.md', 'reference/formatting.md'],
          lastModified: '2026-05-14T12:00:00.000Z',
        },
        {
          agents: ['codex'],
          basePath: '/skills/payload-markdown-docs',
        },
      ],
    })

    expect(routes).toEqual([
      {
        path: '/llms.txt',
      },
      {
        path: '/llms-full.txt',
      },
      {
        lastModified: '2026-05-14T12:00:00.000Z',
        path: '/plugins/payload-markdown-docs/skills/codex/SKILL.md',
      },
      {
        lastModified: '2026-05-14T12:00:00.000Z',
        path: '/plugins/payload-markdown-docs/skills/codex/reference/formatting.md',
      },
      {
        lastModified: '2026-05-14T12:00:00.000Z',
        path: '/plugins/payload-markdown-docs/skills/claude/SKILL.md',
      },
      {
        lastModified: '2026-05-14T12:00:00.000Z',
        path: '/plugins/payload-markdown-docs/skills/claude/reference/formatting.md',
      },
      {
        path: '/skills/payload-markdown-docs/codex/SKILL.md',
      },
    ])
  })

  it('includes generated docs records recursively by default', async () => {
    const payload = createPayloadMock({
      docs: [
        createDoc({
          id: 'doc-index',
          _status: 'published',
          docsSet: docsSet.id,
          route: '/plugins/payload-markdown',
          sourcePath: 'index.md',
          title: 'Overview',
          updatedAt: '2026-05-15T12:00:00.000Z',
        }),
        createDoc({
          id: 'doc-install',
          _status: 'published',
          docsSet: docsSet.id,
          route: '/plugins/payload-markdown/getting-started/installation',
          sourcePath: 'getting-started/installation.md',
          title: 'Installation',
          updatedAt: '2026-05-14T12:00:00.000Z',
        }),
        createDoc({
          id: 'doc-archived',
          _status: 'published',
          docsSet: docsSet.id,
          route: '/plugins/payload-markdown/archived',
          sourcePath: 'archived.md',
          sync: {
            archived: true,
          },
          title: 'Archived',
          updatedAt: '2026-05-13T12:00:00.000Z',
        }),
        createDoc({
          id: 'doc-draft',
          _status: 'draft',
          docsSet: docsSet.id,
          route: '/plugins/payload-markdown/draft',
          sourcePath: 'draft.md',
          title: 'Draft',
          updatedAt: '2026-05-13T12:00:00.000Z',
        }),
      ],
      docsGroups: [docsGroup],
      docsSets: [
        {
          ...docsSet,
          _status: 'published',
          group: docsGroup.id,
          updatedAt: '2026-05-14T11:00:00.000Z',
        },
      ],
    })

    const result = await getPaginatedDocsForSitemap({
      payload,
      siteUrl: 'https://example.com',
    })

    expect(result.docs).toEqual([
      {
        lastModified: '2026-05-15T12:00:00.000Z',
        url: 'https://example.com/plugins/payload-markdown',
      },
      {
        lastModified: '2026-05-14T12:00:00.000Z',
        url: 'https://example.com/plugins/payload-markdown/getting-started/installation',
      },
    ])
  })

  it('can return only docs set base routes when recursion is disabled', async () => {
    const payload = createPayloadMock({
      docs: [
        createDoc({
          docsSet: docsSet.id,
          route: '/plugins/payload-markdown/getting-started/installation',
          sourcePath: 'getting-started/installation.md',
          updatedAt: '2026-05-14T12:00:00.000Z',
        }),
      ],
      docsGroups: [docsGroup],
      docsSets: [
        {
          ...docsSet,
          _status: 'published',
          group: docsGroup.id,
          updatedAt: '2026-05-14T11:00:00.000Z',
        },
      ],
    })

    const result = await getDocsForSitemap({
      payload,
      recursive: false,
      siteUrl: 'https://example.com',
    })

    expect(result).toEqual([
      {
        lastModified: '2026-05-14T11:00:00.000Z',
        url: 'https://example.com/plugins/payload-markdown',
      },
    ])
    expect(payload.find).not.toHaveBeenCalledWith(expect.objectContaining({ collection: 'docs' }))
  })

  it('excludes raw AI asset routes from sitemap output by default', async () => {
    const sitemapDocsSet = {
      ...docsSet,
      _status: 'published',
      group: docsGroup.id,
      updatedAt: '2026-05-14T11:00:00.000Z',
    }
    const payload = createPayloadMock({
      docsAssets: [
        {
          id: 'asset-llms',
          docsSet: sitemapDocsSet.id,
          kind: 'llms',
          route: '/llms.txt',
          sync: {
            archived: false,
          },
          updatedAt: '2026-05-16T12:00:00.000Z',
        },
        {
          id: 'asset-skill',
          docsSet: sitemapDocsSet.id,
          kind: 'skill',
          route: '/plugins/payload-markdown/skills/codex/SKILL.md',
          sync: {
            archived: false,
          },
          updatedAt: '2026-05-15T12:00:00.000Z',
        },
        {
          id: 'asset-static',
          kind: 'static',
          route: '/downloads/payload-markdown.zip',
          sync: {
            archived: false,
          },
          updatedAt: '2026-05-17T12:00:00.000Z',
        },
        {
          id: 'asset-llms-full',
          kind: 'llms-full',
          route: '/llms-full.txt',
          sync: {
            archived: false,
          },
          updatedAt: '2026-05-14T12:00:00.000Z',
        },
      ],
      docsGroups: [docsGroup],
      docsSets: [sitemapDocsSet],
    })

    const result = await getDocsForSitemap({
      payload,
      siteUrl: 'https://example.com',
    })

    expect(result).toEqual([
      {
        lastModified: sitemapDocsSet.updatedAt,
        url: 'https://example.com/plugins/payload-markdown',
      },
    ])
    expect(payload.find).not.toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'payload-markdown-docs-assets' }),
    )
  })

  it('includes llms routes only when includeLlms is true', async () => {
    const sitemapDocsSet = {
      ...docsSet,
      _status: 'published',
      group: docsGroup.id,
      updatedAt: '2026-05-14T11:00:00.000Z',
    }
    const payload = createPayloadMock({
      docsAssets: [
        {
          id: 'asset-llms',
          docsSet: sitemapDocsSet.id,
          kind: 'llms',
          route: '/llms.txt',
          sync: {
            archived: false,
          },
          updatedAt: '2026-05-16T12:00:00.000Z',
        },
        {
          id: 'asset-skill',
          docsSet: sitemapDocsSet.id,
          kind: 'skill',
          route: '/plugins/payload-markdown/skills/codex/SKILL.md',
          sync: {
            archived: false,
          },
          updatedAt: '2026-05-15T12:00:00.000Z',
        },
      ],
      docsGroups: [docsGroup],
      docsSets: [sitemapDocsSet],
    })

    const result = await getDocsForSitemap({
      includeLlms: true,
      payload,
      siteUrl: 'https://example.com',
    })

    expect(result).toEqual([
      {
        lastModified: sitemapDocsSet.updatedAt,
        url: 'https://example.com/llms-full.txt',
      },
      {
        lastModified: '2026-05-16T12:00:00.000Z',
        url: 'https://example.com/llms.txt',
      },
      {
        lastModified: sitemapDocsSet.updatedAt,
        url: 'https://example.com/plugins/payload-markdown',
      },
      {
        lastModified: sitemapDocsSet.updatedAt,
        url: 'https://example.com/plugins/payload-markdown/llms-full.txt',
      },
      {
        lastModified: '2026-05-16T12:00:00.000Z',
        url: 'https://example.com/plugins/payload-markdown/llms.txt',
      },
    ])
  })

  it('includes skill routes only when includeSkills is true', async () => {
    const sitemapDocsSet = {
      ...docsSet,
      _status: 'published',
      group: docsGroup.id,
      updatedAt: '2026-05-14T11:00:00.000Z',
    }
    const payload = createPayloadMock({
      docsAssets: [
        {
          id: 'asset-llms',
          docsSet: sitemapDocsSet.id,
          kind: 'llms',
          route: '/llms.txt',
          sync: {
            archived: false,
          },
          updatedAt: '2026-05-16T12:00:00.000Z',
        },
        {
          id: 'asset-skill',
          docsSet: sitemapDocsSet.id,
          kind: 'skill',
          route: '/plugins/payload-markdown/skills/codex/SKILL.md',
          sync: {
            archived: false,
          },
          updatedAt: '2026-05-15T12:00:00.000Z',
        },
        {
          id: 'asset-skill-reference',
          docsSet: sitemapDocsSet.id,
          kind: 'skill',
          route: '/plugins/payload-markdown/skills/codex/reference/formatting.md',
          sync: {
            archived: false,
          },
          updatedAt: '2026-05-13T12:00:00.000Z',
        },
      ],
      docsGroups: [docsGroup],
      docsSets: [sitemapDocsSet],
    })

    const result = await getDocsForSitemap({
      includeSkills: true,
      payload,
      siteUrl: 'https://example.com',
    })

    expect(result).toEqual([
      {
        lastModified: sitemapDocsSet.updatedAt,
        url: 'https://example.com/plugins/payload-markdown',
      },
      {
        lastModified: '2026-05-15T12:00:00.000Z',
        url: 'https://example.com/plugins/payload-markdown/skills/codex',
      },
      {
        lastModified: '2026-05-13T12:00:00.000Z',
        url: 'https://example.com/plugins/payload-markdown/skills/codex/reference/formatting.md',
      },
      {
        lastModified: '2026-05-15T12:00:00.000Z',
        url: 'https://example.com/plugins/payload-markdown/skills/codex/SKILL.md',
      },
    ])
  })

  it('includeAssets only includes generic static asset routes', async () => {
    const sitemapDocsSet = {
      ...docsSet,
      _status: 'published',
      group: docsGroup.id,
      updatedAt: '2026-05-14T11:00:00.000Z',
    }
    const payload = createPayloadMock({
      docsAssets: [
        {
          id: 'asset-static',
          kind: 'static',
          route: '/downloads/payload-markdown.zip',
          sync: {
            archived: false,
          },
          updatedAt: '2026-05-17T12:00:00.000Z',
        },
        {
          id: 'asset-llms',
          docsSet: sitemapDocsSet.id,
          kind: 'llms',
          route: '/llms.txt',
          sync: {
            archived: false,
          },
          updatedAt: '2026-05-16T12:00:00.000Z',
        },
        {
          id: 'asset-skill',
          docsSet: sitemapDocsSet.id,
          kind: 'skill',
          route: '/plugins/payload-markdown/skills/codex/SKILL.md',
          sync: {
            archived: false,
          },
          updatedAt: '2026-05-15T12:00:00.000Z',
        },
      ],
      docsGroups: [docsGroup],
      docsSets: [sitemapDocsSet],
    })

    const result = await getDocsForSitemap({
      includeAssets: true,
      payload,
      siteUrl: 'https://example.com',
    })

    expect(result).toEqual([
      {
        lastModified: '2026-05-17T12:00:00.000Z',
        url: 'https://example.com/downloads/payload-markdown.zip',
      },
      {
        lastModified: sitemapDocsSet.updatedAt,
        url: 'https://example.com/plugins/payload-markdown',
      },
    ])
  })
})

describe('Payload Markdown Docs asset response helpers', () => {
  it('serves llms and skill assets with their stored content type', async () => {
    const payload = createPayloadMock({
      docsAssets: [
        {
          id: 'asset-llms',
          content: '# Main Docs\n',
          contentType: 'text/plain; charset=utf-8',
          kind: 'llms',
          route: '/llms.txt',
          sourcePath: 'llms.txt',
          sync: {
            archived: false,
          },
        },
        {
          id: 'asset-skill',
          content: '# Skill\n',
          contentType: 'text/markdown; charset=utf-8',
          kind: 'skill',
          route: '/plugins/payload-markdown/skills/codex/SKILL.md',
          sourcePath: 'skills/payload-markdown/codex/SKILL.md',
          sync: {
            archived: false,
          },
        },
      ],
    })

    const llmsResponse = await createPayloadMarkdownDocsAssetResponse({
      path: '/llms.txt',
      payload,
    })
    const skillResponse = await createPayloadMarkdownDocsAssetResponse({
      path: '/plugins/payload-markdown/skills/codex/SKILL.md',
      payload,
    })

    expect(llmsResponse.status).toBe(200)
    expect(llmsResponse.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(await llmsResponse.text()).toBe('# Main Docs\n')
    expect(skillResponse.status).toBe(200)
    expect(skillResponse.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8')
    expect(await skillResponse.text()).toBe('# Skill\n')
  })

  it('returns 404 for archived assets', async () => {
    const payload = createPayloadMock({
      docsAssets: [
        {
          id: 'asset-llms',
          content: '# Main Docs\n',
          contentType: 'text/plain; charset=utf-8',
          kind: 'llms',
          route: '/llms.txt',
          sourcePath: 'llms.txt',
          sync: {
            archived: true,
          },
        },
      ],
    })

    const response = await createPayloadMarkdownDocsAssetResponse({
      path: '/llms.txt',
      payload,
    })

    expect(response.status).toBe(404)
  })
})

describe('Payload Markdown Docs sidebar helpers', () => {
  it('uses access override when reading sidebar docs records', async () => {
    const payload = createPayloadMock({
      docs: [createDoc()],
    })

    await getPayloadMarkdownDocsSidebar({
      docsSet: resolvedDocsSet,
      payload,
    })

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
        overrideAccess: true,
        where: {
          docsSet: {
            equals: resolvedDocsSet.id,
          },
        },
      }),
    )
  })

  it('builds sorted nested sidebar items from docs records', () => {
    const sidebar = buildPayloadMarkdownDocsSidebar(
      [
        resolvedRecord({
          order: 20,
          route: '/payload-markdown/configuration/sync',
          sourcePath: 'configuration/sync.md',
          title: 'Sync',
        }),
        resolvedRecord({
          order: 0,
          route: '/payload-markdown',
          sourcePath: 'index.md',
          title: 'Overview',
        }),
        resolvedRecord({
          order: 10,
          overrides: {
            navTitle: 'Install',
          },
          route: '/payload-markdown/getting-started/installation',
          sourcePath: 'getting-started/installation.md',
          title: 'Installation',
        }),
        resolvedRecord({
          archived: true,
          order: 30,
          route: '/payload-markdown/archived',
          sourcePath: 'archived.md',
          title: 'Archived',
        }),
        resolvedRecord({
          order: 40,
          route: '/payload-markdown/draft',
          sourcePath: 'draft.md',
          status: 'draft',
          title: 'Draft',
        }),
        resolvedRecord({
          overrides: {
            hideFromNav: true,
          },
          route: '/payload-markdown/hidden',
          sourcePath: 'hidden.md',
          title: 'Hidden',
        }),
      ],
      {
        docsSet: resolvedDocsSet,
      },
    )

    expect(sidebar).toEqual([
      expect.objectContaining({
        label: 'Overview',
      }),
      expect.objectContaining({
        children: [
          expect.objectContaining({
            label: 'Install',
          }),
        ],
        label: 'Getting Started',
      }),
      expect.objectContaining({
        children: [
          expect.objectContaining({
            label: 'Sync',
          }),
        ],
        label: 'Configuration',
      }),
    ])
    expect(sidebar[1]).not.toHaveProperty('route')
  })

  it('uses a folder index page as the sidebar link for that folder', () => {
    const sidebar = buildPayloadMarkdownDocsSidebar(
      [
        resolvedRecord({
          order: 20,
          route: '/payload-markdown/getting-started/installation',
          sourcePath: 'getting-started/installation.md',
          title: 'Installation',
        }),
        resolvedRecord({
          order: 10,
          route: '/payload-markdown/getting-started',
          sourcePath: 'getting-started/index.md',
          title: 'Getting Started',
        }),
        resolvedRecord({
          order: 0,
          route: '/payload-markdown',
          sourcePath: 'index.md',
          title: 'Overview',
        }),
      ],
      {
        docsSet: resolvedDocsSet,
      },
    )

    expect(sidebar).toEqual([
      expect.objectContaining({
        label: 'Overview',
        route: '/payload-markdown',
        sourcePath: 'index.md',
      }),
      expect.objectContaining({
        children: [
          expect.objectContaining({
            label: 'Installation',
            route: '/payload-markdown/getting-started/installation',
          }),
        ],
        label: 'Getting Started',
        route: '/payload-markdown/getting-started',
        sourcePath: 'getting-started',
      }),
    ])
  })

  it('keeps archived and hidden docs out of sidebar when drafts are included', () => {
    const sidebar = buildPayloadMarkdownDocsSidebar(
      [
        resolvedRecord({
          order: 0,
          route: '/payload-markdown',
          sourcePath: 'index.md',
          title: 'Overview',
        }),
        resolvedRecord({
          order: 10,
          route: '/payload-markdown/draft',
          sourcePath: 'draft.md',
          status: 'draft',
          title: 'Draft',
        }),
        resolvedRecord({
          archived: true,
          route: '/payload-markdown/archived',
          sourcePath: 'archived.md',
          title: 'Archived',
        }),
        resolvedRecord({
          overrides: {
            hideFromNav: true,
          },
          route: '/payload-markdown/hidden',
          sourcePath: 'hidden.md',
          title: 'Hidden',
        }),
      ],
      {
        docsSet: resolvedDocsSet,
        includeDrafts: true,
      },
    )

    expect(sidebar).toEqual([
      expect.objectContaining({
        label: 'Overview',
      }),
      expect.objectContaining({
        label: 'Draft',
      }),
    ])
  })
})

describe('Payload Markdown Docs link helpers', () => {
  it('builds ordered top-level docs navigation with nested groups and docs sets', async () => {
    const childGroup = {
      id: 'group-guides',
      slug: 'guides',
      order: 5,
      parent: docsGroup,
      title: 'Guides',
    }
    const payload = createPayloadMock({
      docsGroups: [
        docsGroup,
        childGroup,
        {
          id: 'group-api',
          slug: 'api',
          order: 0,
          title: 'API',
        },
      ],
      docsSets: [
        {
          ...docsSet,
          group: docsGroup,
          navTitle: 'Docs',
          order: 20,
        },
        {
          id: 'guides-set',
          slug: 'handbook',
          group: childGroup,
          order: 2,
          title: 'Handbook',
        },
        {
          id: 'cli-set',
          slug: 'cli',
          order: 5,
          title: 'CLI',
        },
      ],
    })

    await expect(getPayloadMarkdownDocsNavItems({ payload })).resolves.toEqual([
      expect.objectContaining({
        id: 'group-api',
        type: 'docsGroup',
        label: 'API',
        url: '/api',
      }),
      expect.objectContaining({
        id: 'group-1',
        type: 'docsGroup',
        children: [
          expect.objectContaining({
            id: 'group-guides',
            type: 'docsGroup',
            children: [
              expect.objectContaining({
                id: 'guides-set',
                url: '/plugins/guides/handbook',
              }),
            ],
            route: '/plugins/guides',
          }),
          expect.objectContaining({
            id: 'set-1',
            label: 'Docs',
            url: '/plugins/payload-markdown',
          }),
        ],
        label: 'Plugins',
        url: '/plugins',
      }),
      expect.objectContaining({
        id: 'cli-set',
        type: 'docsSet',
        label: 'CLI',
        url: '/cli',
      }),
    ])
  })

  it('links explicit custom groups to the custom group route', async () => {
    const payload = createPayloadMock({
      docsGroups: [
        {
          ...docsGroup,
          pageMode: 'custom',
        },
      ],
      docsSets: [
        {
          ...docsSet,
          group: docsGroup,
        },
      ],
    })

    await expect(getPayloadMarkdownDocsNavItems({ payload })).resolves.toEqual([
      expect.objectContaining({
        id: 'group-1',
        route: '/plugins',
        url: '/plugins',
      }),
    ])
  })

  it('caps only top-level docs nav items by explicit slots or existing header count', async () => {
    const payload = createPayloadMock({
      docsGroups: [docsGroup],
      docsSets: [
        {
          ...docsSet,
          group: docsGroup,
        },
        {
          id: 'api-set',
          slug: 'api',
          order: 20,
          title: 'API',
        },
      ],
    })

    await expect(
      getPayloadMarkdownDocsNavItems({
        existingItemsCount: 1,
        maxItems: 2,
        payload,
      }),
    ).resolves.toHaveLength(1)
    await expect(
      getPayloadMarkdownDocsNavItems({
        availableSlots: 0,
        payload,
      }),
    ).resolves.toEqual([])
  })

  it('excludes draft docs sets unless drafts are requested', async () => {
    const payload = createPayloadMock({
      docsSets: [
        {
          ...docsSet,
          _status: 'draft',
        },
      ],
    })

    await expect(getPayloadMarkdownDocsNavItems({ payload })).resolves.toEqual([])
    await expect(getPayloadMarkdownDocsNavItems({ includeDrafts: true, payload })).resolves.toEqual(
      [
        expect.objectContaining({
          id: 'set-1',
        }),
      ],
    )
  })

  it('returns Header adapter items without mutating existing nav items', async () => {
    const existingItems = [{ link: { type: 'custom', label: 'Home', url: '/' } }]
    const payload = createPayloadMock({
      docsGroups: [docsGroup],
      docsSets: [
        {
          ...docsSet,
          group: docsGroup,
        },
        {
          id: 'api-set',
          slug: 'api',
          order: 20,
          title: 'API',
        },
      ],
    })

    await expect(
      getPayloadMarkdownDocsHeaderNavItems({
        existingItems,
        maxItems: 2,
        payload,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        link: {
          type: 'custom',
          label: 'Plugins',
          url: '/plugins',
        },
      }),
    ])
    await expect(
      getPayloadMarkdownDocsHeaderNavItems({
        availableSlots: 1,
        mode: 'relationship',
        payload,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        link: {
          type: 'reference',
          label: 'Plugins',
          reference: {
            relationTo: 'docs-groups',
            value: 'group-1',
          },
        },
      }),
    ])
    await expect(
      appendPayloadMarkdownDocsHeaderNavItems({
        availableSlots: 1,
        existingItems,
        payload,
      }),
    ).resolves.toEqual([
      existingItems[0],
      expect.objectContaining({
        link: expect.objectContaining({
          label: 'Plugins',
        }),
      }),
    ])
    expect(existingItems).toEqual([{ link: { type: 'custom', label: 'Home', url: '/' } }])
  })

  it('renders a drop-in navbar with override classes and exact active state', async () => {
    const markup = renderToStaticMarkup(
      await PayloadMarkdownDocsNavbar({
        classNames: {
          activeLink: 'is-active',
          root: 'docs-nav',
        },
        currentPath: '/plugins/payload-markdown',
        items: [
          {
            id: 'group-1',
            type: 'docsGroup',
            children: [
              {
                id: 'set-1',
                type: 'docsSet',
                collection: 'docs-sets',
                label: 'Payload Markdown',
                order: 0,
                route: '/plugins/payload-markdown',
                url: '/plugins/payload-markdown',
              },
            ],
            collection: 'docs-groups',
            label: 'Plugins',
            order: 0,
            route: '/plugins',
            url: '/plugins',
          },
        ],
      }),
    )

    expect(markup).toContain('class="docs-nav"')
    expect(markup).toContain('href="/plugins/payload-markdown"')
    expect(markup).toContain('aria-current="page"')
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1)
    expect(markup).toContain('is-active')
  })
})

describe('Payload Markdown Docs page component', () => {
  it('renders styled shell defaults for docs routes', async () => {
    const markup = renderToStaticMarkup(
      await PayloadMarkdownDocsPage({
        resolved: {
          type: 'docsSetIndex',
          docsSet: resolvedDocsSet,
          route: '/payload-markdown',
          sidebar: [
            {
              children: [
                {
                  depth: 1,
                  label: 'Installation',
                  order: 10,
                  route: '/payload-markdown/getting-started/installation',
                  sourcePath: 'getting-started/installation.md',
                },
              ],
              depth: 0,
              label: 'Getting Started',
              order: 0,
              sourcePath: 'getting-started',
            },
          ],
        },
      }),
    )

    expect(markup).toContain('min-h-screen bg-background text-foreground')
    expect(markup).toContain('data-payload-markdown-docs-layout="with-sidebar"')
    expect(markup).toContain('grid-template-columns: 16rem minmax(0, 1fr)')
    expect(markup).toContain('margin-top:6rem')
    expect(markup).toContain('aria-label="Docs navigation"')
    expect(markup).toContain('border-border')
    expect(markup).toContain('<span')
    expect(markup).not.toContain('href="/payload-markdown/getting-started"')
    expect(markup).toContain('href="/payload-markdown/getting-started/installation"')
  })

  it('renders a hero image without the no-hero top margin', async () => {
    const markup = renderToStaticMarkup(
      await PayloadMarkdownDocsPage({
        resolved: {
          type: 'doc',
          doc: resolvedRecord({
            content: undefined,
            heroImage: {
              alt: 'Docs hero',
              height: 600,
              url: '/media/docs-hero.jpg',
              width: 1200,
            },
          }),
          docsSet: resolvedDocsSet,
          route: '/payload-markdown/getting-started/installation',
          sidebar: [],
        },
      }),
    )

    expect(markup).toContain('data-payload-markdown-docs-hero')
    expect(markup).toContain('src="/media/docs-hero.jpg"')
    expect(markup).not.toContain('margin-top:6rem')
  })

  it('uses an authored docs set index page instead of inserting generated title and description', async () => {
    const markup = renderToStaticMarkup(
      await PayloadMarkdownDocsPage({
        resolved: {
          type: 'docsSetIndex',
          doc: resolvedRecord({
            content: 'Authored plugin home content.\n',
            description: 'Generated description should not render.',
            route: '/payload-markdown',
            sourcePath: 'index.md',
            title: 'Generated Home Title',
          }),
          docsSet: resolvedDocsSet,
          route: '/payload-markdown',
          sidebar: [],
        },
      }),
    )

    expect(markup).toContain('Authored plugin home content.')
    expect(markup).not.toContain('Generated Home Title')
    expect(markup).not.toContain('Generated description should not render.')
  })

  it('uses authored nested index pages while sidebar sections without index pages stay unlinked', async () => {
    const markup = renderToStaticMarkup(
      await PayloadMarkdownDocsPage({
        resolved: {
          type: 'doc',
          doc: resolvedRecord({
            content: 'Authored nested index content.\n',
            description: 'Nested generated description should not render.',
            route: '/payload-markdown/installation',
            sourcePath: 'installation/index.md',
            title: 'Generated Installation Title',
          }),
          docsSet: resolvedDocsSet,
          route: '/payload-markdown/installation',
          sidebar: [
            {
              children: [
                {
                  depth: 1,
                  label: 'Options',
                  order: 10,
                  route: '/payload-markdown/configuration/options',
                  sourcePath: 'configuration/options.md',
                },
              ],
              depth: 0,
              label: 'Configuration',
              order: 10,
              sourcePath: 'configuration',
            },
          ],
        },
      }),
    )

    expect(markup).toContain('Authored nested index content.')
    expect(markup).not.toContain('Generated Installation Title')
    expect(markup).not.toContain('Nested generated description should not render.')
    expect(markup).toContain('<span')
    expect(markup).not.toContain('href="/payload-markdown/configuration"')
    expect(markup).toContain('href="/payload-markdown/configuration/options"')
  })

  it('renders generated group indexes with child group and docs set cards', async () => {
    const markup = renderToStaticMarkup(
      await PayloadMarkdownDocsPage({
        resolved: {
          type: 'docsGroupIndex',
          childGroups: [
            {
              id: 'group-guides',
              description: 'Guides and tutorials.',
              order: 0,
              pageMode: 'auto',
              routePath: '/plugins/guides',
              title: 'Guides',
            },
          ],
          docsSets: [
            {
              ...resolvedDocsSet,
              productRoute: '/plugins/payload-markdown',
              routeBase: '/plugins/payload-markdown/docs',
              routeMode: 'product-nested',
            },
          ],
          group: {
            id: 'group-1',
            description: 'Plugin documentation.',
            order: 0,
            pageMode: 'auto',
            routePath: '/plugins',
            title: 'Plugins',
          },
          route: '/plugins',
        },
      }),
    )

    expect(markup).toContain('href="/plugins/guides"')
    expect(markup).toContain('href="/plugins/payload-markdown"')
    expect(markup).toContain('href="/plugins/payload-markdown/docs"')
    expect(markup).toContain('Guides and tutorials.')
    expect(markup).toContain('Docs set description.')
    expect(markup).toContain('Documentation')
    expect(markup).toContain('margin-top:6rem')
  })
})

describe('Payload Markdown Docs marketing components', () => {
  it('exports renderable docs marketing blocks from /next', () => {
    const ctaMarkup = renderToStaticMarkup(
      DocsCTA({
        docsUrl: '/payload-markdown/docs',
        heading: 'Read the docs',
      }),
    )
    const previewMarkup = renderToStaticMarkup(
      DocsPreview({
        heading: 'Explore docs',
        items: [
          {
            excerpt: 'Install the package.',
            href: '/payload-markdown/docs/install',
            title: 'Installation',
          },
        ],
      }),
    )
    const calloutMarkup = renderToStaticMarkup(
      DocsCallout({
        excerpt: 'Configuration reference.',
        heading: 'Need options?',
        manualHref: '/payload-markdown/docs/configuration',
      }),
    )
    const bannerMarkup = renderToStaticMarkup(
      DocsBanner({
        ctaButtons: [
          {
            href: '/payload-markdown/docs',
            label: 'Open docs',
          },
        ],
        heading: 'Ship with documentation',
      }),
    )

    expect(ctaMarkup).toContain('Read the docs')
    expect(ctaMarkup).toContain('href="/payload-markdown/docs"')
    expect(previewMarkup).toContain('Installation')
    expect(calloutMarkup).toContain('Configuration reference.')
    expect(bannerMarkup).toContain('Open docs')
  })

  it('exports renderable heroes and skill CTAs from /next', () => {
    const productHeroMarkup = renderToStaticMarkup(
      DocsProductHero({
        description: 'Guides, API references, and agent skills.',
        heading: 'Payload Markdown Docs',
        primaryAction: {
          href: '/payload-markdown/docs',
          label: 'Read docs',
        },
      }),
    )
    const nativeHeroMarkup = renderToStaticMarkup(
      DocsNativeHero({
        breadcrumb: [{ href: '/docs', label: 'Docs' }, { label: 'Configuration' }],
        description: 'Plugin options.',
        title: 'Configuration',
      }),
    )
    const skillGroupMarkup = renderToStaticMarkup(
      SkillCTAGroup({
        skills: {
          enabled: true,
          items: [
            {
              type: 'codex',
              href: '/skills/codex',
              label: 'Codex skill',
            },
          ],
        },
      }),
    )
    const skillTabsMarkup = renderToStaticMarkup(
      SkillTabs({
        items: [
          {
            type: 'claude',
            href: '/skills/claude',
            label: 'Claude skill',
          },
        ],
      }),
    )

    expect(productHeroMarkup).toContain('Payload Markdown Docs')
    expect(nativeHeroMarkup).toContain('Configuration')
    expect(skillGroupMarkup).toContain('Codex skill')
    expect(skillTabsMarkup).toContain('Claude skill')
  })
})

describe('Payload Markdown Docs metadata helpers', () => {
  it('uses doc title and description before docs set metadata', () => {
    const metadata = getPayloadMarkdownDocsMetadata({
      type: 'doc',
      doc: resolvedRecord(),
      docsSet: resolvedDocsSet,
      route: '/payload-markdown/getting-started/installation',
      sidebar: [],
    })

    expect(metadata).toEqual({
      description: 'Install docs.',
      openGraph: {
        description: 'Install docs.',
        title: 'Installation',
      },
      title: 'Installation',
      twitter: {
        description: 'Install docs.',
        title: 'Installation',
      },
    })
  })

  it('uses docs set OpenGraph metadata for docs set shell routes', () => {
    const metadata = getPayloadMarkdownDocsMetadata({
      type: 'docsSetIndex',
      docsSet: {
        ...resolvedDocsSet,
        openGraph: {
          description: 'OpenGraph docs set description.',
          image: {
            id: 'media-1',
            alt: 'OpenGraph preview',
            height: 630,
            relationTo: 'media',
            url: '/media/docs-og.png',
            width: 1200,
          },
          title: 'OpenGraph Payload Markdown',
        },
      },
      route: '/payload-markdown',
      sidebar: [],
    })

    expect(metadata).toEqual({
      description: 'OpenGraph docs set description.',
      openGraph: {
        description: 'OpenGraph docs set description.',
        images: [
          {
            alt: 'OpenGraph preview',
            height: 630,
            url: '/media/docs-og.png',
            width: 1200,
          },
        ],
        title: 'OpenGraph Payload Markdown',
      },
      title: 'OpenGraph Payload Markdown',
      twitter: {
        card: 'summary_large_image',
        description: 'OpenGraph docs set description.',
        images: [
          {
            alt: 'OpenGraph preview',
            height: 630,
            url: '/media/docs-og.png',
            width: 1200,
          },
        ],
        title: 'OpenGraph Payload Markdown',
      },
    })
  })

  it('lets docs pages inherit the docs set OpenGraph image while overriding title and description', () => {
    const metadata = getPayloadMarkdownDocsMetadata({
      type: 'doc',
      doc: resolvedRecord(),
      docsSet: {
        ...resolvedDocsSet,
        openGraph: {
          description: 'OpenGraph docs set description.',
          image: {
            alt: 'OpenGraph preview',
            height: 630,
            url: '/media/docs-og.png',
            width: 1200,
          },
          title: 'OpenGraph Payload Markdown',
        },
      },
      route: '/payload-markdown/getting-started/installation',
      sidebar: [],
    })

    expect(metadata).toEqual({
      description: 'Install docs.',
      openGraph: {
        description: 'Install docs.',
        images: [
          {
            alt: 'OpenGraph preview',
            height: 630,
            url: '/media/docs-og.png',
            width: 1200,
          },
        ],
        title: 'Installation',
      },
      title: 'Installation',
      twitter: {
        card: 'summary_large_image',
        description: 'Install docs.',
        images: [
          {
            alt: 'OpenGraph preview',
            height: 630,
            url: '/media/docs-og.png',
            width: 1200,
          },
        ],
        title: 'Installation',
      },
    })
  })

  it('keeps metadata compact when docs set fields are empty', () => {
    const metadata = getPayloadMarkdownDocsMetadata({
      type: 'docsSetIndex',
      docsSet: {
        ...resolvedDocsSet,
        description: undefined,
        navTitle: undefined,
        openGraph: undefined,
        title: '',
      },
      route: '/payload-markdown',
      sidebar: [],
    })

    expect(metadata).toEqual({})
  })

  it('does not render docs set OpenGraph images in the page component', async () => {
    const markup = renderToStaticMarkup(
      await PayloadMarkdownDocsPage({
        resolved: {
          type: 'docsSetIndex',
          docsSet: {
            ...resolvedDocsSet,
            openGraph: {
              image: {
                alt: 'OpenGraph preview',
                url: '/media/docs-og.png',
              },
            },
          },
          route: '/payload-markdown',
          sidebar: [],
        },
      }),
    )

    expect(markup).not.toContain('/media/docs-og.png')
    expect(markup).not.toContain('data-payload-markdown-docs-hero')
  })

  it('uses docs set nav title before title when OpenGraph title is empty', () => {
    const metadata = getPayloadMarkdownDocsMetadata({
      type: 'docsSetIndex',
      docsSet: {
        ...resolvedDocsSet,
        navTitle: 'Docs Nav',
      },
      route: '/payload-markdown',
      sidebar: [],
    })

    expect(metadata).toEqual({
      description: 'Docs set description.',
      openGraph: {
        description: 'Docs set description.',
        title: 'Docs Nav',
      },
      title: 'Docs Nav',
      twitter: {
        description: 'Docs set description.',
        title: 'Docs Nav',
      },
    })
  })

  it('uses group metadata for group index routes', () => {
    const metadata = getPayloadMarkdownDocsMetadata({
      type: 'docsGroupIndex',
      childGroups: [],
      docsSets: [],
      group: {
        id: 'group-1',
        description: 'Plugin documentation.',
        order: 0,
        pageMode: 'auto',
        routePath: '/plugins',
        title: 'Plugins',
      },
      route: '/plugins',
    })

    expect(metadata).toEqual({
      description: 'Plugin documentation.',
      openGraph: {
        description: 'Plugin documentation.',
        title: 'Plugins',
      },
      title: 'Plugins',
      twitter: {
        description: 'Plugin documentation.',
        title: 'Plugins',
      },
    })
  })
})

describe('Payload Markdown Docs /next package export', () => {
  it('is declared in package exports with published files', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as {
      exports: Record<string, unknown>
    }

    expect(packageJson.exports['.']).toMatchObject({
      import: './dist/index.js',
      types: './dist/index.d.ts',
    })
    expect(packageJson.exports['./next']).toMatchObject({
      import: './dist/next/index.js',
      types: './dist/next/index.d.ts',
    })
    expect(packageJson.exports['./admin']).toMatchObject({
      import: './dist/admin/index.js',
      types: './dist/admin/index.d.ts',
    })
    expect(packageJson.exports['./blocks']).toMatchObject({
      import: './dist/blocks/index.js',
      types: './dist/blocks/index.d.ts',
    })
  })
})
