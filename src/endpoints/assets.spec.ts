import type { Config, PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
} from '../constants.js'
import { payloadMarkdownDocs } from '../plugin.js'
import { createDocsAssetsEndpoints } from './assets.js'

type MockPayload = {
  find: ReturnType<typeof vi.fn>
}

const getEqualsConstraint = (where: unknown, field: string): string | undefined => {
  if (typeof where !== 'object' || where === null || Array.isArray(where)) {
    return undefined
  }

  const directConstraint = (where as Record<string, unknown>)[field]

  if (
    typeof directConstraint === 'object' &&
    directConstraint !== null &&
    !Array.isArray(directConstraint)
  ) {
    const value = (directConstraint as Record<string, unknown>).equals

    return typeof value === 'string' ? value : undefined
  }

  const andConstraints = (where as Record<string, unknown>).and

  if (!Array.isArray(andConstraints)) {
    return undefined
  }

  return andConstraints
    .map((constraint) => getEqualsConstraint(constraint, field))
    .find((value): value is string => value !== undefined)
}

const createMockPayload = ({
  assets = [],
  assetsFindError,
  docsGroups = [],
  docsSets = [],
}: {
  assets?: unknown[]
  assetsFindError?: Error
  docsGroups?: unknown[]
  docsSets?: unknown[]
} = {}): MockPayload => ({
  find: vi.fn((args) => {
    if (args.collection === DEFAULT_DOCS_ASSETS_COLLECTION_SLUG) {
      if (assetsFindError) {
        return Promise.reject(assetsFindError)
      }

      const route = getEqualsConstraint(args.where, 'route')

      return Promise.resolve({
        docs: route
          ? assets.filter(
              (asset) =>
                typeof asset === 'object' &&
                asset !== null &&
                !Array.isArray(asset) &&
                (asset as Record<string, unknown>).route === route,
            )
          : assets,
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
