import type { MetadataRoute } from 'next'
import type { PaginatedDocs } from 'payload'

import { unstable_cache } from 'next/cache'

import type { PayloadMarkdownDocsCollectionSlugs, PayloadMarkdownDocsReadPayload } from './types.js'

import {
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
  DEFAULT_MARKDOWN_FIELD_NAME,
} from '../constants.js'
import { deriveDocsSetRouteBase, isRouteDescendant, joinRouteSegments } from '../routing/index.js'
import { getRelationshipId, isRecord, isVisibleDocsRecord, toResolvedDocsRecord } from './records.js'

export type PayloadMarkdownDocsSitemapDoc = {
  lastModified?: null | string
  url?: null | string
}

export type GetPaginatedDocsForSitemapOptions = {
  cacheKey?: string | string[]
  collections?: PayloadMarkdownDocsCollectionSlugs
  fetchLimit?: number
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

const DEFAULT_SITEMAP_CACHE_KEY = 'sitemap-docs-v1'
const DEFAULT_SITEMAP_TAGS = ['sitemap', 'sitemap:docs']

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

  const routePath = deriveDocsSetRouteBase({
    docsSetSlug: slug,
    groupRoutePath: getGroupRoutePath({
      groupId: getRelationshipId(doc.group),
      groupsById,
    }),
  })

  return {
    docsSetId: getRelationshipId(doc),
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

const belongsToDocsSetRoute = ({
  docsSetRoutePaths,
  routePath,
}: {
  docsSetRoutePaths: string[]
  routePath: string
}): boolean =>
  docsSetRoutePaths.some(
    (docsSetRoutePath) =>
      routePath === docsSetRoutePath || isRouteDescendant(docsSetRoutePath, routePath),
  )

const toRecursiveSitemapDoc = ({
  doc,
  docsSetIds,
  docsSetRoutePaths,
  siteUrl,
}: {
  doc: unknown
  docsSetIds: Set<string>
  docsSetRoutePaths: string[]
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

  if (record.docsSetId) {
    if (!docsSetIds.has(record.docsSetId)) {
      return undefined
    }
  } else if (
    !belongsToDocsSetRoute({
      docsSetRoutePaths,
      routePath: record.route,
    })
  ) {
    return undefined
  }

  return {
    lastModified: getOptionalString(doc, 'updatedAt') ?? null,
    url: getSitemapUrl({
      routePath: record.route,
      siteUrl,
    }),
  }
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
  collections,
  fetchLimit = 10000,
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
  const docsSetIds = new Set(
    docsSetEntries.flatMap((entry) => (entry.docsSetId ? [entry.docsSetId] : [])),
  )
  const docsSetRoutePaths = docsSetEntries.map((entry) => entry.routePath)
  const recursiveDocs =
    docsResult?.docs.flatMap((doc) => {
      const sitemapDoc = toRecursiveSitemapDoc({
        doc,
        docsSetIds,
        docsSetRoutePaths,
        siteUrl,
      })

      return sitemapDoc ? [sitemapDoc] : []
    }) ?? []
  const docs = dedupeAndSortSitemapDocs([
    ...docsSetEntries.map((entry) => entry.sitemapDoc),
    ...recursiveDocs,
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
