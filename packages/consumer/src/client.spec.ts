import { describe, expect, test, vi } from 'vitest'

import type { DocsProject, DocsProjectsListResponse } from './contract.js'

import { createDocsProjectsClient, flattenStack, formatStackCategory } from './index.js'

const project = (
  origin: string,
  slug: string,
  group: { slug: string; title: string } | null,
  stack: DocsProject['stack'] = [],
): DocsProject => ({
  slug,
  description: `${slug} description`,
  group,
  lastSyncedAt: '2026-10-18T00:00:00.000Z',
  seo: { description: `${slug} description`, image: null, title: slug },
  stack,
  title: slug,
  updatedAt: '2026-10-18T00:00:00.000Z',
  urls: {
    docs: `${origin}/${group ? `${group.slug}/` : ''}${slug}/docs`,
    product: `${origin}/${group ? `${group.slug}/` : ''}${slug}`,
  },
})

const products = { slug: 'products', title: 'Products' }
const libraries = { slug: 'libraries', title: 'Libraries' }
const tools = { slug: 'tools', title: 'Tools' }

const vaulthalla: DocsProjectsListResponse = {
  groups: [products],
  projects: [
    project('https://vaulthalla.io', 'vaulthalla', products, [
      { category: 'languages', items: [{ name: 'C++23' }, { name: 'TypeScript' }] },
      { category: 'libraries', items: [{ name: 'libfuse3' }, { name: 'libpqxx' }] },
    ]),
    project('https://vaulthalla.io', 'docs', null),
  ],
  schemaVersion: 1,
}

const valkyrianlabs: DocsProjectsListResponse = {
  groups: [libraries, tools],
  projects: [
    project('https://valkyrianlabs.com', 'payload-markdown', libraries),
    project('https://valkyrianlabs.com', 'payload-markdown-docs', libraries, [
      { category: 'languages', items: [{ name: 'C++23' }, { name: 'TypeScript' }] },
    ]),
    project('https://valkyrianlabs.com', 'vl-release', tools),
    project('https://valkyrianlabs.com', 'docs', null),
  ],
  schemaVersion: 1,
}

const urlOf = (input: RequestInfo | URL): string => (input instanceof Request ? input.url : input.toString())

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status })

type Route = (url: URL, init?: RequestInit) => Promise<Response> | Response

const fakeFetch = (routes: Record<string, Route>) =>
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(urlOf(input))
    const route = routes[url.origin]

    if (!route) {
      throw new TypeError('fetch failed: getaddrinfo ENOTFOUND')
    }

    return route(url, init)
  })

const sites = [
  { id: 'vaulthalla', baseUrl: 'https://vaulthalla.io' },
  { id: 'valkyrianlabs', baseUrl: 'https://valkyrianlabs.com/' },
]

describe('createDocsProjectsClient', () => {
  test('segments projects by site, then group, with site-scoped keys', async () => {
    const fetch = fakeFetch({
      'https://valkyrianlabs.com': () => json(valkyrianlabs),
      'https://vaulthalla.io': () => json(vaulthalla),
    })
    const client = createDocsProjectsClient({ fetch, sites })
    const result = await client.getProjects()

    expect(result.complete).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.sites.map((site) => site.id)).toEqual(['vaulthalla', 'valkyrianlabs'])

    const [first, second] = result.sites

    if (!first?.ok || !second?.ok) {
      throw new Error('expected both sites to succeed')
    }

    expect(first.groups.map((group) => [group.key, group.projects.map((entry) => entry.key)])).toEqual([
      ['vaulthalla/products', ['vaulthalla/vaulthalla']],
    ])
    expect(first.ungrouped.map((entry) => entry.key)).toEqual(['vaulthalla/docs'])
    expect(second.groups.map((group) => [group.key, group.projects.map((entry) => entry.slug)])).toEqual([
      ['valkyrianlabs/libraries', ['payload-markdown', 'payload-markdown-docs']],
      ['valkyrianlabs/tools', ['vl-release']],
    ])
    expect(second.baseUrl).toBe('https://valkyrianlabs.com')

    // The same slug ("docs") on both sites stays two projects.
    expect(result.projects.map((entry) => entry.key)).toEqual([
      'vaulthalla/vaulthalla',
      'vaulthalla/docs',
      'valkyrianlabs/payload-markdown',
      'valkyrianlabs/payload-markdown-docs',
      'valkyrianlabs/vl-release',
      'valkyrianlabs/docs',
    ])
    expect(new Set(result.projects.map((entry) => entry.key)).size).toBe(result.projects.length)

    const vaulthallaProject = result.projects[0]
    expect(vaulthallaProject.urls.product).toBe('https://vaulthalla.io/products/vaulthalla')
    expect(vaulthallaProject.site).toEqual({ id: 'vaulthalla', baseUrl: 'https://vaulthalla.io' })
    expect(vaulthallaProject.groupKey).toBe('vaulthalla/products')
    expect(flattenStack(vaulthallaProject.stack)).toEqual(['C++23', 'TypeScript', 'libfuse3', 'libpqxx'])

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(urlOf(fetch.mock.calls[1][0])).toBe('https://valkyrianlabs.com/api/documentation/projects')
  })

  test('reports a failed site without dropping the others', async () => {
    const client = createDocsProjectsClient({
      fetch: fakeFetch({
        'https://valkyrianlabs.com': () => new Response('Bad gateway', { status: 502 }),
        'https://vaulthalla.io': () => json(vaulthalla),
      }),
      sites: [...sites, { id: 'offline', baseUrl: 'https://offline.example' }],
    })
    const result = await client.getProjects()

    expect(result.complete).toBe(false)
    expect(result.projects.map((entry) => entry.key)).toEqual(['vaulthalla/vaulthalla', 'vaulthalla/docs'])
    expect(result.errors.map(({ error, siteId }) => [siteId, error.code, error.status])).toEqual([
      ['valkyrianlabs', 'http', 502],
      ['offline', 'network', undefined],
    ])
    expect(result.sites.map((site) => site.ok)).toEqual([true, false, false])
  })

  test('rejects responses from an incompatible or missing API', async () => {
    const client = createDocsProjectsClient({
      fetch: fakeFetch({
        'https://html.example': () => new Response('<!doctype html>', { status: 200 }),
        'https://new.example': () => json({ ...valkyrianlabs, schemaVersion: 2 }),
        'https://old.example': () => json({ errors: [{ message: 'Not Found' }] }, 404),
        'https://other.example': () => json({ docs: [] }),
      }),
      sites: [
        { id: 'new', baseUrl: 'https://new.example' },
        { id: 'old', baseUrl: 'https://old.example' },
        { id: 'html', baseUrl: 'https://html.example' },
        { id: 'other', baseUrl: 'https://other.example' },
      ],
    })
    const { errors } = await client.getProjects()

    expect(errors.map(({ error, siteId }) => [siteId, error.code])).toEqual([
      ['new', 'schema_unsupported'],
      ['old', 'http'],
      ['html', 'invalid_json'],
      ['other', 'schema_missing'],
    ])
    expect(errors[1]?.error.message).toContain('publicApi.projects')
  })

  test('skips individual projects that do not match the schema, with a warning', async () => {
    const client = createDocsProjectsClient({
      fetch: fakeFetch({
        'https://vaulthalla.io': () =>
          json({ ...vaulthalla, extra: true, projects: [...vaulthalla.projects, { slug: 'broken', title: 7 }] }),
      }),
      sites: [sites[0]],
    })
    const [site] = (await client.getProjects()).sites

    expect(site?.ok && site.projects.map((entry) => entry.slug)).toEqual(['vaulthalla', 'docs'])
    expect(site?.ok && site.warnings).toEqual(['vaulthalla: project "broken" does not match schema version 1'])
  })

  test('times out slow sites', async () => {
    const client = createDocsProjectsClient({
      fetch: fakeFetch({
        'https://vaulthalla.io': (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
          }),
      }),
      sites: [sites[0]],
      timeoutMs: 20,
    })
    const result = await client.getProjects()

    expect(result.errors[0]?.error.code).toBe('timeout')
  })

  test('a cancelled call rejects instead of reporting a site failure', async () => {
    const controller = new AbortController()
    const client = createDocsProjectsClient({
      fetch: fakeFetch({
        'https://vaulthalla.io': (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
          }),
      }),
      sites: [sites[0]],
    })
    const pending = client.getProjects({ signal: controller.signal })

    controller.abort()
    await expect(pending).rejects.toThrow('Aborted')
  })

  test('filters by site and group, and passes fetch options through', async () => {
    const fetch = fakeFetch({
      'https://valkyrianlabs.com': (url) =>
        json({
          ...valkyrianlabs,
          groups: [tools],
          projects: valkyrianlabs.projects.filter((entry) => url.searchParams.get('group') === 'tools' && entry.group?.slug === 'tools'),
        }),
    })
    const client = createDocsProjectsClient({
      fetch,
      fetchOptions: { headers: { 'x-portfolio': '1' }, next: { revalidate: 300 } },
      sites: [
        sites[0],
        { ...sites[1], apiPath: 'api/documentation/projects/', fetchOptions: { next: { revalidate: 60, tags: ['vl'] } } },
      ],
    })
    const result = await client.getProjects({ groups: ['tools'], sites: ['valkyrianlabs'] })

    expect(result.sites.map((site) => site.id)).toEqual(['valkyrianlabs'])
    expect(result.projects.map((entry) => entry.key)).toEqual(['valkyrianlabs/vl-release'])

    const [url, init] = fetch.mock.calls[0]
    expect(urlOf(url)).toBe('https://valkyrianlabs.com/api/documentation/projects?group=tools')
    expect((init as { next?: unknown }).next).toEqual({ revalidate: 60, tags: ['vl'] })
    expect(new Headers(init?.headers).get('x-portfolio')).toBe('1')
    expect(new Headers(init?.headers).get('accept')).toBe('application/json')

    await expect(client.getProjects({ sites: ['nope'] })).rejects.toThrow('Unknown docs projects site "nope"')
  })

  test('fetches a single project', async () => {
    const client = createDocsProjectsClient({
      fetch: fakeFetch({
        'https://valkyrianlabs.com': (url) =>
          url.pathname.endsWith('/vl-release')
            ? json({ project: valkyrianlabs.projects[2], schemaVersion: 1 })
            : json({ error: { code: 'not_found', message: 'No.' }, schemaVersion: 1 }, 404),
      }),
      sites,
    })

    const found = await client.getProject('valkyrianlabs', 'vl-release')
    expect(found.ok && found.project.key).toBe('valkyrianlabs/vl-release')

    const missing = await client.getProject('valkyrianlabs', 'missing')
    expect(missing.ok ? undefined : missing.error.code).toBe('not_found')
  })

  test('validates its configuration', () => {
    expect(() => createDocsProjectsClient({ sites: [sites[0], sites[0]] })).toThrow('more than once')
    expect(() => createDocsProjectsClient({ sites: [{ id: 'x', baseUrl: 'not a url' }] })).toThrow('invalid baseUrl')
    expect(() => createDocsProjectsClient({ sites: [{ id: 'x', baseUrl: 'ftp://x.example' }] })).toThrow('http or https')
    expect(() => createDocsProjectsClient({ sites: [{ id: ' ', baseUrl: 'https://x.example' }] })).toThrow('non-empty id')
  })
})

describe('stack helpers', () => {
  test('formats category keys as labels', () => {
    expect(formatStackCategory('languages')).toBe('Languages')
    expect(formatStackCategory('machine-learning')).toBe('Machine Learning')
    expect(formatStackCategory('build_tools')).toBe('Build Tools')
  })
})
