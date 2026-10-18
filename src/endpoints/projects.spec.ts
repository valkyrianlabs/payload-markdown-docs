import type { Config } from 'payload'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PayloadMarkdownDocsConfig } from '../types.js'

import { payloadMarkdownDocs } from '../plugin.js'
import { createDocsProjectsEndpoints } from './projects.js'

const getPaths = async (options: PayloadMarkdownDocsConfig) => {
  const config = await payloadMarkdownDocs(options)({
    collections: [
      { slug: 'users', auth: true, fields: [] },
      { slug: 'media', fields: [], upload: true },
    ],
  } as unknown as Config)

  return (config.endpoints ?? []).map((endpoint) => `${endpoint.method} ${endpoint.path}`)
}

describe('projects API configuration', () => {
  it('is disabled by default', async () => {
    expect((await getPaths({})).filter((path) => path.includes('projects'))).toEqual([])
    expect((await getPaths({ publicApi: { projects: false } })).filter((path) => path.includes('projects'))).toEqual([])
  })

  it('registers the list and single-project routes when enabled', async () => {
    expect((await getPaths({ publicApi: { projects: true } })).filter((path) => path.includes('projects'))).toEqual([
      'get /documentation/projects',
      'get /documentation/projects/:slug',
    ])
    expect(
      (await getPaths({ publicApi: { projects: { path: 'portfolio/projects/' } } })).filter((path) =>
        path.includes('projects'),
      ),
    ).toEqual(['get /portfolio/projects', 'get /portfolio/projects/:slug'])
    expect(
      (await getPaths({ publicApi: { projects: { enabled: false } } })).filter((path) => path.includes('projects')),
    ).toEqual([])
  })
})

describe('projects API projection', () => {
  beforeEach(() => {
    for (const name of ['NEXT_PUBLIC_SERVER_URL', 'NEXT_PUBLIC_SITE_URL', 'SITE_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL']) {
      vi.stubEnv(name, '')
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const docsSet = {
    id: 1,
    slug: 'vaulthalla',
    _status: 'published',
    advancedSecurity: { allowedWorkflowRefs: [{ value: 'o/r/.github/workflows/x.yml@refs/heads/main' }], enabled: true },
    allowPullRequests: true,
    branch: 'main',
    description: 'Encrypted storage.',
    group: { id: 7, slug: 'products', title: 'Products' },
    meta: { image: { alt: 'Logo', height: 630, url: '/api/media/file/og.png', width: 1200 } },
    repositories: [{ value: 'valkyrianlabs/vaulthalla' }],
    stack: [{ category: 'languages', items: [{ name: 'C++23' }] }],
    sync: { lastStatus: 'success', lastSyncedAt: '2026-10-18T00:00:00.000Z', projectTitle: 'Vaulthalla' },
    title: 'Vaulthalla',
    updatedAt: '2026-10-18T00:00:01.000Z',
  }
  const find = vi.fn(({ collection }: { collection: string }) => Promise.resolve({
    docs:
      collection === 'docs-groups'
        ? [{ id: 7, slug: 'products', title: 'Products' }]
        : [docsSet, { ...docsSet, id: 2, slug: 'draft', _status: 'draft' }],
  }))
  const [list] = createDocsProjectsEndpoints({
    docsGroupsCollectionSlug: 'docs-groups',
    docsSetsCollectionSlug: 'docs-sets',
  })
  const call = (headers: Record<string, string> = {}) =>
    list.handler({
      headers: new Headers({ host: 'docs.example', ...headers }),
      payload: { config: {}, find },
      url: 'https://docs.example/api/documentation/projects',
    } as never)

  it('serializes the allowlisted shape only', async () => {
    const response = await call()
    const body = await response.json()

    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(body).toEqual({
      groups: [{ slug: 'products', title: 'Products' }],
      projects: [
        {
          slug: 'vaulthalla',
          description: 'Encrypted storage.',
          group: { slug: 'products', title: 'Products' },
          lastSyncedAt: '2026-10-18T00:00:00.000Z',
          seo: {
            description: 'Encrypted storage.',
            image: { alt: 'Logo', height: 630, url: 'https://docs.example/api/media/file/og.png', width: 1200 },
            title: 'Vaulthalla',
          },
          stack: [{ category: 'languages', items: [{ name: 'C++23' }] }],
          title: 'Vaulthalla',
          updatedAt: '2026-10-18T00:00:01.000Z',
          urls: {
            docs: 'https://docs.example/products/vaulthalla',
            product: 'https://docs.example/products/vaulthalla',
          },
        },
      ],
      schemaVersion: 1,
    })
  })

  it('answers 304 for a matching If-None-Match', async () => {
    const etag = (await call()).headers.get('etag')!
    const notModified = await call({ 'if-none-match': etag })

    expect(notModified.status).toBe(304)
    expect(notModified.headers.get('etag')).toBe(etag)
    expect((await call({ 'if-none-match': '"stale"' })).status).toBe(200)
  })
})
