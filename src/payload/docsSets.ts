import type { DocsSetRouteMode } from '../routing/index.js'
import type { PayloadMarkdownDocsAuthToggle } from '../types.js'

import {
  DEFAULT_DOCS_SET_ROUTE_MODE,
  deriveDocsSetProductRoutePath,
  deriveDocsSetRouteBase,
  isRouteDescendant,
  joinRouteSegments,
  normalizeRoutePath,
} from '../routing/index.js'

export type DocsSetPayloadOperations = {
  find: (args: {
    collection: string
    depth?: number
    draft?: boolean
    limit?: number
    overrideAccess?: boolean
    sort?: string
    where?: unknown
  }) => Promise<{
    docs: unknown[]
  }>
  update?: (args: {
    collection: string
    data: Record<string, unknown>
    draft?: boolean
    id: string
    overrideAccess?: boolean
  }) => Promise<Record<string, unknown>>
}

export type PayloadRecordId = number | string

export type ResolvedDocsGroup = {
  id: PayloadRecordId
  pageMode: 'auto' | 'custom'
  parentId?: string
  routePath: string
  slug: string
}

export type ResolvedDocsSet = {
  advancedSecurity?: {
    allowedWorkflowRefs: string[]
    enabled: boolean
  }
  allowPullRequests: boolean
  branch: string
  description?: string
  groupId?: string
  groupPageMode?: 'auto' | 'custom'
  groupRoutePath?: string
  id: PayloadRecordId
  productRoute: string
  routeBase: string
  routeMode: DocsSetRouteMode
  slug: string
  title: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getRecordId = (doc: Record<string, unknown>): PayloadRecordId | undefined => {
  if (typeof doc.id === 'string' || typeof doc.id === 'number') {
    return doc.id
  }

  return undefined
}

const getRelationshipId = (value: unknown): string | undefined => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  if (isRecord(value)) {
    const id = getRecordId(value)

    return id === undefined ? undefined : String(id)
  }

  return undefined
}

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

const getRouteMode = (value: unknown): DocsSetRouteMode =>
  value === 'product-nested' || value === 'docs-root'
    ? value
    : DEFAULT_DOCS_SET_ROUTE_MODE

const getGroupPageMode = (doc: Record<string, unknown>): 'auto' | 'custom' => {
  if (doc.pageMode === 'auto' || doc.pageMode === 'custom') {
    return doc.pageMode
  }

  return doc.serveIndex === true ? 'auto' : 'custom'
}

const getStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (typeof item === 'string' && item.trim() !== '') {
      return [item.trim()]
    }

    if (isRecord(item)) {
      const nestedValue = getString(item.value)

      return nestedValue ? [nestedValue] : []
    }

    return []
  })
}

const authToggleEnabled = (
  toggle: boolean | PayloadMarkdownDocsAuthToggle | undefined,
  defaultValue: boolean,
): boolean => {
  if (toggle === undefined) {
    return defaultValue
  }

  if (typeof toggle === 'boolean') {
    return toggle
  }

  return toggle.enabled !== false
}

export const isGitHubOidcAuthEnabled = (
  auth: { githubOidc?: boolean | PayloadMarkdownDocsAuthToggle; mode?: 'disabled' } | undefined,
): boolean => auth?.mode !== 'disabled' && authToggleEnabled(auth?.githubOidc, false)

export const isEd25519AuthEnabled = (
  auth: { ed25519?: boolean | PayloadMarkdownDocsAuthToggle; mode?: 'disabled' } | undefined,
): boolean => auth?.mode !== 'disabled' && authToggleEnabled(auth?.ed25519, false)

export const updateDocsSetAfterSync = async ({
  collectionSlug,
  docsCount,
  docsSetId,
  now,
  payload,
  publish,
  syncRunId,
}: {
  collectionSlug: string
  docsCount: number
  docsSetId: PayloadRecordId
  now: Date
  payload: DocsSetPayloadOperations
  publish: boolean
  syncRunId?: PayloadRecordId
}): Promise<void> => {
  if (!payload.update) {
    return
  }

  await payload.update({
    id: String(docsSetId),
    collection: collectionSlug,
    data: {
      _status: publish ? 'published' : 'draft',
      sync: {
        docsCount,
        lastStatus: 'success',
        lastSyncedAt: now.toISOString(),
        lastSyncRunId: syncRunId,
      },
    },
    draft: !publish,
    overrideAccess: true,
  })
}

const toResolvedGroup = (
  doc: unknown,
  groupsById: Map<string, unknown>,
  seen = new Set<string>(),
): ResolvedDocsGroup | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  const id = getRecordId(doc)
  const slug = getString(doc.slug)

  if (!id || !slug) {
    return undefined
  }

  const stringId = String(id)

  if (seen.has(stringId)) {
    return {
      id,
      slug,
      pageMode: getGroupPageMode(doc),
      routePath: joinRouteSegments(slug),
    }
  }

  const parentId = getRelationshipId(doc.parent)
  const parentDoc = parentId ? groupsById.get(parentId) : undefined
  const parentGroup = parentDoc
    ? toResolvedGroup(parentDoc, groupsById, new Set([stringId, ...seen]))
    : undefined

  return {
    id,
    slug,
    pageMode: getGroupPageMode(doc),
    parentId,
    routePath: joinRouteSegments(parentGroup?.routePath, slug),
  }
}

const toResolvedDocsSet = ({
  doc,
  groupsById,
}: {
  doc: unknown
  groupsById: Map<string, unknown>
}): ResolvedDocsSet | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  const id = getRecordId(doc)
  const slug = getString(doc.slug)

  if (!id || !slug) {
    return undefined
  }

  const groupId = getRelationshipId(doc.group)
  const group = groupId ? toResolvedGroup(groupsById.get(groupId), groupsById) : undefined
  const advancedSecurity = isRecord(doc.advancedSecurity) ? doc.advancedSecurity : undefined
  const advancedSecurityEnabled = advancedSecurity?.enabled === true
  const routeMode = getRouteMode(doc.routeMode)
  const productRoute = deriveDocsSetProductRoutePath({
    docsSetSlug: slug,
    groupRoutePath: group?.routePath,
  })

  return {
    id,
    ...(advancedSecurityEnabled
      ? {
          advancedSecurity: {
            allowedWorkflowRefs: getStringArray(advancedSecurity.allowedWorkflowRefs),
            enabled: true,
          },
        }
      : {}),
    slug,
    allowPullRequests: doc.allowPullRequests === true,
    branch: getString(doc.branch) ?? 'main',
    description: getString(doc.description),
    groupId,
    groupPageMode: group?.pageMode,
    groupRoutePath: group?.routePath,
    productRoute,
    routeBase: normalizeRoutePath(
      deriveDocsSetRouteBase({
        docsSetSlug: slug,
        groupRoutePath: group?.routePath,
        routeMode,
      }),
    ),
    routeMode,
    title: getString(doc.title) ?? slug,
  }
}

const getGroupsById = async ({
  collectionSlug,
  payload,
}: {
  collectionSlug: string
  payload: DocsSetPayloadOperations
}): Promise<Map<string, unknown>> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1000,
    overrideAccess: true,
  })

  return new Map(
    result.docs.flatMap((doc) => {
      if (!isRecord(doc)) {
        return []
      }

      const id = getRecordId(doc)

      return id === undefined ? [] : [[String(id), doc]]
    }),
  )
}

export const findDocsSetBySlug = async ({
  slug,
  collectionSlug,
  docsGroupsCollectionSlug,
  includeDrafts = false,
  payload,
}: {
  collectionSlug: string
  docsGroupsCollectionSlug: string
  includeDrafts?: boolean
  payload: DocsSetPayloadOperations
  slug: string
}): Promise<ResolvedDocsSet | undefined> => {
  const [result, groupsById] = await Promise.all([
    payload.find({
      collection: collectionSlug,
      depth: 0,
      draft: includeDrafts,
      limit: 1,
      overrideAccess: true,
      where: {
        slug: {
          equals: slug,
        },
      },
    }),
    getGroupsById({
      collectionSlug: docsGroupsCollectionSlug,
      payload,
    }),
  ])

  return toResolvedDocsSet({
    doc: result.docs[0],
    groupsById,
  })
}

export const findDocsSetByRouteBase = async ({
  collectionSlug,
  docsGroupsCollectionSlug,
  payload,
  routeBase,
}: {
  collectionSlug: string
  docsGroupsCollectionSlug: string
  payload: DocsSetPayloadOperations
  routeBase: string
}): Promise<ResolvedDocsSet | undefined> => {
  const [result, groupsById] = await Promise.all([
    payload.find({
      collection: collectionSlug,
      depth: 0,
      limit: 1000,
      overrideAccess: true,
    }),
    getGroupsById({
      collectionSlug: docsGroupsCollectionSlug,
      payload,
    }),
  ])
  const normalizedRouteBase = normalizeRoutePath(routeBase)

  return result.docs
    .map((doc) =>
      toResolvedDocsSet({
        doc,
        groupsById,
      }),
    )
    .find((docsSet) => docsSet?.routeBase === normalizedRouteBase)
}

export const findDocsSetByRoutePrefix = async ({
  collectionSlug,
  docsGroupsCollectionSlug,
  includeProductRoute = false,
  payload,
  route,
}: {
  collectionSlug: string
  docsGroupsCollectionSlug: string
  includeProductRoute?: boolean
  payload: DocsSetPayloadOperations
  route: string
}): Promise<ResolvedDocsSet | undefined> => {
  const [result, groupsById] = await Promise.all([
    payload.find({
      collection: collectionSlug,
      depth: 0,
      draft: false,
      limit: 1000,
      overrideAccess: true,
    }),
    getGroupsById({
      collectionSlug: docsGroupsCollectionSlug,
      payload,
    }),
  ])
  const normalizedRoute = normalizeRoutePath(route)

  return result.docs
    .map((doc) =>
      toResolvedDocsSet({
        doc,
        groupsById,
      }),
    )
    .filter(
      (docsSet): docsSet is ResolvedDocsSet =>
        docsSet !== undefined &&
        (docsSet.routeBase === normalizedRoute ||
          isRouteDescendant(docsSet.routeBase, normalizedRoute) ||
          (includeProductRoute &&
            docsSet.routeMode === 'product-nested' &&
            (docsSet.productRoute === normalizedRoute ||
              isRouteDescendant(docsSet.productRoute, normalizedRoute)))),
    )
    .sort((first, second) => {
      const firstRoute = includeProductRoute ? first.productRoute : first.routeBase
      const secondRoute = includeProductRoute ? second.productRoute : second.routeBase

      return secondRoute.length - firstRoute.length
    })[0]
}

export const findAllDocsSets = async ({
  collectionSlug,
  docsGroupsCollectionSlug,
  payload,
}: {
  collectionSlug: string
  docsGroupsCollectionSlug: string
  payload: DocsSetPayloadOperations
}): Promise<ResolvedDocsSet[]> => {
  const [result, groupsById] = await Promise.all([
    payload.find({
      collection: collectionSlug,
      depth: 0,
      draft: false,
      limit: 1000,
      overrideAccess: true,
    }),
    getGroupsById({
      collectionSlug: docsGroupsCollectionSlug,
      payload,
    }),
  ])

  return result.docs
    .flatMap((doc) => {
      const docsSet = toResolvedDocsSet({
        doc,
        groupsById,
      })

      return docsSet ? [docsSet] : []
    })
    .sort((first, second) => first.routeBase.localeCompare(second.routeBase))
}
