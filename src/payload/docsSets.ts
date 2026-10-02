import type { DocsGroupsById } from '../routing/docsSetRoutes.js'
import type { DocsSetRouteMode } from '../routing/index.js'
import type { PayloadMarkdownDocsAuthToggle } from '../types.js'

import { indexDocsGroupsById, resolveDocsSetRoutes } from '../routing/docsSetRoutes.js'
import { isRouteDescendant, normalizeRoutePath } from '../routing/index.js'
import {
  getRawRecordId,
  getString,
  isRecord,
} from '../shared/records.js'
import { isPublicDocsSetRecord } from './visibility.js'

export type DocsSetPayloadOperations = {
  db?: {
    updateOne?: (args: {
      collection: string
      data: Record<string, unknown>
      id: number | string
      req?: unknown
    }) => Promise<unknown>
  }
  find: (args: {
    collection: string
    depth?: number
    draft?: boolean
    limit?: number
    overrideAccess?: boolean
    pagination?: boolean
    req?: unknown
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
    req?: unknown
  }) => Promise<Record<string, unknown>>
}

export type PayloadRecordId = number | string

export type ResolvedDocsSet = {
  advancedSecurity?: {
    allowedWorkflowRefs: string[]
    enabled: boolean
  }
  allowPullRequests: boolean
  /** Accept `refs/tags/*` OIDC refs. Missing (pre-existing records) means true. */
  allowTagRefs: boolean
  branch: string
  description?: string
  groupId?: string
  groupPageMode?: 'auto' | 'custom'
  groupRoutePath?: string
  id: PayloadRecordId
  productRoute: string
  /** OIDC repository binding; empty = any repository trusted in Access. */
  repositories: string[]
  routeBase: string
  routeMode: DocsSetRouteMode
  slug: string
  title: string
}

const getGroupPageMode = (doc: Record<string, unknown> | undefined): 'auto' | 'custom' =>
  doc?.pageMode === 'custom' ? 'custom' : 'auto'

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

/**
 * Records sync bookkeeping on the docs set without publishing admin work in progress
 * (DOCS-11).
 *
 * Payload's update merges onto the latest version, so `update({ draft: false })` on a
 * docs set with an unpublished admin draft publishes that draft. Bookkeeping is
 * therefore written to the main record only (no new version, `_status` untouched).
 * The one exception is a `--publish` sync of a docs set that has never been published:
 * publishing it is what makes the synced docs reachable, as before.
 */
export const updateDocsSetAfterSync = async ({
  collectionSlug,
  docsSetId,
  now,
  payload,
  publish,
  req,
}: {
  collectionSlug: string
  docsSetId: PayloadRecordId
  now: Date
  payload: DocsSetPayloadOperations
  publish: boolean
  req?: unknown
}): Promise<void> => {
  const sync = {
    lastStatus: 'success',
    lastSyncedAt: now.toISOString(),
  }
  const mainRecord = (
    await payload.find({
      collection: collectionSlug,
      depth: 0,
      draft: false,
      limit: 1,
      overrideAccess: true,
      req,
      where: {
        id: {
          equals: docsSetId,
        },
      },
    })
  ).docs[0]
  const isPublished = isRecord(mainRecord) && mainRecord._status === 'published'

  if (publish && !isPublished) {
    await payload.update?.({
      id: String(docsSetId),
      collection: collectionSlug,
      data: {
        _status: 'published',
        sync,
      },
      draft: false,
      overrideAccess: true,
      req,
    })

    return
  }

  if (typeof payload.db?.updateOne === 'function') {
    await payload.db.updateOne({
      id: docsSetId,
      collection: collectionSlug,
      data: {
        sync,
      },
      req,
    })
  }
}

const toResolvedDocsSet = ({
  doc,
  groupsById,
}: {
  doc: unknown
  groupsById: DocsGroupsById
}): ResolvedDocsSet | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  const id = getRawRecordId(doc)
  const routes = resolveDocsSetRoutes({ doc, groupsById })

  if (!id || !routes) {
    return undefined
  }

  const { slug, groupId, groupRoutePath, productRoute, routeBase, routeMode } = routes
  const advancedSecurity = isRecord(doc.advancedSecurity) ? doc.advancedSecurity : undefined
  const advancedSecurityEnabled = advancedSecurity?.enabled === true

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
    allowTagRefs: doc.allowTagRefs !== false,
    branch: getString(doc.branch) ?? 'main',
    description: getString(doc.description),
    groupId,
    groupPageMode: groupRoutePath && groupId ? getGroupPageMode(groupsById.get(groupId)) : undefined,
    groupRoutePath,
    productRoute,
    repositories: getStringArray(doc.repositories),
    routeBase,
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
}): Promise<DocsGroupsById> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })

  return indexDocsGroupsById(result.docs)
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
      overrideAccess: true,
      pagination: false,
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
  payload,
  route,
}: {
  collectionSlug: string
  docsGroupsCollectionSlug: string
  payload: DocsSetPayloadOperations
  route: string
}): Promise<ResolvedDocsSet | undefined> => {
  const [result, groupsById] = await Promise.all([
    payload.find({
      collection: collectionSlug,
      depth: 0,
      draft: false,
      overrideAccess: true,
      pagination: false,
    }),
    getGroupsById({
      collectionSlug: docsGroupsCollectionSlug,
      payload,
    }),
  ])
  const normalizedRoute = normalizeRoutePath(route)

  return result.docs
    .filter(isPublicDocsSetRecord)
    .map((doc) =>
      toResolvedDocsSet({
        doc,
        groupsById,
      }),
    )
    .flatMap((docsSet) => {
      if (!docsSet) {
        return []
      }

      const matchedRoutePrefix =
        docsSet.routeBase === normalizedRoute ||
        isRouteDescendant(docsSet.routeBase, normalizedRoute)
          ? docsSet.routeBase
          : docsSet.productRoute === normalizedRoute ||
              isRouteDescendant(docsSet.productRoute, normalizedRoute)
            ? docsSet.productRoute
            : undefined

      return matchedRoutePrefix
        ? [
            {
              docsSet,
              matchedRoutePrefix,
            },
          ]
        : []
    })
    .sort((first, second) => second.matchedRoutePrefix.length - first.matchedRoutePrefix.length)[0]
    ?.docsSet
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
      overrideAccess: true,
      pagination: false,
    }),
    getGroupsById({
      collectionSlug: docsGroupsCollectionSlug,
      payload,
    }),
  ])

  return result.docs
    .filter(isPublicDocsSetRecord)
    .flatMap((doc) => {
      const docsSet = toResolvedDocsSet({
        doc,
        groupsById,
      })

      return docsSet ? [docsSet] : []
    })
    .sort((first, second) => first.routeBase.localeCompare(second.routeBase))
}
