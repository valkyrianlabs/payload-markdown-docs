import type { PaginatedDocs } from 'payload'

import { unstable_cache } from 'next/cache'

import type { PayloadMarkdownDocsCollectionSlugs, PayloadMarkdownDocsReadPayload } from './types.js'

import {
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
} from '../constants.js'
import { deriveDocsSetRouteBase, joinRouteSegments } from '../routing/index.js'
import { getRelationshipId, isRecord } from './records.js'

export type PayloadMarkdownDocsSitemapDoc = {
  lastModified?: null | string
  url?: null | string
}

export type GetDocsForSitemapOptions = {
  cacheKey?: string | string[]
  collections?: Pick<PayloadMarkdownDocsCollectionSlugs, 'docsGroups' | 'docsSets'>
  fetchLimit?: number
  overrideAccess?: boolean
  payload: PayloadMarkdownDocsReadPayload
  siteUrl: string
  tags?: string[]
}

type GetDocsForSitemapCacheOptions = Omit<GetDocsForSitemapOptions, 'cacheKey' | 'payload' | 'tags'>

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

const toSitemapDoc = ({
  doc,
  groupsById,
  siteUrl,
}: {
  doc: unknown
  groupsById: Map<string, unknown>
  siteUrl: string
}): PayloadMarkdownDocsSitemapDoc | undefined => {
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
    lastModified: getOptionalString(doc, 'updatedAt') ?? null,
    url: getSitemapUrl({
      routePath,
      siteUrl,
    }),
  }
}

const getDocsForSitemapUncached = async ({
  collections,
  fetchLimit = 10000,
  overrideAccess = true,
  payload,
  siteUrl,
}: {
  payload: PayloadMarkdownDocsReadPayload
} & GetDocsForSitemapCacheOptions): Promise<PaginatedDocs<PayloadMarkdownDocsSitemapDoc>> => {
  const docsGroupsCollectionSlug = collections?.docsGroups ?? DEFAULT_DOCS_GROUPS_COLLECTION_SLUG
  const docsSetsCollectionSlug = collections?.docsSets ?? DEFAULT_DOCS_SETS_COLLECTION_SLUG
  const [docsSetsResult, docsGroupsResult] = await Promise.all([
    payload.find({
      collection: docsSetsCollectionSlug,
      depth: 0,
      limit: fetchLimit,
      overrideAccess,
      select: {
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
  const docs = docsSetsResult.docs
    .flatMap((doc) => {
      const sitemapDoc = toSitemapDoc({
        doc,
        groupsById,
        siteUrl,
      })

      return sitemapDoc ? [sitemapDoc] : []
    })
    .sort((first, second) => (first.url ?? '').localeCompare(second.url ?? ''))

  return {
    ...docsSetsResult,
    docs,
  }
}

export const getDocsForSitemap = async ({
  cacheKey = DEFAULT_SITEMAP_CACHE_KEY,
  payload,
  tags = DEFAULT_SITEMAP_TAGS,
  ...options
}: GetDocsForSitemapOptions): Promise<PaginatedDocs<PayloadMarkdownDocsSitemapDoc>> => {
  const cacheKeyParts = Array.isArray(cacheKey) ? cacheKey : [cacheKey]
  const cachedGetDocsForSitemap = unstable_cache(
    async (cacheOptions: GetDocsForSitemapCacheOptions) =>
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
