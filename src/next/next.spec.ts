import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type {
  PayloadMarkdownDocsReadPayload,
  ResolvedPayloadMarkdownDocsRecord,
  ResolvedPayloadMarkdownDocsSet,
} from './types.js'

import { getPayloadMarkdownDocsMetadata } from './metadata.js'
import { PayloadMarkdownDocsPage } from './PayloadMarkdownDocsPage.js'
import {
  getPayloadMarkdownDocsRoutePath,
  resolvePayloadMarkdownDocsRoute,
} from './route.js'
import {
  buildPayloadMarkdownDocsSidebar,
  getPayloadMarkdownDocsSidebar,
} from './sidebar.js'

type TestPayloadData = {
  docs?: Record<string, unknown>[]
  docsGroups?: Record<string, unknown>[]
  docsSets?: Record<string, unknown>[]
}

const docsSet = {
  id: 'set-1',
  slug: 'payload-markdown',
  defaults: {
    heroDescription: 'Default hero.',
    seoDescription: 'Default SEO description.',
    seoTitle: 'Default SEO title',
  },
  description: 'Docs set description.',
  order: 10,
  routeBase: '/plugins/payload-markdown',
  sourceId: 'payload-markdown',
  title: 'Payload Markdown',
}

const docsGroup = {
  id: 'group-1',
  slug: 'plugins',
  description: 'Plugin documentation.',
  order: 0,
  routePath: '/plugins',
  serveIndex: true,
  title: 'Plugins',
}

const createDoc = (
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  id: 'doc-1',
  content: '# Installation\n',
  depth: 1,
  description: 'Install docs.',
  docsSet,
  order: 10,
  route: '/plugins/payload-markdown/getting-started/installation',
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
  docsGroups = [],
  docsSets = [],
}: TestPayloadData): {
  find: ReturnType<typeof vi.fn>
} & PayloadMarkdownDocsReadPayload => {
  const collections: Record<string, Record<string, unknown>[]> = {
    docs,
    'docs-groups': docsGroups,
    'docs-sets': docsSets,
  }

  return {
    find: vi.fn((args) =>
      Promise.resolve({
        docs: (collections[args.collection] ?? []).filter((doc) =>
          matchesWhere(doc, args.where),
        ),
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
  route: '/plugins/payload-markdown/getting-started/installation',
  sourcePath: 'getting-started/installation.md',
  title: 'Installation',
  ...overrides,
})

const resolvedDocsSet: ResolvedPayloadMarkdownDocsSet = {
  id: 'set-1',
  defaults: {
    seoDescription: 'Default SEO description.',
    seoTitle: 'Default SEO title',
  },
  description: 'Docs set description.',
  order: 0,
  routeBase: '/plugins/payload-markdown',
  sourceId: 'payload-markdown',
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
      path: '/plugins/payload-markdown/getting-started/installation',
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
    const route = '/plugins/payload-markdown/getting-started/installation'
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
        overrideAccess: true,
        where: {
          routeBase: {
            equals: route,
          },
        },
      }),
    )
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
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
          route: '/plugins/payload-markdown',
          sourcePath: 'index.md',
          title: 'Overview',
        }),
      ],
      docsSets: [docsSet],
    })

    const resolved = await resolvePayloadMarkdownDocsRoute({
      slug: ['plugins', 'payload-markdown'],
      payload,
    })

    expect(resolved).toMatchObject({
      type: 'docsSetIndex',
      doc: {
        id: 'doc-index',
      },
      docsSet: {
        routeBase: '/plugins/payload-markdown',
      },
    })
  })

  it('resolves a docs set route base without an index doc', async () => {
    const payload = createPayloadMock({
      docs: [],
      docsSets: [docsSet],
    })

    const resolved = await resolvePayloadMarkdownDocsRoute({
      path: '/plugins/payload-markdown',
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

  it('resolves docs group routes only when serveIndex is true', async () => {
    const payload = createPayloadMock({
      docsGroups: [docsGroup],
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
          serveIndex: false,
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
        where: {
          routePath: {
            equals: '/plugins',
          },
        },
      }),
    )
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs-sets',
        overrideAccess: true,
        where: {
          group: {
            equals: docsGroup.id,
          },
        },
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
        path: '/plugins/payload-markdown/getting-started/installation',
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
        path: '/plugins/payload-markdown/getting-started/installation',
        payload: draftPayload,
      }),
    ).resolves.toBeNull()
    await expect(
      resolvePayloadMarkdownDocsRoute({
        includeDrafts: true,
        path: '/plugins/payload-markdown/getting-started/installation',
        payload: draftPayload,
      }),
    ).resolves.toMatchObject({
      type: 'doc',
    })
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
          route: '/plugins/payload-markdown/configuration/sync',
          sourcePath: 'configuration/sync.md',
          title: 'Sync',
        }),
        resolvedRecord({
          order: 0,
          route: '/plugins/payload-markdown',
          sourcePath: 'index.md',
          title: 'Overview',
        }),
        resolvedRecord({
          order: 10,
          overrides: {
            navTitle: 'Install',
          },
          route: '/plugins/payload-markdown/getting-started/installation',
          sourcePath: 'getting-started/installation.md',
          title: 'Installation',
        }),
        resolvedRecord({
          archived: true,
          order: 30,
          route: '/plugins/payload-markdown/archived',
          sourcePath: 'archived.md',
          title: 'Archived',
        }),
        resolvedRecord({
          order: 40,
          route: '/plugins/payload-markdown/draft',
          sourcePath: 'draft.md',
          status: 'draft',
          title: 'Draft',
        }),
        resolvedRecord({
          overrides: {
            hideFromNav: true,
          },
          route: '/plugins/payload-markdown/hidden',
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
  })

  it('keeps archived and hidden docs out of sidebar when drafts are included', () => {
    const sidebar = buildPayloadMarkdownDocsSidebar(
      [
        resolvedRecord({
          order: 0,
          route: '/plugins/payload-markdown',
          sourcePath: 'index.md',
          title: 'Overview',
        }),
        resolvedRecord({
          order: 10,
          route: '/plugins/payload-markdown/draft',
          sourcePath: 'draft.md',
          status: 'draft',
          title: 'Draft',
        }),
        resolvedRecord({
          archived: true,
          route: '/plugins/payload-markdown/archived',
          sourcePath: 'archived.md',
          title: 'Archived',
        }),
        resolvedRecord({
          overrides: {
            hideFromNav: true,
          },
          route: '/plugins/payload-markdown/hidden',
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

describe('Payload Markdown Docs page component', () => {
  it('renders styled shell defaults for docs routes', async () => {
    const markup = renderToStaticMarkup(
      await PayloadMarkdownDocsPage({
        resolved: {
          type: 'docsSetIndex',
          docsSet: resolvedDocsSet,
          route: '/plugins/payload-markdown',
          sidebar: [
            {
              depth: 0,
              label: 'Overview',
              order: 0,
              route: '/plugins/payload-markdown',
              sourcePath: 'index.md',
            },
          ],
        },
      }),
    )

    expect(markup).toContain('min-h-screen bg-background text-foreground')
    expect(markup).toContain('lg:grid-cols-[16rem_minmax(0,1fr)]')
    expect(markup).toContain('aria-label="Docs navigation"')
    expect(markup).toContain('border-border')
  })
})

describe('Payload Markdown Docs metadata helpers', () => {
  it('uses doc overrides before doc and docs set metadata', () => {
    const metadata = getPayloadMarkdownDocsMetadata({
      type: 'doc',
      doc: resolvedRecord({
        overrides: {
          seoDescription: 'Override description.',
          seoTitle: 'Override title',
        },
      }),
      docsSet: resolvedDocsSet,
      route: '/plugins/payload-markdown/getting-started/installation',
      sidebar: [],
    })

    expect(metadata).toEqual({
      description: 'Override description.',
      title: 'Override title',
    })
  })

  it('uses docs set metadata for docs set shell routes', () => {
    const metadata = getPayloadMarkdownDocsMetadata({
      type: 'docsSetIndex',
      docsSet: resolvedDocsSet,
      route: '/plugins/payload-markdown',
      sidebar: [],
    })

    expect(metadata).toEqual({
      description: 'Default SEO description.',
      title: 'Default SEO title',
    })
  })

  it('uses group metadata for group index routes', () => {
    const metadata = getPayloadMarkdownDocsMetadata({
      type: 'docsGroupIndex',
      docsSets: [],
      group: {
        id: 'group-1',
        description: 'Plugin documentation.',
        order: 0,
        routePath: '/plugins',
        serveIndex: true,
        title: 'Plugins',
      },
      route: '/plugins',
    })

    expect(metadata).toEqual({
      description: 'Plugin documentation.',
      title: 'Plugins',
    })
  })
})

describe('Payload Markdown Docs /next package export', () => {
  it('is declared in package exports without changing root exports', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as {
      exports: Record<string, unknown>
      publishConfig: {
        exports: Record<string, unknown>
      }
    }

    expect(packageJson.exports['.']).toBeDefined()
    expect(packageJson.exports['./next']).toMatchObject({
      import: './src/next/index.ts',
      types: './src/next/index.ts',
    })
    expect(packageJson.publishConfig.exports['./next']).toMatchObject({
      import: './dist/next/index.js',
      types: './dist/next/index.d.ts',
    })
  })
})
