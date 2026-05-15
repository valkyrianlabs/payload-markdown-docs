import type {
  DocsSetManagerData,
  DocsSetManagerDocItem,
  DocsSetManagerPayloadOperations,
  DocsSetManagerWarning,
  RawDocsGroupRecord,
  RawDocsRecord,
  RawDocsSetRecord,
} from './docsSetManagerTypes.js'

import {
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
} from '../constants.js'
import {
  deriveDocsSetRouteBase,
  joinRouteSegments,
} from '../routing/index.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getRecordId = (doc: unknown): string | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  if (typeof doc.id === 'string' || typeof doc.id === 'number') {
    return String(doc.id)
  }

  return undefined
}

const getRelationshipId = (value: unknown): string | undefined => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  return getRecordId(value)
}

const normalizeAdminRoute = (adminRoute = '/admin'): string => {
  const trimmed = adminRoute.trim()

  if (!trimmed || trimmed === '/') {
    return '/admin'
  }

  return `/${trimmed}`.replace(/\/+/g, '/').replace(/\/+$/g, '')
}

export const getGeneratedDocAdminURL = ({
  id,
  adminRoute,
  docsCollectionSlug,
}: {
  adminRoute?: string
  docsCollectionSlug: string
  id: string
}): string =>
  `${normalizeAdminRoute(adminRoute)}/collections/${docsCollectionSlug}/${encodeURIComponent(id)}`

const hasText = (value: null | string | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0

const getOverrideSummary = (overrides: RawDocsRecord['overrides']): string[] => {
  if (!overrides || !isRecord(overrides)) {
    return []
  }

  const summary: string[] = []

  if (hasText(overrides.navTitle)) {
    summary.push('Nav title override')
  }

  if (overrides.hideFromNav === true) {
    summary.push('Hidden from nav')
  }

  return summary
}

const getDocStatus = (
  doc: RawDocsRecord,
): DocsSetManagerDocItem['status'] => {
  if (doc.sync?.archived === true) {
    return 'archived'
  }

  if (doc._status === 'draft') {
    return 'draft'
  }

  if (doc._status === 'published') {
    return 'published'
  }

  return 'synced'
}

const getSourcePathSegments = (sourcePath: string): string[] => {
  const withoutExtension = sourcePath.replace(/\.md$/i, '')
  const segments = withoutExtension.split('/').filter(Boolean)

  if (segments.at(-1) === 'index') {
    return segments.slice(0, -1)
  }

  return segments
}

const getGroupRoutePath = ({
  groupId,
  groupsById,
  seen = new Set<string>(),
}: {
  groupId?: string
  groupsById: Map<string, RawDocsGroupRecord>
  seen?: Set<string>
}): string | undefined => {
  if (!groupId || seen.has(groupId)) {
    return undefined
  }

  const group = groupsById.get(groupId)

  if (!group?.slug) {
    return undefined
  }

  return joinRouteSegments(
    getGroupRoutePath({
      groupId: getRelationshipId(group.parent),
      groupsById,
      seen: new Set([groupId, ...seen]),
    }),
    group.slug,
  )
}

const getDocsSetRouteBase = ({
  docsGroups,
  docsSet,
}: {
  docsGroups: RawDocsGroupRecord[]
  docsSet: RawDocsSetRecord
}): string => {
  if (!docsSet.slug) {
    return ''
  }

  const groupsById = new Map(
    docsGroups.flatMap((group) => {
      const id = getRecordId(group)

      return id ? [[id, group]] : []
    }),
  )

  return deriveDocsSetRouteBase({
    docsSetSlug: docsSet.slug,
    groupRoutePath: getGroupRoutePath({
      groupId: getRelationshipId(docsSet.group),
      groupsById,
    }),
    routeMode: docsSet.routeMode,
  })
}

const titleCaseSegment = (segment: string): string =>
  segment
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')

const compareDocItems = (
  first: DocsSetManagerDocItem,
  second: DocsSetManagerDocItem,
): number => {
  if (first.order !== second.order) {
    return first.order - second.order
  }

  if (first.sourcePath !== second.sourcePath) {
    return first.sourcePath.localeCompare(second.sourcePath)
  }

  return first.route.localeCompare(second.route)
}

const getOrCreateFolder = ({
  items,
  order,
  segment,
  sourcePath,
}: {
  items: DocsSetManagerDocItem[]
  order: number
  segment: string
  sourcePath: string
}): DocsSetManagerDocItem => {
  const existing = items.find(
    (item) => item.kind === 'folder' && item.sourcePath === sourcePath,
  )

  if (existing) {
    existing.order = Math.min(existing.order, order)
    return existing
  }

  const folder: DocsSetManagerDocItem = {
    id: `folder:${sourcePath}`,
    children: [],
    kind: 'folder',
    order,
    overrideSummary: [],
    route: '',
    sourcePath,
    status: 'synced',
    title: titleCaseSegment(segment),
  }

  items.push(folder)

  return folder
}

const insertIntoTree = ({
  item,
  tree,
}: {
  item: DocsSetManagerDocItem
  tree: DocsSetManagerDocItem[]
}) => {
  const segments = getSourcePathSegments(item.sourcePath)

  if (segments.length <= 1) {
    tree.push(item)
    return
  }

  let currentItems = tree

  for (const [index, segment] of segments.slice(0, -1).entries()) {
    const sourcePath = segments.slice(0, index + 1).join('/')
    const folder = getOrCreateFolder({
      items: currentItems,
      order: item.order,
      segment,
      sourcePath,
    })

    folder.children ??= []
    currentItems = folder.children
  }

  currentItems.push(item)
}

const sortTree = (items: DocsSetManagerDocItem[]) => {
  items.sort(compareDocItems)

  for (const item of items) {
    if (item.children) {
      sortTree(item.children)
    }
  }
}

const toDocItem = ({
  adminRoute,
  doc,
  docsCollectionSlug,
  index,
  warnings,
}: {
  adminRoute?: string
  doc: RawDocsRecord
  docsCollectionSlug: string
  index: number
  warnings: DocsSetManagerWarning[]
}): DocsSetManagerDocItem => {
  const id = getRecordId(doc) ?? `unknown-${index}`
  const route = hasText(doc.route) ? doc.route : ''
  const sourcePath = hasText(doc.sourcePath)
    ? doc.sourcePath
    : `missing-source-path-${id}`
  const title = hasText(doc.title) ? doc.title : sourcePath
  const status = getDocStatus(doc)
  const overrideSummary = getOverrideSummary(doc.overrides)

  if (!hasText(doc.route)) {
    warnings.push({
      docId: id,
      message: 'Generated doc is missing a route.',
      sourcePath,
    })
  }

  if (!hasText(doc.sourcePath)) {
    warnings.push({
      docId: id,
      message: 'Generated doc is missing a source path.',
    })
  }

  if (!hasText(doc.title)) {
    warnings.push({
      docId: id,
      message: 'Generated doc is missing a title.',
      sourcePath,
    })
  }

  return {
    id,
    ...(adminRoute
      ? {
          adminURL: getGeneratedDocAdminURL({
            id,
            adminRoute,
            docsCollectionSlug,
          }),
        }
      : {}),
    archived: status === 'archived',
    draft: status === 'draft',
    hiddenFromNav: doc.overrides?.hideFromNav === true,
    kind: 'doc',
    order: typeof doc.order === 'number' ? doc.order : 0,
    overrideSummary,
    published: status === 'published',
    route,
    sourcePath,
    status,
    title,
  }
}

export const buildDocsSetManagerData = ({
  adminRoute,
  docs,
  docsCollectionSlug = DEFAULT_DOCS_COLLECTION_SLUG,
  docsGroups = [],
  docsSet,
}: {
  adminRoute?: string
  docs: RawDocsRecord[]
  docsCollectionSlug?: string
  docsGroups?: RawDocsGroupRecord[]
  docsSet: RawDocsSetRecord
}): DocsSetManagerData => {
  const warnings: DocsSetManagerWarning[] = []
  const docsSetId = getRecordId(docsSet) ?? 'unknown'
  const sortedDocs = docs
    .map((doc, index) =>
      toDocItem({
        adminRoute,
        doc,
        docsCollectionSlug,
        index,
        warnings,
      }),
    )
    .sort(compareDocItems)
  const tree: DocsSetManagerDocItem[] = []

  for (const item of sortedDocs) {
    insertIntoTree({
      item,
      tree,
    })
  }

  sortTree(tree)

  return {
    docs: sortedDocs,
    docsSet: {
      id: docsSetId,
      slug: docsSet.slug ?? '',
      routeBase: getDocsSetRouteBase({
        docsGroups,
        docsSet,
      }),
      title: docsSet.title ?? docsSetId,
    },
    summary: {
      archived: sortedDocs.filter((doc) => doc.archived).length,
      drafts: sortedDocs.filter((doc) => doc.draft).length,
      hiddenFromNav: sortedDocs.filter((doc) => doc.hiddenFromNav).length,
      published: sortedDocs.filter((doc) => doc.published).length,
      total: sortedDocs.length,
      withOverrides: sortedDocs.filter((doc) => doc.overrideSummary.length > 0)
        .length,
    },
    sync: docsSet.sync
      ? {
          docsCount:
            typeof docsSet.sync.docsCount === 'number'
              ? docsSet.sync.docsCount
              : undefined,
          lastStatus: docsSet.sync.lastStatus ?? undefined,
          lastSyncedAt: docsSet.sync.lastSyncedAt ?? undefined,
        }
      : undefined,
    tree,
    warnings,
  }
}

export const isDocsRecordForDocsSet = ({
  doc,
  docsSetId,
}: {
  doc: RawDocsRecord
  docsSetId: string
}): boolean => {
  const docDocsSetId = getRelationshipId(doc.docsSet)

  return docDocsSetId === docsSetId
}

export const getDocsSetManagerData = async ({
  adminRoute,
  docsCollectionSlug = DEFAULT_DOCS_COLLECTION_SLUG,
  docsGroupsCollectionSlug = DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  docsSetId,
  docsSetsCollectionSlug = DEFAULT_DOCS_SETS_COLLECTION_SLUG,
  overrideAccess = true,
  payload,
}: {
  adminRoute?: string
  docsCollectionSlug?: string
  docsGroupsCollectionSlug?: string
  docsSetId: string
  docsSetsCollectionSlug?: string
  overrideAccess?: boolean
  payload: DocsSetManagerPayloadOperations
}): Promise<DocsSetManagerData> => {
  const docsSet = (await payload.findByID({
    id: docsSetId,
    collection: docsSetsCollectionSlug,
    depth: 0,
    overrideAccess,
  })) as RawDocsSetRecord

  const docsResult = await payload.find({
    collection: docsCollectionSlug,
    depth: 0,
    limit: 1000,
    overrideAccess,
    where: {
      docsSet: {
        equals: docsSetId,
      },
    },
  })
  const docsGroupsResult = await payload.find({
    collection: docsGroupsCollectionSlug,
    depth: 0,
    limit: 1000,
    overrideAccess,
  })
  const docs = docsResult.docs
    .filter(isRecord)
    .map((doc) => doc as RawDocsRecord)
    .filter((doc) =>
      isDocsRecordForDocsSet({
        doc,
        docsSetId,
      }),
    )

  return buildDocsSetManagerData({
    adminRoute,
    docs,
    docsCollectionSlug,
    docsGroups: docsGroupsResult.docs
      .filter(isRecord)
      .map((group) => group as RawDocsGroupRecord),
    docsSet,
  })
}
