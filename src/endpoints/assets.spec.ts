import type { Config, PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
} from '../constants.js'
import { payloadMarkdownDocs } from '../plugin.js'
import { createDocsAssetsEndpoints } from './assets.js'

type MockPayload = {
  find: ReturnType<typeof vi.fn>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getNestedValue = (doc: unknown, field: string): unknown => {
  if (!isRecord(doc)) {
    return undefined
  }

  return field.split('.').reduce<unknown>((value, segment) => {
    if (!isRecord(value)) {
      return undefined
    }

    return value[segment]
  }, doc)
}

const getComparableValue = (value: unknown): unknown =>
  isRecord(value) && (typeof value.id === 'string' || typeof value.id === 'number')
    ? value.id
    : value

const matchesConstraint = (doc: unknown, field: string, constraint: unknown): boolean => {
  if (!isRecord(constraint)) {
    return true
  }

  const value = getComparableValue(getNestedValue(doc, field))

  if ('equals' in constraint) {
    return value === constraint.equals
  }

  if ('not_equals' in constraint) {
    return value !== constraint.not_equals
  }

  return true
}

const matchesWhere = (doc: unknown, where: unknown): boolean => {
  if (!isRecord(where)) {
    return true
  }

  const andConstraints = where.and
  const orConstraints = where.or

  if (Array.isArray(andConstraints) && !andConstraints.every((item) => matchesWhere(doc, item))) {
    return false
  }

  if (Array.isArray(orConstraints) && !orConstraints.some((item) => matchesWhere(doc, item))) {
    return false
  }

  return Object.entries(where).every(([field, constraint]) =>
    field === 'and' || field === 'or' ? true : matchesConstraint(doc, field, constraint),
  )
}

const createMockPayload = ({
  assets = [],
  assetsFindError,
  docs = [],
  docsGroups = [],
  docsSets = [],
}: {
  assets?: unknown[]
  assetsFindError?: Error
  docs?: unknown[]
  docsGroups?: unknown[]
  docsSets?: unknown[]
} = {}): MockPayload => ({
  find: vi.fn((args) => {
    if (args.collection === DEFAULT_DOCS_ASSETS_COLLECTION_SLUG) {
      if (assetsFindError) {
        return Promise.reject(assetsFindError)
      }

      return Promise.resolve({
        docs: assets.filter((asset) => matchesWhere(asset, args.where)),
      })
    }

    if (args.collection === DEFAULT_DOCS_COLLECTION_SLUG) {
      return Promise.resolve({
        docs: docs.filter((doc) => matchesWhere(doc, args.where)),
      })
    }

    if (args.collection === DEFAULT_DOCS_SETS_COLLECTION_SLUG) {
      return Promise.resolve({
        docs: docsSets,
      })
    }

    if (args.collection === DEFAULT_DOCS_GROUPS_COLLECTION_SLUG) {
      return Promise.resolve({
        docs: docsGroups,
      })
    }

    return Promise.resolve({
      docs: [],
    })
  }),
})

const createRequest = ({
  payload,
  routeParams,
  url,
}: {
  payload: MockPayload
  routeParams?: Record<string, unknown>
  url: string
}): PayloadRequest =>
  Object.assign(new Request(url), {
    payload,
    routeParams,
  }) as unknown as PayloadRequest

describe('docs asset endpoints', () => {
  it('registers plugin-owned root asset endpoints', () => {
    const config = payloadMarkdownDocs({ enabled: true })({
      collections: [],
    } as unknown as Config) as Config
    const endpoints = config.endpoints as Array<{ path: string; root?: boolean }>

    expect(endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/llms.txt',
          root: true,
        }),
        expect.objectContaining({
          path: '/llms-full.txt',
          root: true,
        }),
        expect.objectContaining({
          path: '/:routeBase*/llms.txt',
          root: true,
        }),
        expect.objectContaining({
          path: '/:routeBase*/llms-full.txt',
          root: true,
        }),
        expect.objectContaining({
          path: '/:routeBase*/skills/:agent/:assetPath*',
          root: true,
        }),
      ]),
    )
  })

  it('serves llms.txt from synced asset storage', async () => {
    const endpoint = createDocsAssetsEndpoints({}).find((item) => item.path === '/llms.txt')
    const payload = createMockPayload({
      assets: [
        {
          id: 'asset-1',
          content: '# Main Docs\n',
          contentType: 'text/plain; charset=utf-8',
          kind: 'llms',
          route: '/llms.txt',
          sourcePath: 'llms.txt',
          sync: {
            archived: false,
          },
        },
      ],
    })

    const response = await endpoint?.handler(
      createRequest({
        payload,
        url: 'https://example.com/llms.txt',
      }),
    )

    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toContain('text/plain')
    expect(await response?.text()).toBe('# Main Docs\n')
  })

  it('serves docs-set llms.txt aliases from synced asset storage', async () => {
    const endpoint = createDocsAssetsEndpoints({}).find(
      (item) => item.path === '/:routeBase*/llms.txt',
    )
    const payload = createMockPayload({
      assets: [
        {
          id: 'asset-1',
          content: '# Payload Markdown Docs\n',
          contentType: 'text/plain; charset=utf-8',
          docsSet: 'docs-set-1',
          kind: 'llms',
          route: '/llms.txt',
          sourceId: 'payload-markdown-docs',
          sourcePath: 'llms.txt',
          sync: {
            archived: false,
            sourceId: 'payload-markdown-docs',
          },
        },
      ],
      docsGroups: [
        {
          id: 'docs-group-1',
          slug: 'plugins',
        },
      ],
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'payload-markdown-docs',
          group: 'docs-group-1',
        },
      ],
    })

    const response = await endpoint?.handler(
      createRequest({
        payload,
        routeParams: {
          routeBase: ['plugins', 'payload-markdown-docs'],
        },
        url: 'https://example.com/plugins/payload-markdown-docs/llms.txt',
      }),
    )

    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toContain('text/plain')
    expect(await response?.text()).toBe('# Payload Markdown Docs\n')
  })

  it('generates root llms.txt from published docs sets', async () => {
    const endpoint = createDocsAssetsEndpoints({}).find((item) => item.path === '/llms.txt')
    const payload = createMockPayload({
      assets: [
        {
          id: 'skill-1',
          content: '# Codex Skill\n',
          contentType: 'text/markdown; charset=utf-8',
          kind: 'skill',
          route: '/plugins/payload-markdown-docs/skills/codex/SKILL.md',
          sourceId: 'payload-markdown-docs',
          sourcePath: 'skills/payload-markdown-docs/codex/SKILL.md',
          sync: {
            archived: false,
            sourceId: 'payload-markdown-docs',
          },
        },
      ],
      docs: [
        {
          id: 'doc-1',
          content: '# Overview\n',
          docsSet: 'docs-set-1',
          order: 0,
          route: '/plugins/payload-markdown-docs',
          sourcePath: 'index.md',
          sync: {
            archived: false,
          },
          title: 'Overview',
        },
      ],
      docsGroups: [
        {
          id: 'docs-group-1',
          slug: 'plugins',
        },
      ],
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'payload-markdown-docs',
          description: 'Git-backed Markdown documentation sync for Payload CMS.',
          group: 'docs-group-1',
          title: 'Payload Markdown Docs',
        },
      ],
    })

    const response = await endpoint?.handler(
      createRequest({
        payload,
        url: 'https://example.com/llms.txt',
      }),
    )
    const text = await response?.text()

    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toContain('text/plain')
    expect(text).toContain('Payload Markdown Docs: https://example.com/plugins/payload-markdown-docs')
    expect(text).toContain(
      'Payload Markdown Docs Codex SKILL.md: https://example.com/plugins/payload-markdown-docs/skills/codex/SKILL.md',
    )
    expect(text).not.toContain('docs.valkyrianlabs.com')
  })

  it('generates docs-set llms.txt with dependency links from docs metadata', async () => {
    const endpoint = createDocsAssetsEndpoints({}).find(
      (item) => item.path === '/:routeBase*/llms.txt',
    )
    const payload = createMockPayload({
      docs: [
        {
          id: 'doc-1',
          content: '# Overview\n',
          dependencies: ['@valkyrianlabs/payload-markdown'],
          docsSet: 'docs-set-1',
          navTitle: 'Overview',
          order: 0,
          route: '/plugins/payload-markdown-docs',
          sourcePath: 'index.md',
          sync: {
            archived: false,
          },
          title: 'Payload Markdown Docs',
        },
      ],
      docsGroups: [
        {
          id: 'docs-group-1',
          slug: 'plugins',
        },
      ],
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'payload-markdown-docs',
          description: 'Git-backed Markdown documentation sync for Payload CMS.',
          group: 'docs-group-1',
          title: 'Payload Markdown Docs',
        },
        {
          id: 'docs-set-2',
          slug: 'payload-markdown',
          description: 'Markdown field and directive rendering.',
          group: 'docs-group-1',
          title: 'Payload Markdown',
        },
      ],
    })

    const response = await endpoint?.handler(
      createRequest({
        payload,
        routeParams: {
          routeBase: ['plugins', 'payload-markdown-docs'],
        },
        url: 'https://example.com/plugins/payload-markdown-docs/llms.txt',
      }),
    )
    const text = await response?.text()

    expect(response?.status).toBe(200)
    expect(text).toContain('Overview: https://example.com/plugins/payload-markdown-docs')
    expect(text).toContain(
      'Payload Markdown: https://example.com/plugins/payload-markdown - Markdown field and directive rendering.',
    )
    expect(text).not.toContain('docs.valkyrianlabs.com')
  })

  it('generates docs-set llms-full.txt with markdown content', async () => {
    const endpoint = createDocsAssetsEndpoints({}).find(
      (item) => item.path === '/:routeBase*/llms-full.txt',
    )
    const payload = createMockPayload({
      docs: [
        {
          id: 'doc-1',
          content: '# Overview\n\nGenerated content.',
          docsSet: 'docs-set-1',
          order: 0,
          route: '/plugins/payload-markdown-docs',
          sourcePath: 'index.md',
          sync: {
            archived: false,
          },
          title: 'Payload Markdown Docs',
        },
      ],
      docsGroups: [
        {
          id: 'docs-group-1',
          slug: 'plugins',
        },
      ],
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'payload-markdown-docs',
          group: 'docs-group-1',
          title: 'Payload Markdown Docs',
        },
      ],
    })

    const response = await endpoint?.handler(
      createRequest({
        payload,
        routeParams: {
          routeBase: ['plugins', 'payload-markdown-docs'],
        },
        url: 'https://example.com/plugins/payload-markdown-docs/llms-full.txt',
      }),
    )
    const text = await response?.text()

    expect(response?.status).toBe(200)
    expect(text).toContain('# Payload Markdown Docs Full Documentation')
    expect(text).toContain('URL: https://example.com/plugins/payload-markdown-docs')
    expect(text).toContain('# Overview\n\nGenerated content.')
  })

  it('serves skill assets under the matched docs set route base', async () => {
    const endpoint = createDocsAssetsEndpoints({}).find((item) =>
      item.path.includes('/skills/'),
    )
    const payload = createMockPayload({
      assets: [
        {
          id: 'asset-1',
          content: '# Codex Skill\n',
          contentType: 'text/markdown; charset=utf-8',
          kind: 'skill',
          route: '/plugins/payload-markdown-docs/skills/codex/SKILL.md',
          sourcePath: 'skills/payload-markdown-docs/codex/SKILL.md',
          sync: {
            archived: false,
          },
        },
      ],
      docsGroups: [
        {
          id: 'docs-group-1',
          slug: 'plugins',
        },
      ],
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'payload-markdown-docs',
          group: 'docs-group-1',
        },
      ],
    })

    const response = await endpoint?.handler(
      createRequest({
        payload,
        routeParams: {
          agent: 'codex',
          assetPath: ['SKILL.md'],
          routeBase: ['plugins', 'payload-markdown-docs'],
        },
        url: 'https://example.com/plugins/payload-markdown-docs/skills/codex/SKILL.md',
      }),
    )

    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toContain('text/markdown')
    expect(await response?.text()).toBe('# Codex Skill\n')
  })

  it('serves product-nested skill assets from the product route instead of the docs route', async () => {
    const endpoint = createDocsAssetsEndpoints({}).find((item) =>
      item.path.includes('/skills/'),
    )
    const payload = createMockPayload({
      assets: [
        {
          id: 'asset-1',
          content: '# Codex Skill\n',
          contentType: 'text/markdown; charset=utf-8',
          kind: 'skill',
          route: '/plugins/payload-markdown-docs/skills/codex/SKILL.md',
          sourcePath: 'skills/payload-markdown-docs/codex/SKILL.md',
          sync: {
            archived: false,
          },
        },
      ],
      docsGroups: [
        {
          id: 'docs-group-1',
          slug: 'plugins',
        },
      ],
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'payload-markdown-docs',
          group: 'docs-group-1',
          routeMode: 'product-nested',
        },
      ],
    })

    const response = await endpoint?.handler(
      createRequest({
        payload,
        routeParams: {
          agent: 'codex',
          assetPath: ['SKILL.md'],
          routeBase: ['plugins', 'payload-markdown-docs'],
        },
        url: 'https://example.com/plugins/payload-markdown-docs/skills/codex/SKILL.md',
      }),
    )

    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toContain('text/markdown')
    expect(await response?.text()).toBe('# Codex Skill\n')
  })

  it('serves skill directory requests as the agent SKILL.md file', async () => {
    const endpoint = createDocsAssetsEndpoints({}).find((item) =>
      item.path.includes('/skills/'),
    )
    const payload = createMockPayload({
      assets: [
        {
          id: 'asset-1',
          content: '# Codex Skill\n',
          contentType: 'text/markdown; charset=utf-8',
          kind: 'skill',
          route: '/plugins/payload-markdown-docs/skills/codex/SKILL.md',
          sourcePath: 'skills/payload-markdown-docs/codex/SKILL.md',
          sync: {
            archived: false,
          },
        },
      ],
      docsGroups: [
        {
          id: 'docs-group-1',
          slug: 'plugins',
        },
      ],
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'payload-markdown-docs',
          group: 'docs-group-1',
        },
      ],
    })

    const response = await endpoint?.handler(
      createRequest({
        payload,
        routeParams: {
          agent: 'codex',
          routeBase: ['plugins', 'payload-markdown-docs'],
        },
        url: 'https://example.com/plugins/payload-markdown-docs/skills/codex',
      }),
    )

    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toContain('text/markdown')
    expect(await response?.text()).toBe('# Codex Skill\n')
  })

  it('returns a friendly migration error when asset storage is missing', async () => {
    const endpoint = createDocsAssetsEndpoints({}).find((item) => item.path === '/llms.txt')
    const payload = createMockPayload({
      assetsFindError: new Error(
        'Failed query: select count(*) from "payload_markdown_docs_assets"',
      ),
    })

    const response = await endpoint?.handler(
      createRequest({
        payload,
        url: 'https://example.com/llms.txt',
      }),
    )
    const text = await response?.text()

    expect(response?.status).toBe(500)
    expect(text).toContain('Docs assets schema is missing')
    expect(text).toContain('pnpm dev')
  })
})
