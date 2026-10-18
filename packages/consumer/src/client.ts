import type {
  DocsProject,
  DocsProjectsGroup,
  DocsProjectsParseErrorCode,
} from './contract.js'

import {
  DOCS_PROJECTS_SCHEMA_VERSION,
  parseDocsProjectResponse,
  parseDocsProjectsListResponse,
} from './contract.js'

export const DEFAULT_DOCS_PROJECTS_API_PATH = '/api/documentation/projects'
export const DEFAULT_DOCS_PROJECTS_TIMEOUT_MS = 10_000

/**
 * `fetch` options. Framework extensions such as Next.js `next: { revalidate, tags }` pass
 * through unchanged.
 */
export type DocsProjectsFetchOptions = {
  [key: string]: unknown
} & RequestInit

export type DocsProjectsSiteConfig = {
  /** Path of the projects API on that site. Default `/api/documentation/projects`. */
  apiPath?: string
  /** The site's origin, for example `https://valkyrianlabs.com`. */
  baseUrl: string
  /** Merged over the client-level `fetchOptions` for this site. */
  fetchOptions?: DocsProjectsFetchOptions
  /** Your stable name for the site; it scopes every key in the result. */
  id: string
}

export type CreateDocsProjectsClientOptions = {
  /** Injectable `fetch` (tests, proxies, custom agents). Default `globalThis.fetch`. */
  fetch?: typeof fetch
  /** Passed to every request, for example `{ next: { revalidate: 300 } }` in Next.js. */
  fetchOptions?: DocsProjectsFetchOptions
  /** Sites in display order. */
  sites: DocsProjectsSiteConfig[]
  /** Per-request timeout. `0` disables it. Default 10 seconds. */
  timeoutMs?: number
}

export type DocsSiteRef = {
  baseUrl: string
  id: string
}

/** A project with identities scoped to its site, so equal slugs on two sites never collide. */
export type DocsSiteProject = {
  /** `<siteId>/<groupSlug>`, or null for an ungrouped docs set. */
  groupKey: null | string
  /** `<siteId>/<slug>`: unique across every configured site. */
  key: string
  site: DocsSiteRef
} & DocsProject

export type DocsSiteGroup = {
  /** `<siteId>/<groupSlug>`. */
  key: string
  projects: DocsSiteProject[]
} & DocsProjectsGroup

export type DocsSiteErrorCode =
  | 'http'
  | 'invalid_json'
  | 'network'
  | 'not_found'
  | 'timeout'
  | DocsProjectsParseErrorCode

export type DocsSiteError = {
  code: DocsSiteErrorCode
  message: string
  /** HTTP status, when the site answered. */
  status?: number
}

export type DocsSiteResult =
  | ({
      /** Groups in the site's order, each with its projects. */
      groups: DocsSiteGroup[]
      ok: true
      /** Every project of the site in its order (grouped and ungrouped). */
      projects: DocsSiteProject[]
      schemaVersion: typeof DOCS_PROJECTS_SCHEMA_VERSION
      /** Docs sets without a group. */
      ungrouped: DocsSiteProject[]
      /** Entries the site returned that did not match the schema and were skipped. */
      warnings: string[]
    } & DocsSiteRef)
  | ({
      error: DocsSiteError
      ok: false
    } & DocsSiteRef)

export type DocsProjectsResult = {
  /** True when every requested site answered with a valid response. */
  complete: boolean
  /** One entry per failed site, in site order. */
  errors: Array<{ error: DocsSiteError; siteId: string }>
  /** Every project of every successful site: site order, then each site's order. */
  projects: DocsSiteProject[]
  /** One entry per requested site, in configuration order. */
  sites: DocsSiteResult[]
}

export type GetDocsProjectsOptions = {
  /** Only docs sets in these docs groups (by group slug, on every site). */
  groups?: string[]
  signal?: AbortSignal
  /** Only these site ids. Default: every configured site. */
  sites?: string[]
}

export type GetDocsProjectResult =
  | { error: DocsSiteError; ok: false; site: DocsSiteRef }
  | { ok: true; project: DocsSiteProject; site: DocsSiteRef }

export type DocsProjectsClient = {
  getProject: (siteId: string, slug: string, options?: { signal?: AbortSignal }) => Promise<GetDocsProjectResult>
  getProjects: (options?: GetDocsProjectsOptions) => Promise<DocsProjectsResult>
  sites: readonly DocsSiteRef[]
}

type ResolvedSite = {
  apiUrl: string
  fetchOptions?: DocsProjectsFetchOptions
} & DocsSiteRef

class SiteRequestError extends Error {
  readonly error: DocsSiteError

  constructor(error: DocsSiteError) {
    super(error.message)
    this.error = error
  }
}

const resolveSite = (site: DocsProjectsSiteConfig): ResolvedSite => {
  if (typeof site.id !== 'string' || site.id.trim() === '') {
    throw new TypeError('Every docs projects site needs a non-empty id.')
  }

  let base: URL

  try {
    base = new URL(site.baseUrl)
  } catch {
    throw new TypeError(`Site "${site.id}" has an invalid baseUrl: ${JSON.stringify(site.baseUrl)}.`)
  }

  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new TypeError(`Site "${site.id}" baseUrl must be http or https.`)
  }

  const baseUrl = base.toString().replace(/\/+$/, '')
  const apiPath = `/${(site.apiPath ?? DEFAULT_DOCS_PROJECTS_API_PATH).replace(/^\/+|\/+$/g, '')}`

  return { id: site.id, apiUrl: `${baseUrl}${apiPath}`, baseUrl, fetchOptions: site.fetchOptions }
}

const mergeFetchOptions = (
  base: DocsProjectsFetchOptions | undefined,
  site: DocsProjectsFetchOptions | undefined,
): DocsProjectsFetchOptions => {
  const headers = new Headers(base?.headers)

  new Headers(site?.headers).forEach((value, name) => headers.set(name, value))

  if (!headers.has('accept')) {
    headers.set('accept', 'application/json')
  }

  return { ...base, ...site, headers }
}

const createSignal = (
  timeoutMs: number,
  ...signals: Array<AbortSignal | null | undefined>
): { cleanup: () => void; signal?: AbortSignal; timedOut: () => boolean } => {
  const sources = signals.filter((signal): signal is AbortSignal => Boolean(signal))
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined

  if (timeoutMs <= 0 && sources.length <= 1) {
    return { cleanup: () => {}, signal: sources[0], timedOut: () => false }
  }

  const controller = new AbortController()
  const abort = (reason?: unknown) => controller.abort(reason)

  for (const source of sources) {
    if (source.aborted) {
      abort(source.reason)
    } else {
      source.addEventListener('abort', () => abort(source.reason), { once: true })
    }
  }

  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true
      abort(new Error(`Timed out after ${timeoutMs} ms.`))
    }, timeoutMs)
  }

  return {
    cleanup: () => clearTimeout(timer),
    signal: controller.signal,
    timedOut: () => timedOut,
  }
}

const toSiteProject = (site: DocsSiteRef, project: DocsProject): DocsSiteProject => ({
  ...project,
  groupKey: project.group ? `${site.id}/${project.group.slug}` : null,
  key: `${site.id}/${project.slug}`,
  site: { id: site.id, baseUrl: site.baseUrl },
})

export const createDocsProjectsClient = (options: CreateDocsProjectsClientOptions): DocsProjectsClient => {
  const sites = options.sites.map(resolveSite)
  const sitesById = new Map<string, ResolvedSite>()
  const timeoutMs = options.timeoutMs ?? DEFAULT_DOCS_PROJECTS_TIMEOUT_MS

  for (const site of sites) {
    if (sitesById.has(site.id)) {
      throw new TypeError(`Site id "${site.id}" is configured more than once.`)
    }

    sitesById.set(site.id, site)
  }

  const getSite = (id: string): ResolvedSite => {
    const site = sitesById.get(id)

    if (!site) {
      throw new TypeError(`Unknown docs projects site "${id}".`)
    }

    return site
  }

  const request = async (site: ResolvedSite, url: string, signal?: AbortSignal): Promise<{ body: unknown; status: number }> => {
    const fetchImpl = options.fetch ?? globalThis.fetch
    const init = mergeFetchOptions(options.fetchOptions, site.fetchOptions)
    const abort = createSignal(timeoutMs, init.signal, signal)
    let response: Response

    try {
      response = await fetchImpl(url, { ...init, signal: abort.signal })
    } catch (error) {
      abort.cleanup()

      // The caller cancelled: that is not a site failure.
      if (signal?.aborted && !abort.timedOut()) {
        throw error
      }

      throw new SiteRequestError(
        abort.timedOut()
          ? { code: 'timeout', message: `${site.id}: no response from ${url} within ${timeoutMs} ms.` }
          : { code: 'network', message: `${site.id}: request to ${url} failed: ${error instanceof Error ? error.message : String(error)}` },
      )
    }

    try {
      const text = await response.text()

      try {
        return { body: JSON.parse(text) as unknown, status: response.status }
      } catch {
        throw new SiteRequestError(
          response.ok
            ? { code: 'invalid_json', message: `${site.id}: ${url} did not return JSON.`, status: response.status }
            : { code: 'http', message: `${site.id}: ${url} answered HTTP ${response.status}.`, status: response.status },
        )
      }
    } finally {
      abort.cleanup()
    }
  }

  const fetchSite = async (
    site: ResolvedSite,
    { groups, signal }: { groups?: string[]; signal?: AbortSignal },
  ): Promise<DocsSiteResult> => {
    const ref = { id: site.id, baseUrl: site.baseUrl }
    const url = groups && groups.length > 0 ? `${site.apiUrl}?group=${encodeURIComponent(groups.join(','))}` : site.apiUrl

    try {
      const { body, status } = await request(site, url, signal)

      if (status !== 200) {
        throw new SiteRequestError({
          code: 'http',
          message: `${site.id}: ${url} answered HTTP ${status}${status === 404 ? ' (is publicApi.projects enabled on that site?)' : ''}.`,
          status,
        })
      }

      const parsed = parseDocsProjectsListResponse(body)

      if (!parsed.ok) {
        throw new SiteRequestError({ code: parsed.code, message: `${site.id}: ${parsed.message}`, status })
      }

      const projects = parsed.value.projects.map((project) => toSiteProject(ref, project))
      const groupsBySlug = new Map<string, DocsSiteGroup>(
        parsed.value.groups.map((group) => [group.slug, { ...group, key: `${site.id}/${group.slug}`, projects: [] }]),
      )
      const ungrouped: DocsSiteProject[] = []

      for (const project of projects) {
        if (!project.group) {
          ungrouped.push(project)
          continue
        }

        let group = groupsBySlug.get(project.group.slug)

        if (!group) {
          group = { ...project.group, key: `${site.id}/${project.group.slug}`, projects: [] }
          groupsBySlug.set(project.group.slug, group)
        }

        group.projects.push(project)
      }

      return {
        ...ref,
        groups: [...groupsBySlug.values()].filter((group) => group.projects.length > 0),
        ok: true,
        projects,
        schemaVersion: DOCS_PROJECTS_SCHEMA_VERSION,
        ungrouped,
        warnings: parsed.warnings.map((warning) => `${site.id}: ${warning}`),
      }
    } catch (error) {
      if (error instanceof SiteRequestError) {
        return { ...ref, error: error.error, ok: false }
      }

      throw error
    }
  }

  return {
    getProject: async (siteId, slug, { signal } = {}) => {
      const site = getSite(siteId)
      const ref = { id: site.id, baseUrl: site.baseUrl }
      const url = `${site.apiUrl}/${encodeURIComponent(slug)}`

      try {
        const { body, status } = await request(site, url, signal)

        if (status === 404) {
          return {
            error: { code: 'not_found', message: `${site.id}: no published project "${slug}".`, status },
            ok: false,
            site: ref,
          }
        }

        if (status !== 200) {
          return { error: { code: 'http', message: `${site.id}: ${url} answered HTTP ${status}.`, status }, ok: false, site: ref }
        }

        const parsed = parseDocsProjectResponse(body)

        if (!parsed.ok) {
          return { error: { code: parsed.code, message: `${site.id}: ${parsed.message}`, status }, ok: false, site: ref }
        }

        return { ok: true, project: toSiteProject(ref, parsed.value.project), site: ref }
      } catch (error) {
        if (error instanceof SiteRequestError) {
          return { error: error.error, ok: false, site: ref }
        }

        throw error
      }
    },
    getProjects: async ({ groups, signal, sites: siteIds } = {}) => {
      const selected = siteIds ? siteIds.map(getSite) : sites
      const results = await Promise.all(selected.map((site) => fetchSite(site, { groups, signal })))

      return {
        complete: results.every((result) => result.ok),
        errors: results.flatMap((result) => (result.ok ? [] : [{ error: result.error, siteId: result.id }])),
        projects: results.flatMap((result) => (result.ok ? result.projects : [])),
        sites: results,
      }
    },
    sites: sites.map(({ id, baseUrl }) => ({ id, baseUrl })),
  }
}
