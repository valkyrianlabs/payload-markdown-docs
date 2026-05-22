import type { Config, PayloadRequest } from 'payload'

import { strFromU8, unzipSync } from 'fflate'
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
  config?: Record<string, unknown>
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
  config,
  docs = [],
  docsGroups = [],
  docsSets = [],
}: {
  assets?: unknown[]
  assetsFindError?: Error
  config?: Record<string, unknown>
  docs?: unknown[]
  docsGroups?: unknown[]
  docsSets?: unknown[]
} = {}): MockPayload => ({
  config,
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

const unzipResponse = async (response: Response): Promise<Record<string, string>> => {
  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()))

  return Object.fromEntries(
    Object.entries(archive).map(([path, content]) => [path, strFromU8(content)]),
  )
}

const withPublicUrlEnv = async <T>(
  env: Partial<NodeJS.ProcessEnv>,
  callback: () => Promise<T>,
): Promise<T> => {
  const keys = [
    'NEXT_PUBLIC_SERVER_URL',
    'NEXT_PUBLIC_SITE_URL',
    'SITE_URL',
    'VERCEL_PROJECT_PRODUCTION_URL',
    'VERCEL_URL',
  ]
  const previousEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]))

  for (const key of keys) {
    delete process.env[key]
  }

  Object.assign(process.env, env)

  try {
    return await callback()
  } finally {
    for (const key of keys) {
      const value = previousEnv[key]

      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

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
          path: '/:routeBase*/skills/:agent.zip',
          root: true,
        }),
        expect.objectContaining({
          path: '/:routeBase*/skills/:agent/:assetPath*',
          root: true,
        }),
      ]),
    )

    const skillZipIndex = endpoints.findIndex(
      (endpoint) => endpoint.path === '/:routeBase*/skills/:agent.zip',
    )
    const rawSkillIndex = endpoints.findIndex(
      (endpoint) => endpoint.path === '/:routeBase*/skills/:agent/:assetPath*',
    )

    expect(skillZipIndex).toBeGreaterThanOrEqual(0)
    expect(rawSkillIndex).toBeGreaterThanOrEqual(0)
    expect(skillZipIndex).toBeLessThan(rawSkillIndex)
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
        {
          id: 'skill-2',
          content: '# Docs Package\n',
          contentType: 'text/markdown; charset=utf-8',
          kind: 'skill',
          route: '/plugins/payload-markdown-docs/skills/codex/reference/docs-package.md',
          sourceId: 'payload-markdown-docs',
          sourcePath: 'skills/payload-markdown-docs/codex/reference/docs-package.md',
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
    expect(text).toContain(
      'Payload Markdown Docs: https://example.com/plugins/payload-markdown-docs',
    )
    expect(text).toContain(
      'Payload Markdown Docs Codex skill: https://example.com/plugins/payload-markdown-docs/skills/codex',
    )
    expect(text).toContain(
      'Payload Markdown Docs Codex SKILL.md: https://example.com/plugins/payload-markdown-docs/skills/codex/SKILL.md',
    )
    expect(text).toContain(
      'Payload Markdown Docs Codex skill archive: https://example.com/plugins/payload-markdown-docs/skills/codex.zip',
    )
    expect(text).not.toContain('reference/docs-package.md')
    expect(text).not.toContain('docs.valkyrianlabs.com')
  })

  it('uses NEXT_PUBLIC_SERVER_URL instead of localhost for generated llms.txt links', async () => {
    await withPublicUrlEnv(
      {
        NEXT_PUBLIC_SERVER_URL: 'https://docs.example.com',
      },
      async () => {
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
          config: {
            serverURL: 'http://localhost:3000',
          },
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
              group: 'docs-group-1',
              title: 'Payload Markdown Docs',
            },
          ],
        })

        const response = await endpoint?.handler(
          createRequest({
            payload,
            url: 'http://localhost:3000/llms.txt',
          }),
        )
        const text = await response?.text()

        expect(response?.status).toBe(200)
        expect(text).toContain('https://docs.example.com/plugins/payload-markdown-docs')
        expect(text).toContain(
          'https://docs.example.com/plugins/payload-markdown-docs/skills/codex',
        )
        expect(text).toContain(
          'https://docs.example.com/plugins/payload-markdown-docs/skills/codex/SKILL.md',
        )
        expect(text).toContain(
          'https://docs.example.com/plugins/payload-markdown-docs/skills/codex.zip',
        )
        expect(text).not.toContain('localhost')
      },
    )
  })

  it('normalizes Vercel production hostnames to https origins for llms.txt links', async () => {
    await withPublicUrlEnv(
      {
        VERCEL_PROJECT_PRODUCTION_URL: 'docs.example.com',
      },
      async () => {
        const endpoint = createDocsAssetsEndpoints({}).find((item) => item.path === '/llms.txt')
        const payload = createMockPayload({
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
              group: 'docs-group-1',
              title: 'Payload Markdown Docs',
            },
          ],
        })

        const response = await endpoint?.handler(
          createRequest({
            payload,
            url: 'http://localhost:3000/llms.txt',
          }),
        )
        const text = await response?.text()

        expect(response?.status).toBe(200)
        expect(text).toContain('https://docs.example.com/plugins/payload-markdown-docs')
        expect(text).not.toContain('localhost')
      },
    )
  })

  it('generates docs-set llms.txt with dependency links from docs metadata', async () => {
    const endpoint = createDocsAssetsEndpoints({}).find(
      (item) => item.path === '/:routeBase*/llms.txt',
    )
    const payload = createMockPayload({
      assets: [
        {
          id: 'skill-1',
          content: '# Codex Skill\n',
          contentType: 'text/markdown; charset=utf-8',
          docsSet: 'docs-set-1',
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
      'Codex skill: https://example.com/plugins/payload-markdown-docs/skills/codex',
    )
    expect(text).toContain(
      'Codex SKILL.md: https://example.com/plugins/payload-markdown-docs/skills/codex/SKILL.md',
    )
    expect(text).toContain(
      'Codex skill archive: https://example.com/plugins/payload-markdown-docs/skills/codex.zip',
    )
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
      assets: [
        {
          id: 'skill-1',
          content: '# Codex Skill\n\nUse the docs workflow.',
          contentType: 'text/markdown; charset=utf-8',
          docsSet: 'docs-set-1',
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
    expect(text).toContain('Root: https://example.com/plugins/payload-markdown-docs/skills/codex')
    expect(text).toContain(
      'SKILL.md: https://example.com/plugins/payload-markdown-docs/skills/codex/SKILL.md',
    )
    expect(text).toContain(
      'Archive: https://example.com/plugins/payload-markdown-docs/skills/codex.zip',
    )
    expect(text).toContain('# Codex Skill\n\nUse the docs workflow.')
  })

  it('generates product-nested docs-set llms.txt from the product route', async () => {
    const endpoint = createDocsAssetsEndpoints({}).find(
      (item) => item.path === '/:routeBase*/llms.txt',
    )
    const payload = createMockPayload({
      assets: [
        {
          id: 'skill-1',
          content: '# Codex Skill\n',
          contentType: 'text/markdown; charset=utf-8',
          docsSet: 'docs-set-1',
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
          route: '/plugins/payload-markdown-docs/docs',
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
          routeMode: 'product-nested',
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
        url: 'https://example.com/plugins/payload-markdown-docs/llms.txt',
      }),
    )
    const text = await response?.text()

    expect(response?.status).toBe(200)
    expect(text).toContain('Canonical URL: https://example.com/plugins/payload-markdown-docs/docs')
    expect(text).toContain(
      'Payload Markdown Docs: https://example.com/plugins/payload-markdown-docs/docs',
    )
    expect(text).toContain(
      'Codex skill: https://example.com/plugins/payload-markdown-docs/skills/codex',
    )
    expect(text).toContain(
      'Codex SKILL.md: https://example.com/plugins/payload-markdown-docs/skills/codex/SKILL.md',
    )
    expect(text).toContain(
      'Codex skill archive: https://example.com/plugins/payload-markdown-docs/skills/codex.zip',
    )
    expect(text).not.toContain('/plugins/payload-markdown-docs/docs/skills/codex')
  })

  it('serves skill assets under the matched docs set route base', async () => {
    const endpoint = createDocsAssetsEndpoints({}).find(
      (item) => item.path === '/:routeBase*/skills/:agent/:assetPath*',
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

  it('serves raw supporting skill files by exact asset route', async () => {
    const endpoint = createDocsAssetsEndpoints({}).find(
      (item) => item.path === '/:routeBase*/skills/:agent/:assetPath*',
    )
    const payload = createMockPayload({
      assets: [
        {
          id: 'asset-1',
          content: '# Docs Package\n',
          contentType: 'text/markdown; charset=utf-8',
          kind: 'skill',
          route: '/plugins/payload-markdown-docs/skills/codex/reference/docs-package.md',
          sourcePath: 'skills/payload-markdown-docs/codex/reference/docs-package.md',
          sync: {
            archived: false,
          },
        },
      ],
    })

    const response = await endpoint?.handler(
      createRequest({
        payload,
        routeParams: {
          agent: 'codex',
          assetPath: ['reference', 'docs-package.md'],
          routeBase: ['plugins', 'payload-markdown-docs'],
        },
        url: 'https://example.com/plugins/payload-markdown-docs/skills/codex/reference/docs-package.md',
      }),
    )

    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toContain('text/markdown')
    expect(await response?.text()).toBe('# Docs Package\n')
  })

  it('serves product-nested skill assets from the product route instead of the docs route', async () => {
    const endpoint = createDocsAssetsEndpoints({}).find(
      (item) => item.path === '/:routeBase*/skills/:agent/:assetPath*',
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

  it('serves stored skill assets even when docs set route metadata is unavailable', async () => {
    const endpoint = createDocsAssetsEndpoints({}).find(
      (item) => item.path === '/:routeBase*/skills/:agent/:assetPath*',
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
      docsSets: [],
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

  it('serves skill directory requests as generated Markdown indexes', async () => {
    const endpoint = createDocsAssetsEndpoints({}).find(
      (item) => item.path === '/:routeBase*/skills/:agent/:assetPath*',
    )
    const payload = createMockPayload({
      assets: [
        {
          id: 'asset-1',
          content: '# Codex Skill\n',
          contentType: 'text/markdown; charset=utf-8',
          docsSet: 'docs-set-1',
          kind: 'skill',
          route: '/plugins/payload-markdown-docs/skills/codex/SKILL.md',
          sourceId: 'payload-markdown-docs',
          sourcePath: 'skills/payload-markdown-docs/codex/SKILL.md',
          sync: {
            archived: false,
            sourceId: 'payload-markdown-docs',
          },
        },
        {
          id: 'asset-2',
          content: '# Docs Package\n',
          contentType: 'text/markdown; charset=utf-8',
          docsSet: 'docs-set-1',
          kind: 'skill',
          route: '/plugins/payload-markdown-docs/skills/codex/reference/docs-package.md',
          sourceId: 'payload-markdown-docs',
          sourcePath: 'skills/payload-markdown-docs/codex/reference/docs-package.md',
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

    const rootResponse = await endpoint?.handler(
      createRequest({
        payload,
        routeParams: {
          agent: 'codex',
          routeBase: ['plugins', 'payload-markdown-docs'],
        },
        url: 'https://example.com/plugins/payload-markdown-docs/skills/codex',
      }),
    )
    const rootText = await rootResponse?.text()

    expect(rootResponse?.status).toBe(200)
    expect(rootResponse?.headers.get('content-type')).toContain('text/markdown')
    expect(rootText).toContain('# Codex Skill: Payload Markdown Docs')
    expect(rootText).toContain('/plugins/payload-markdown-docs/skills/codex.zip')
    expect(rootText).toContain('/plugins/payload-markdown-docs/skills/codex/SKILL.md')
    expect(rootText).toContain('/plugins/payload-markdown-docs/skills/codex/reference')
    expect(rootText).toContain(
      '/plugins/payload-markdown-docs/skills/codex/reference/docs-package.md',
    )
    expect(rootText).not.toBe('# Codex Skill\n')

    const referenceResponse = await endpoint?.handler(
      createRequest({
        payload,
        routeParams: {
          agent: 'codex',
          assetPath: ['reference'],
          routeBase: ['plugins', 'payload-markdown-docs'],
        },
        url: 'https://example.com/plugins/payload-markdown-docs/skills/codex/reference',
      }),
    )
    const referenceText = await referenceResponse?.text()

    expect(referenceResponse?.status).toBe(200)
    expect(referenceResponse?.headers.get('content-type')).toContain('text/markdown')
    expect(referenceText).toContain('Parent:\n- /plugins/payload-markdown-docs/skills/codex')
    expect(referenceText).toContain('/plugins/payload-markdown-docs/skills/codex.zip')
    expect(referenceText).toContain('/plugins/payload-markdown-docs/skills/codex/SKILL.md')
    expect(referenceText).toContain(
      '/plugins/payload-markdown-docs/skills/codex/reference/docs-package.md',
    )
  })

  it('generates installable skill ZIP bundles for the requested agent and docs set', async () => {
    const endpoint = createDocsAssetsEndpoints({}).find(
      (item) => item.path === '/:routeBase*/skills/:agent.zip',
    )
    const payload = createMockPayload({
      assets: [
        {
          id: 'codex-root',
          content: '# Codex Skill\n',
          contentType: 'text/markdown; charset=utf-8',
          docsSet: 'docs-set-1',
          kind: 'skill',
          route: '/plugins/payload-markdown-docs/skills/codex/SKILL.md',
          sourceId: 'payload-markdown-docs',
          sourcePath: 'skills/payload-markdown-docs/codex/SKILL.md',
          sync: {
            archived: false,
            sourceId: 'payload-markdown-docs',
          },
        },
        {
          id: 'codex-reference',
          content: '# Docs Package\n',
          contentType: 'text/markdown; charset=utf-8',
          docsSet: 'docs-set-1',
          kind: 'skill',
          route: '/plugins/payload-markdown-docs/skills/codex/reference/docs-package.md',
          sourceId: 'payload-markdown-docs',
          sourcePath: 'skills/payload-markdown-docs/codex/reference/docs-package.md',
          sync: {
            archived: false,
            sourceId: 'payload-markdown-docs',
          },
        },
        {
          id: 'claude-root',
          content: '# Claude Skill\n',
          contentType: 'text/markdown; charset=utf-8',
          docsSet: 'docs-set-1',
          kind: 'skill',
          route: '/plugins/payload-markdown-docs/skills/claude/SKILL.md',
          sourceId: 'payload-markdown-docs',
          sourcePath: 'skills/payload-markdown-docs/claude/SKILL.md',
          sync: {
            archived: false,
            sourceId: 'payload-markdown-docs',
          },
        },
        {
          id: 'other-docs-root',
          content: '# Other Docs Codex Skill\n',
          contentType: 'text/markdown; charset=utf-8',
          docsSet: 'docs-set-2',
          kind: 'skill',
          route: '/plugins/other-docs/skills/codex/SKILL.md',
          sourceId: 'other-docs',
          sourcePath: 'skills/other-docs/codex/SKILL.md',
          sync: {
            archived: false,
            sourceId: 'other-docs',
          },
        },
        {
          id: 'llms',
          content: '# LLMs\n',
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
        {
          id: 'static-asset',
          content: 'Static asset\n',
          contentType: 'text/plain; charset=utf-8',
          docsSet: 'docs-set-1',
          kind: 'static',
          route: '/plugins/payload-markdown-docs/static.txt',
          sourceId: 'payload-markdown-docs',
          sourcePath: 'static.txt',
          sync: {
            archived: false,
            sourceId: 'payload-markdown-docs',
          },
        },
        {
          id: 'archived-codex',
          content: '# Archived\n',
          contentType: 'text/markdown; charset=utf-8',
          docsSet: 'docs-set-1',
          kind: 'skill',
          route: '/plugins/payload-markdown-docs/skills/codex/reference/archived.md',
          sourceId: 'payload-markdown-docs',
          sourcePath: 'skills/payload-markdown-docs/codex/reference/archived.md',
          sync: {
            archived: true,
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
        {
          id: 'docs-set-2',
          slug: 'other-docs',
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
        url: 'https://example.com/plugins/payload-markdown-docs/skills/codex.zip',
      }),
    )

    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toBe('application/zip')
    expect(response?.headers.get('content-disposition')).toBe(
      'attachment; filename="payload-markdown-docs-codex.zip"',
    )

    const files = await unzipResponse(response as Response)

    expect(files['payload-markdown-docs/SKILL.md']).toBe('# Codex Skill\n')
    expect(files['payload-markdown-docs/reference/docs-package.md']).toBe('# Docs Package\n')
    expect(files['payload-markdown-docs/reference/archived.md']).toBeUndefined()
    expect(files['payload-markdown-docs/llms.txt']).toBeUndefined()
    expect(files['payload-markdown-docs/static.txt']).toBeUndefined()
    expect(files['payload-markdown-docs/claude/SKILL.md']).toBeUndefined()
    expect(files['other-docs/SKILL.md']).toBeUndefined()
    expect(Object.keys(files).filter((path) => path.endsWith('/SKILL.md'))).toEqual([
      'payload-markdown-docs/SKILL.md',
    ])
  })

  it('returns 404 for skill index and ZIP requests without an agent root SKILL.md asset', async () => {
    const zipEndpoint = createDocsAssetsEndpoints({}).find(
      (item) => item.path === '/:routeBase*/skills/:agent.zip',
    )
    const indexEndpoint = createDocsAssetsEndpoints({}).find(
      (item) => item.path === '/:routeBase*/skills/:agent/:assetPath*',
    )
    const payload = createMockPayload({
      assets: [
        {
          id: 'codex-reference',
          content: '# Docs Package\n',
          contentType: 'text/markdown; charset=utf-8',
          docsSet: 'docs-set-1',
          kind: 'skill',
          route: '/plugins/payload-markdown-docs/skills/codex/reference/docs-package.md',
          sourceId: 'payload-markdown-docs',
          sourcePath: 'skills/payload-markdown-docs/codex/reference/docs-package.md',
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

    const zipResponse = await zipEndpoint?.handler(
      createRequest({
        payload,
        routeParams: {
          agent: 'codex',
          routeBase: ['plugins', 'payload-markdown-docs'],
        },
        url: 'https://example.com/plugins/payload-markdown-docs/skills/codex.zip',
      }),
    )
    const indexResponse = await indexEndpoint?.handler(
      createRequest({
        payload,
        routeParams: {
          agent: 'codex',
          routeBase: ['plugins', 'payload-markdown-docs'],
        },
        url: 'https://example.com/plugins/payload-markdown-docs/skills/codex',
      }),
    )

    expect(zipResponse?.status).toBe(404)
    expect(indexResponse?.status).toBe(404)
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
