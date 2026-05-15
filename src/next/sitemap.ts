import type { MetadataRoute } from 'next'
import type { PaginatedDocs } from 'payload'

import { unstable_cache } from 'next/cache'

import type { DocsSetRouteMode } from '../routing/index.js'
import type { PayloadMarkdownDocsCollectionSlugs, PayloadMarkdownDocsReadPayload } from './types.js'

import {
  DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
  DEFAULT_MARKDOWN_FIELD_NAME,
} from '../constants.js'
import {
  deriveDocsSetProductRoutePath,
  deriveDocsSetRouteBase,
  isRouteDescendant,
  joinRouteSegments,
  normalizeRoutePath,
} from '../routing/index.js'
import { getRelationshipId, isRecord, isVisibleDocsRecord, toResolvedDocsRecord } from './records.js'

export type PayloadMarkdownDocsSitemapDoc = {
  lastModified?: null | string
  url?: null | string
}

export type PayloadMarkdownDocsSitemapRouteInput = {
  lastModified?: Date | null | string
  path?: string
  url?: string
}

export type PayloadMarkdownDocsAiSitemapSkillRoutesInput = {
  agents: string[]
  basePath: string
  files?: string[]
  lastModified?: Date | null | string
}

export type GetPayloadMarkdownDocsAiSitemapRoutesOptions = {
  includeLlmsFull?: boolean
  siteRoot?: boolean
  skills?: PayloadMarkdownDocsAiSitemapSkillRoutesInput[]
}

export type GetPaginatedDocsForSitemapOptions = {
  additionalRoutes?: PayloadMarkdownDocsSitemapRouteInput[]
  cacheKey?: string | string[]
  collections?: PayloadMarkdownDocsCollectionSlugs
  fetchLimit?: number
  /** Include stored generic static asset routes. Does not include llms or skills. */
  includeAssets?: boolean
  /** Include generated and stored llms.txt / llms-full.txt routes. */
  includeLlms?: boolean
  /** Include stored native skill artifact routes and SKILL.md directory aliases. */
  includeSkills?: boolean
  overrideAccess?: boolean
  payload: PayloadMarkdownDocsReadPayload
  recursive?: boolean
  siteUrl: string
  tags?: string[]
}

export type GetDocsForSitemapOptions = GetPaginatedDocsForSitemapOptions

type GetPaginatedDocsForSitemapCacheOptions = Omit<
  GetPaginatedDocsForSitemapOptions,
  'cacheKey' | 'payload' | 'tags'
>

const DEFAULT_SITEMAP_CACHE_KEY = 'sitemap-docs-v2'
const DEFAULT_SITEMAP_TAGS = ['sitemap', 'sitemap:docs']
const DEFAULT_AI_SKILL_FILES = ['SKILL.md']

const getOptionalString = (doc: Record<string, unknown>, key: string): string | undefined => {
  const value = doc[key]

  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

const normalizeSiteUrl = (siteUrl: string): string => {
  const trimmed = siteUrl.trim().replace(/\/+$/g, '')

  return trimmed || '/'
}

const getSitemapUrl = ({
  routePath,
  siteUrl,
}: {
  routePath: string
  siteUrl: string
}): string => {
  const baseUrl = normalizeSiteUrl(siteUrl)

  return routePath === '/' ? baseUrl : `${baseUrl}${routePath}`
}

const normalizeLastModified = (
  lastModified?: Date | null | string,
): null | string => {
  if (!lastModified) {
    return null
  }

  if (lastModified instanceof Date) {
    return lastModified.toISOString()
  }

  const trimmed = lastModified.trim()

  return trimmed || null
}

const toAdditionalSitemapDoc = ({
  route,
  siteUrl,
}: {
  route: PayloadMarkdownDocsSitemapRouteInput
  siteUrl: string
}): PayloadMarkdownDocsSitemapDoc | undefined => {
  const url = route.url?.trim()
  const path = route.path?.trim()

  if (url) {
    return {
      lastModified: normalizeLastModified(route.lastModified),
      url,
    }
  }

  if (!path) {
    return undefined
  }

  return {
    lastModified: normalizeLastModified(route.lastModified),
    url: getSitemapUrl({
      routePath: normalizeRoutePath(path),
      siteUrl,
    }),
  }
}

export const getPayloadMarkdownDocsAiSitemapRoutes = ({
  includeLlmsFull = false,
  siteRoot = true,
  skills = [],
}: GetPayloadMarkdownDocsAiSitemapRoutesOptions = {}): PayloadMarkdownDocsSitemapRouteInput[] => {
  const routes: PayloadMarkdownDocsSitemapRouteInput[] = []

  if (siteRoot) {
    routes.push({
      path: '/llms.txt',
    })

    if (includeLlmsFull) {
      routes.push({
        path: '/llms-full.txt',
      })
    }
  }

  for (const skill of skills) {
    const basePath = skill.basePath.trim()

    if (!basePath) {
      continue
    }

    const files = skill.files ?? DEFAULT_AI_SKILL_FILES

    for (const agent of skill.agents) {
      const normalizedAgent = agent.trim()

      if (!normalizedAgent) {
        continue
      }

      for (const file of files) {
        const normalizedFile = file.trim()

        if (!normalizedFile) {
          continue
        }

        routes.push({
          lastModified: skill.lastModified,
          path: joinRouteSegments(basePath, normalizedAgent, normalizedFile),
        })
      }
    }
  }

  return routes
}

const getGroupRoutePath = ({
  groupId,
  groupsById,
  seen = new Set<string>(),
}: {
  groupId?: string
  groupsById: Map<string, unknown>
  seen?: Set<string>
}): string | undefined => {
  if (!groupId || seen.has(groupId)) {
    return undefined
  }

  const group = groupsById.get(groupId)

  if (!isRecord(group)) {
    return undefined
  }

  const slug = getOptionalString(group, 'slug')

  if (!slug) {
    return undefined
  }

  const parentRoutePath = getGroupRoutePath({
    groupId: getRelationshipId(group.parent),
    groupsById,
    seen: new Set([groupId, ...seen]),
  })

  return joinRouteSegments(parentRoutePath, slug)
}

type DocsSetSitemapEntry = {
  docsSetId?: string
  productRoute: string
  routeMode: DocsSetRouteMode
  routePath: string
  sitemapDoc: PayloadMarkdownDocsSitemapDoc
}

const toDocsSetSitemapEntry = ({
  doc,
  groupsById,
  siteUrl,
}: {
  doc: unknown
  groupsById: Map<string, unknown>
  siteUrl: string
}): DocsSetSitemapEntry | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  const slug = getOptionalString(doc, 'slug')

  if (!slug) {
    return undefined
  }

  const groupRoutePath = getGroupRoutePath({
    groupId: getRelationshipId(doc.group),
    groupsById,
  })
  const routeMode = doc.routeMode === 'product-nested' ? 'product-nested' : 'docs-root'
  const productRoute = deriveDocsSetProductRoutePath({
    docsSetSlug: slug,
    groupRoutePath,
  })
  const routePath = deriveDocsSetRouteBase({
    docsSetSlug: slug,
    groupRoutePath,
    routeMode,
  })

  return {
    docsSetId: getRelationshipId(doc),
    productRoute,
    routeMode,
    routePath,
    sitemapDoc: {
      lastModified: getOptionalString(doc, 'updatedAt') ?? null,
      url: getSitemapUrl({
        routePath,
        siteUrl,
      }),
    },
  }
}

const getDocsSetEntryForRoute = ({
  docsSetEntries,
  routePath,
}: {
  docsSetEntries: DocsSetSitemapEntry[]
  routePath: string
}): DocsSetSitemapEntry | undefined =>
  docsSetEntries.find(
    (entry) => routePath === entry.routePath || isRouteDescendant(entry.routePath, routePath),
  ) ??
  docsSetEntries.find(
    (entry) =>
      entry.routeMode === 'product-nested' &&
      (routePath === entry.productRoute || isRouteDescendant(entry.productRoute, routePath)),
  )

const getRouteDescendantSuffix = ({
  child,
  parent,
}: {
  child: string
  parent: string
}): string | undefined => {
  const normalizedParent = normalizeRoutePath(parent)
  const normalizedChild = normalizeRoutePath(child)

  if (normalizedParent === '/') {
    return normalizedChild === '/' ? undefined : normalizedChild.slice(1)
  }

  if (!isRouteDescendant(normalizedParent, normalizedChild)) {
    return undefined
  }

  return normalizedChild.slice(normalizedParent.length + 1)
}

const isRootIndexSourcePath = (sourcePath: string): boolean =>
  sourcePath.replace(/\\/g, '/').replace(/^\/+/g, '').toLowerCase() === 'index.md'

const resolveRecursiveSitemapRoutePath = ({
  docsSetEntry,
  routePath,
  sourcePath,
}: {
  docsSetEntry: DocsSetSitemapEntry
  routePath: string
  sourcePath: string
}): string => {
  const normalizedRoutePath = normalizeRoutePath(routePath)

  if (docsSetEntry.routeMode !== 'product-nested') {
    return normalizedRoutePath
  }

  if (
    normalizedRoutePath === docsSetEntry.routePath ||
    isRouteDescendant(docsSetEntry.routePath, normalizedRoutePath)
  ) {
    return normalizedRoutePath
  }

  if (
    normalizedRoutePath === docsSetEntry.productRoute ||
    isRootIndexSourcePath(sourcePath)
  ) {
    return docsSetEntry.routePath
  }

  const suffix = getRouteDescendantSuffix({
    child: normalizedRoutePath,
    parent: docsSetEntry.productRoute,
  })

  return suffix ? joinRouteSegments(docsSetEntry.routePath, suffix) : normalizedRoutePath
}

const toRecursiveSitemapDoc = ({
  doc,
  docsSetEntries,
  docsSetEntryById,
  siteUrl,
}: {
  doc: unknown
  docsSetEntries: DocsSetSitemapEntry[]
  docsSetEntryById: Map<string, DocsSetSitemapEntry>
  siteUrl: string
}): PayloadMarkdownDocsSitemapDoc | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  const record = toResolvedDocsRecord({
    doc,
    markdownField: DEFAULT_MARKDOWN_FIELD_NAME,
  })

  if (
    !record ||
    !isVisibleDocsRecord({
      record,
    })
  ) {
    return undefined
  }

  const docsSetEntry = record.docsSetId
    ? docsSetEntryById.get(record.docsSetId)
    : getDocsSetEntryForRoute({
        docsSetEntries,
        routePath: record.route,
      })

  if (!docsSetEntry) {
    return undefined
  }

  const routePath = resolveRecursiveSitemapRoutePath({
    docsSetEntry,
    routePath: record.route,
    sourcePath: record.sourcePath,
  })

  return {
    lastModified: getOptionalString(doc, 'updatedAt') ?? null,
    url: getSitemapUrl({
      routePath,
      siteUrl,
    }),
  }
}

const toAssetSitemapDocs = ({
  doc,
  docsSetRouteById,
  includeAssets,
  includeLlms,
  includeSkills,
  siteUrl,
}: {
  doc: unknown
  docsSetRouteById: Map<string, string>
  includeAssets: boolean
  includeLlms: boolean
  includeSkills: boolean
  siteUrl: string
}): PayloadMarkdownDocsSitemapDoc[] => {
  if (!isRecord(doc) || typeof doc.route !== 'string' || doc.route.trim() === '') {
    return []
  }

  const sync = isRecord(doc.sync) ? doc.sync : undefined

  if (sync?.archived === true) {
    return []
  }

  const kind = getOptionalString(doc, 'kind')
  const routePath = normalizeRoutePath(doc.route)
  const lastModified = getOptionalString(doc, 'updatedAt') ?? null

  if (kind === 'static') {
    return includeAssets
      ? [
          {
            lastModified,
            url: getSitemapUrl({
              routePath,
              siteUrl,
            }),
          },
        ]
      : []
  }

  if (kind !== 'llms' && kind !== 'llms-full' && kind !== 'skill') {
    return []
  }

  if ((kind === 'llms' || kind === 'llms-full') && !includeLlms) {
    return []
  }

  if (kind === 'skill' && !includeSkills) {
    return []
  }

  const docs: PayloadMarkdownDocsSitemapDoc[] = [
    {
      lastModified,
      url: getSitemapUrl({
        routePath,
        siteUrl,
      }),
    },
  ]
  const docsSetId = getRelationshipId(doc.docsSet)
  const docsSetRoutePath = docsSetId ? docsSetRouteById.get(docsSetId) : undefined

  if (docsSetRoutePath && (kind === 'llms' || kind === 'llms-full')) {
    docs.push({
      lastModified,
      url: getSitemapUrl({
        routePath: joinRouteSegments(
          docsSetRoutePath,
          kind === 'llms' ? 'llms.txt' : 'llms-full.txt',
        ),
        siteUrl,
      }),
    })
  }

  if (kind === 'skill' && routePath.endsWith('/SKILL.md')) {
    docs.push({
      lastModified,
      url: getSitemapUrl({
        routePath: routePath.slice(0, -'/SKILL.md'.length),
        siteUrl,
      }),
    })
  }

  return docs
}

const getLatestLastModified = (
  first?: null | string,
  second?: null | string,
): null | string => {
  if (!first) {
    return second ?? null
  }

  if (!second) {
    return first
  }

  const firstTime = Date.parse(first)
  const secondTime = Date.parse(second)

  if (Number.isNaN(firstTime) || Number.isNaN(secondTime)) {
    return first > second ? first : second
  }

  return firstTime > secondTime ? first : second
}

const toGeneratedLlmsSitemapDocs = ({
  docsSetEntries,
  siteUrl,
}: {
  docsSetEntries: DocsSetSitemapEntry[]
  siteUrl: string
}): PayloadMarkdownDocsSitemapDoc[] => {
  if (docsSetEntries.length === 0) {
    return []
  }

  const rootLastModified = docsSetEntries.reduce<null | string>(
    (latest, entry) => getLatestLastModified(latest, entry.sitemapDoc.lastModified),
    null,
  )

  return [
    {
      lastModified: rootLastModified,
      url: getSitemapUrl({
        routePath: '/llms.txt',
        siteUrl,
      }),
    },
    {
      lastModified: rootLastModified,
      url: getSitemapUrl({
        routePath: '/llms-full.txt',
        siteUrl,
      }),
    },
    ...docsSetEntries.flatMap((entry) => [
      {
        lastModified: entry.sitemapDoc.lastModified,
        url: getSitemapUrl({
          routePath: joinRouteSegments(entry.routePath, 'llms.txt'),
          siteUrl,
        }),
      },
      {
        lastModified: entry.sitemapDoc.lastModified,
        url: getSitemapUrl({
          routePath: joinRouteSegments(entry.routePath, 'llms-full.txt'),
          siteUrl,
        }),
      },
    ]),
  ]
}

const dedupeAndSortSitemapDocs = (
  docs: PayloadMarkdownDocsSitemapDoc[],
): PayloadMarkdownDocsSitemapDoc[] => {
  const docsByUrl = new Map<string, PayloadMarkdownDocsSitemapDoc>()

  for (const doc of docs) {
    if (!doc.url) {
      continue
    }

    const existing = docsByUrl.get(doc.url)

    docsByUrl.set(
      doc.url,
      existing
        ? {
            lastModified: getLatestLastModified(existing.lastModified, doc.lastModified),
            url: doc.url,
          }
        : doc,
    )
  }

  return [...docsByUrl.values()].sort((first, second) =>
    (first.url ?? '').localeCompare(second.url ?? ''),
  )
}

const getDocsForSitemapUncached = async ({
  additionalRoutes = [],
  collections,
  fetchLimit = 10000,
  includeAssets = false,
  includeLlms = false,
  includeSkills = false,
  overrideAccess = true,
  payload,
  recursive = true,
  siteUrl,
}: {
  payload: PayloadMarkdownDocsReadPayload
} & GetPaginatedDocsForSitemapCacheOptions): Promise<
  PaginatedDocs<PayloadMarkdownDocsSitemapDoc>
> => {
  const docsCollectionSlug = collections?.docs ?? DEFAULT_DOCS_COLLECTION_SLUG
  const docsAssetsCollectionSlug =
    collections?.docsAssets ?? DEFAULT_DOCS_ASSETS_COLLECTION_SLUG
  const docsGroupsCollectionSlug = collections?.docsGroups ?? DEFAULT_DOCS_GROUPS_COLLECTION_SLUG
  const docsSetsCollectionSlug = collections?.docsSets ?? DEFAULT_DOCS_SETS_COLLECTION_SLUG
  const [docsSetsResult, docsGroupsResult, docsResult] = await Promise.all([
    payload.find({
      collection: docsSetsCollectionSlug,
      depth: 0,
      limit: fetchLimit,
      overrideAccess,
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
    payload.find({
      collection: docsGroupsCollectionSlug,
      depth: 0,
      limit: fetchLimit,
      overrideAccess,
      select: {
        id: true,
        slug: true,
        parent: true,
      },
    }),
    recursive
      ? payload.find({
          collection: docsCollectionSlug,
          depth: 0,
          draft: false,
          limit: fetchLimit,
          overrideAccess,
          select: {
            id: true,
            docsSet: true,
            route: true,
            sourcePath: true,
            sync: true,
            title: true,
            updatedAt: true,
          },
        })
      : Promise.resolve(undefined),
  ])
  const groupsById = new Map(
    docsGroupsResult.docs.flatMap((group) => {
      if (!isRecord(group)) {
        return []
      }

      const id = getRelationshipId(group)

      return id ? [[id, group]] : []
    }),
  )
  const docsSetEntries = docsSetsResult.docs
    .flatMap((doc) => {
      const entry = toDocsSetSitemapEntry({
        doc,
        groupsById,
        siteUrl,
      })

      return entry ? [entry] : []
    })
  const docsSetEntryById = new Map(
    docsSetEntries.flatMap((entry) =>
      entry.docsSetId ? [[entry.docsSetId, entry] as const] : [],
    ),
  )
  const docsSetRouteById = new Map(
    docsSetEntries.flatMap((entry) =>
      entry.docsSetId ? [[entry.docsSetId, entry.routePath] as const] : [],
    ),
  )
  const recursiveDocs =
    docsResult?.docs.flatMap((doc) => {
      const sitemapDoc = toRecursiveSitemapDoc({
        doc,
        docsSetEntries,
        docsSetEntryById,
        siteUrl,
      })

      return sitemapDoc ? [sitemapDoc] : []
    }) ?? []
  const shouldFetchAssets = includeAssets || includeLlms || includeSkills
  const assetDocs = shouldFetchAssets
    ? await (async () => {
        try {
          const assetsResult = await payload.find({
            collection: docsAssetsCollectionSlug,
            depth: 0,
            limit: fetchLimit,
            overrideAccess,
            select: {
              id: true,
              docsSet: true,
              kind: true,
              route: true,
              sync: true,
              updatedAt: true,
            },
            where: {
              'sync.archived': {
                not_equals: true,
              },
            },
          })

          return assetsResult.docs.flatMap((doc) => {
            return toAssetSitemapDocs({
              doc,
              docsSetRouteById,
              includeAssets,
              includeLlms,
              includeSkills,
              siteUrl,
            })
          })
        } catch {
          return []
        }
      })()
    : []
  const generatedLlmsDocs = includeLlms
    ? toGeneratedLlmsSitemapDocs({
        docsSetEntries,
        siteUrl,
      })
    : []
  const docs = dedupeAndSortSitemapDocs([
    ...docsSetEntries.map((entry) => entry.sitemapDoc),
    ...recursiveDocs,
    ...generatedLlmsDocs,
    ...assetDocs,
    ...additionalRoutes.flatMap((route) => {
      const sitemapDoc = toAdditionalSitemapDoc({
        route,
        siteUrl,
      })

      return sitemapDoc ? [sitemapDoc] : []
    }),
  ])

  return {
    ...docsSetsResult,
    docs,
    hasNextPage: false,
    hasPrevPage: false,
    limit: docs.length,
    nextPage: null,
    page: 1,
    pagingCounter: docs.length > 0 ? 1 : 0,
    prevPage: null,
    totalDocs: docs.length,
    totalPages: docs.length > 0 ? 1 : 0,
  }
}

export const getPaginatedDocsForSitemap = async ({
  cacheKey = DEFAULT_SITEMAP_CACHE_KEY,
  payload,
  tags = DEFAULT_SITEMAP_TAGS,
  ...options
}: GetPaginatedDocsForSitemapOptions): Promise<PaginatedDocs<PayloadMarkdownDocsSitemapDoc>> => {
  const cacheKeyParts = Array.isArray(cacheKey) ? cacheKey : [cacheKey]
  const cachedGetDocsForSitemap = unstable_cache(
    async (cacheOptions: GetPaginatedDocsForSitemapCacheOptions) =>
      getDocsForSitemapUncached({
        ...cacheOptions,
        payload,
      }),
    cacheKeyParts,
    {
      tags,
    },
  )

  return cachedGetDocsForSitemap(options)
}

export const getDocsForSitemap = async (
  options: GetDocsForSitemapOptions,
): Promise<MetadataRoute.Sitemap> => {
  const result = await getPaginatedDocsForSitemap(options)

  return result.docs.flatMap((doc) =>
    doc.url
      ? [
          {
            ...(doc.lastModified ? { lastModified: doc.lastModified } : {}),
            url: doc.url,
          },
        ]
      : [],
  )
}
