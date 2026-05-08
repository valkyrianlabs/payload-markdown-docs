import type { PayloadMarkdownDocsAuthToggle } from '../types.js'

import {
  deriveDocsSetRouteBase,
  joinRouteSegments,
  normalizeRoutePath,
} from '../routing/index.js'

export type DocsSetPayloadOperations = {
  find: (args: {
    collection: string
    depth?: number
    limit?: number
    overrideAccess?: boolean
    where?: unknown
  }) => Promise<{
    docs: unknown[]
  }>
  update?: (args: {
    collection: string
    data: Record<string, unknown>
    id: string
    overrideAccess?: boolean
  }) => Promise<Record<string, unknown>>
}

export type PayloadRecordId = number | string

export type ResolvedDocsGroup = {
  id: PayloadRecordId
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
  groupId?: string
  id: PayloadRecordId
  routeBase: string
  slug: string
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
  aiExport,
  collectionSlug,
  docsCount,
  docsSetId,
  now,
  payload,
  syncRunId,
}: {
  aiExport?: unknown
  collectionSlug: string
  docsCount: number
  docsSetId: PayloadRecordId
  now: Date
  payload: DocsSetPayloadOperations
  syncRunId?: PayloadRecordId
}): Promise<void> => {
  if (!payload.update) {
    return
  }

  await payload.update({
    id: String(docsSetId),
    collection: collectionSlug,
    data: {
      aiExport: aiExport ?? null,
      sync: {
        docsCount,
        lastStatus: 'success',
        lastSyncedAt: now.toISOString(),
        lastSyncRunId: syncRunId,
      },
    },
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
  const advancedSecurity = isRecord(doc.advancedSecurity)
    ? doc.advancedSecurity
    : undefined
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
    branch: getString(doc.branch) ?? 'main',
    groupId,
    routeBase: normalizeRoutePath(
      deriveDocsSetRouteBase({
        docsSetSlug: slug,
        groupRoutePath: group?.routePath,
      }),
    ),
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
  payload,
}: {
  collectionSlug: string
  docsGroupsCollectionSlug: string
  payload: DocsSetPayloadOperations
  slug: string
}): Promise<ResolvedDocsSet | undefined> => {
  const [result, groupsById] = await Promise.all([
    payload.find({
      collection: collectionSlug,
      depth: 0,
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
