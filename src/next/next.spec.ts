import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type {
  PayloadMarkdownDocsReadPayload,
  ResolvedPayloadMarkdownDocsRecord,
  ResolvedPayloadMarkdownDocsSet,
} from './types.js'

import { getPayloadMarkdownDocsLinks } from './links.js'
import { resolvePayloadMarkdownDocsMarkdownRoute } from './markdown.js'
import { getPayloadMarkdownDocsMetadata } from './metadata.js'
import { PayloadMarkdownDocsPage } from './PayloadMarkdownDocsPage.js'
import { getPayloadMarkdownDocsRoutePath, resolvePayloadMarkdownDocsRoute } from './route.js'
import { buildPayloadMarkdownDocsSidebar, getPayloadMarkdownDocsSidebar } from './sidebar.js'

type TestPayloadData = {
  docs?: Record<string, unknown>[]
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
  serveIndex: true,
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
  routeBase: '/payload-markdown',
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

  it('does not resolve AI export manifest files as normal docs routes', async () => {
    const payload = createPayloadMock({
      docs: [
        createDoc({
          id: 'ai-manifest',
          route: '/payload-markdown/index.ai.yml',
          sourcePath: 'index.ai.yml',
          title: 'AI Manifest',
        }),
      ],
      docsSets: [docsSet],
    })

    await expect(
      resolvePayloadMarkdownDocsRoute({
        path: '/payload-markdown/index.ai.yml',
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
})

describe('Payload Markdown Docs raw Markdown export', () => {
  it('assembles raw Markdown from docs records using index.ai.yml ordering', async () => {
    const payload = createPayloadMock({
      docs: [
        createDoc({
          id: 'doc-index',
          content: '# Overview\n\nWelcome.\n',
          order: 0,
          route: '/payload-markdown',
          sourcePath: 'index.md',
          title: 'Overview',
        }),
        createDoc({
          id: 'doc-usage',
          content: '# Usage\n\nUse it.\n',
          order: 30,
          route: '/payload-markdown/usage',
          sourcePath: 'usage.md',
          title: 'Usage',
        }),
        createDoc({
          id: 'doc-install',
          content: '# Install\n\nInstall it.\n',
          order: 20,
          route: '/payload-markdown/install',
          sourcePath: 'install.md',
          title: 'Install',
        }),
        createDoc({
          id: 'doc-internal',
          content: '# Internal\n\nSecret.\n',
          order: 10,
          route: '/payload-markdown/internal',
          sourcePath: 'internal.md',
          title: 'Internal',
        }),
      ],
      docsSets: [
        {
          ...docsSet,
          aiExport: {
            canonical: '/payload-markdown',
            description: 'Consolidated AI docs.',
            exclude: ['./internal.md'],
            headingMode: 'normalize',
            order: ['./index.md', './install.md'],
            orphans: 'append',
            output: '/payload-markdown.md',
            preamble: 'Read the documents in order.',
            sourcePath: 'index.ai.yml',
            title: 'Payload Markdown Documentation',
            version: 1,
          },
        },
      ],
    })

    const resolved = await resolvePayloadMarkdownDocsMarkdownRoute({
      path: '/payload-markdown.md',
      payload,
    })

    expect(resolved).toMatchObject({
      type: 'markdown',
      contentType: 'text/markdown; charset=utf-8',
      output: '/payload-markdown.md',
    })
    expect(resolved?.markdown.startsWith('# Payload Markdown Documentation')).toBe(true)
    expect(resolved?.markdown).toContain('Read the documents in order.')
    expect(resolved?.markdown).toContain('## Overview')
    expect(resolved?.markdown).toContain('### Overview')
    expect(resolved?.markdown).not.toContain('Secret.')
    expect(resolved?.markdown.indexOf('## Overview')).toBeLessThan(
      resolved?.markdown.indexOf('## Install') ?? -1,
    )
    expect(resolved?.markdown.indexOf('## Install')).toBeLessThan(
      resolved?.markdown.indexOf('## Usage') ?? -1,
    )
  })

  it('omits unlisted docs when manifest orphans is ignore', async () => {
    const payload = createPayloadMock({
      docs: [
        createDoc({
          id: 'doc-index',
          content: '# Overview\n',
          route: '/payload-markdown',
          sourcePath: 'index.md',
          title: 'Overview',
        }),
        createDoc({
          id: 'doc-usage',
          content: '# Usage\n',
          route: '/payload-markdown/usage',
          sourcePath: 'usage.md',
          title: 'Usage',
        }),
      ],
      docsSets: [
        {
          ...docsSet,
          aiExport: {
            exclude: [],
            headingMode: 'preserve',
            order: ['./index.md'],
            orphans: 'ignore',
            sourcePath: 'index.ai.yml',
            version: 1,
          },
        },
      ],
    })

    const resolved = await resolvePayloadMarkdownDocsMarkdownRoute({
      path: '/payload-markdown.md',
      payload,
    })

    expect(resolved?.markdown).toContain('# Overview')
    expect(resolved?.markdown).not.toContain('# Usage')
  })

  it('uses manifest output as an alternate raw Markdown route', async () => {
    const payload = createPayloadMock({
      docs: [
        createDoc({
          id: 'doc-index',
          content: '# Overview\n',
          route: '/payload-markdown',
          sourcePath: 'index.md',
          title: 'Overview',
        }),
      ],
      docsSets: [
        {
          ...docsSet,
          aiExport: {
            exclude: [],
            headingMode: 'normalize',
            order: ['./index.md'],
            orphans: 'append',
            output: '/ai/payload-markdown.md',
            sourcePath: 'index.ai.yml',
            version: 1,
          },
        },
      ],
    })

    const resolved = await resolvePayloadMarkdownDocsMarkdownRoute({
      path: '/ai/payload-markdown.md',
      payload,
    })

    expect(resolved?.output).toBe('/ai/payload-markdown.md')
    expect(resolved?.markdown).toContain('## Overview')
  })

  it('falls back to deterministic ordering when no AI manifest exists', async () => {
    const payload = createPayloadMock({
      docs: [
        createDoc({
          id: 'doc-b',
          content: '# Beta\n',
          order: 20,
          route: '/payload-markdown/beta',
          sourcePath: 'beta.md',
          title: 'Beta',
        }),
        createDoc({
          id: 'doc-a',
          content: '# Alpha\n',
          order: 10,
          route: '/payload-markdown/alpha',
          sourcePath: 'alpha.md',
          title: 'Alpha',
        }),
      ],
      docsSets: [docsSet],
    })

    const resolved = await resolvePayloadMarkdownDocsMarkdownRoute({
      path: '/payload-markdown.md',
      payload,
    })

    expect(resolved?.markdown.indexOf('## Alpha')).toBeLessThan(
      resolved?.markdown.indexOf('## Beta') ?? -1,
    )
  })

  it('returns null for missing raw Markdown docs set routes', async () => {
    const payload = createPayloadMock({
      docs: [],
      docsGroups: [docsGroup],
      docsSets: [],
    })

    await expect(
      resolvePayloadMarkdownDocsMarkdownRoute({
        path: '/plugins/missing.md',
        payload,
      }),
    ).resolves.toBeNull()
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
  it('returns Header/CMSLink-compatible docs set links with derived group routes', async () => {
    const payload = createPayloadMock({
      docsGroups: [docsGroup],
      docsSets: [
        {
          ...docsSet,
          group: docsGroup,
          navTitle: 'Docs',
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
      getPayloadMarkdownDocsLinks({
        payload,
      }),
    ).resolves.toEqual([
      {
        label: 'Docs',
        url: '/plugins/payload-markdown',
      },
      {
        label: 'API',
        url: '/api',
      },
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
      title: 'Installation',
    })
  })

  it('uses docs set metadata for docs set shell routes', () => {
    const metadata = getPayloadMarkdownDocsMetadata({
      type: 'docsSetIndex',
      docsSet: resolvedDocsSet,
      route: '/payload-markdown',
      sidebar: [],
    })

    expect(metadata).toEqual({
      description: 'Docs set description.',
      title: 'Payload Markdown',
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
  })
})
