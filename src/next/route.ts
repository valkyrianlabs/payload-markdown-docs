import type {
  PayloadMarkdownDocsCollectionSlugs,
  PayloadMarkdownDocsReadPayload,
  ResolvedPayloadMarkdownDocsRecord,
  ResolvedPayloadMarkdownDocsRoute,
  ResolvedPayloadMarkdownDocsSet,
  ResolvePayloadMarkdownDocsRouteOptions,
} from './types.js'

import {
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
  DEFAULT_MARKDOWN_FIELD_NAME,
} from '../constants.js'
import {
  deriveDocsSetRouteBase,
  isRouteDescendant,
  joinRouteSegments,
  normalizeRoutePath,
} from '../routing/index.js'
import {
  getRelationshipId,
  isRecord,
  isVisibleDocsRecord,
  isVisibleDocsSet,
  toResolvedDocsGroup,
  toResolvedDocsRecord,
  toResolvedDocsSet,
} from './records.js'
import { getPayloadMarkdownDocsSidebar } from './sidebar.js'

type ResolvedCollectionSlugs = {
  docs: string
  docsGroups: string
  docsSets: string
}

const resolveCollectionSlugs = (
  collections?: PayloadMarkdownDocsCollectionSlugs,
): ResolvedCollectionSlugs => ({
  docs: collections?.docs ?? DEFAULT_DOCS_COLLECTION_SLUG,
  docsGroups: collections?.docsGroups ?? DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  docsSets: collections?.docsSets ?? DEFAULT_DOCS_SETS_COLLECTION_SLUG,
})

export const getPayloadMarkdownDocsRoutePath = ({
  slug,
  path,
}: {
  path?: string
  slug?: string | string[]
}): string => {
  if (path !== undefined) {
    return normalizeRoutePath(path)
  }

  if (Array.isArray(slug)) {
    return slug.length === 0 ? '/' : joinRouteSegments(...slug)
  }

  if (typeof slug === 'string') {
    return normalizeRoutePath(slug)
  }

  return '/'
}

const getGroupsById = async ({
  collections,
  overrideAccess,
  payload,
}: {
  collections: ResolvedCollectionSlugs
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
}): Promise<Map<string, unknown>> => {
  const result = await payload.find({
    collection: collections.docsGroups,
    depth: 0,
    limit: 1000,
    overrideAccess,
  })

  return new Map(
    result.docs.flatMap((doc) => {
      if (!isRecord(doc)) {
        return []
      }

      const id = getRelationshipId(doc)

      return id ? [[id, doc]] : []
    }),
  )
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

  const slug = typeof group.slug === 'string' ? group.slug : undefined

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

const withComputedDocsSetRoute = ({
  doc,
  docsSet,
  groupsById,
}: {
  doc?: unknown
  docsSet?: ResolvedPayloadMarkdownDocsSet
  groupsById: Map<string, unknown>
}): ResolvedPayloadMarkdownDocsSet | undefined => {
  if (!docsSet?.slug) {
    return docsSet
  }

  const groupId = isRecord(doc) ? getRelationshipId(doc.group) : undefined
  const groupRoutePath = getGroupRoutePath({
    groupId,
    groupsById,
  })

  return {
    ...docsSet,
    routeBase: deriveDocsSetRouteBase({
      docsSetSlug: docsSet.slug,
      groupRoutePath,
    }),
  }
}

const findDocsSetById = async ({
  id,
  collections,
  includeDrafts,
  overrideAccess,
  payload,
}: {
  collections: ResolvedCollectionSlugs
  id: string
  includeDrafts: boolean
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
}): Promise<ResolvedPayloadMarkdownDocsSet | undefined> => {
  const [result, groupsById] = await Promise.all([
    payload.find({
      collection: collections.docsSets,
      depth: 0,
      draft: includeDrafts,
      limit: 1,
      overrideAccess,
      where: {
        id: {
          equals: id,
        },
      },
    }),
    getGroupsById({
      collections,
      overrideAccess,
      payload,
    }),
  ])

  const docsSet = withComputedDocsSetRoute({
    doc: result.docs[0],
    docsSet: toResolvedDocsSet(result.docs[0]),
    groupsById,
  })

  return docsSet && isVisibleDocsSet({ docsSet, includeDrafts }) ? docsSet : undefined
}

const findDocsSetByRouteBase = async ({
  collections,
  includeDrafts,
  overrideAccess,
  payload,
  route,
}: {
  collections: ResolvedCollectionSlugs
  includeDrafts: boolean
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
  route: string
}): Promise<ResolvedPayloadMarkdownDocsSet | undefined> => {
  const [result, groupsById] = await Promise.all([
    payload.find({
      collection: collections.docsSets,
      depth: 0,
      draft: includeDrafts,
      limit: 1000,
      overrideAccess,
    }),
    getGroupsById({
      collections,
      overrideAccess,
      payload,
    }),
  ])

  return result.docs
    .map((doc) =>
      withComputedDocsSetRoute({
        doc,
        docsSet: toResolvedDocsSet(doc),
        groupsById,
      }),
    )
    .filter(
      (docsSet): docsSet is ResolvedPayloadMarkdownDocsSet =>
        docsSet !== undefined && isVisibleDocsSet({ docsSet, includeDrafts }),
    )
    .find((docsSet) => docsSet?.routeBase === route)
}

const findDocsSetByRoutePrefix = async ({
  collections,
  includeDrafts,
  overrideAccess,
  payload,
  route,
}: {
  collections: ResolvedCollectionSlugs
  includeDrafts: boolean
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
  route: string
}): Promise<ResolvedPayloadMarkdownDocsSet | undefined> => {
  const [result, groupsById] = await Promise.all([
    payload.find({
      collection: collections.docsSets,
      depth: 0,
      draft: includeDrafts,
      limit: 1000,
      overrideAccess,
    }),
    getGroupsById({
      collections,
      overrideAccess,
      payload,
    }),
  ])

  return result.docs
    .map((doc) =>
      withComputedDocsSetRoute({
        doc,
        docsSet: toResolvedDocsSet(doc),
        groupsById,
      }),
    )
    .filter((docsSet): docsSet is ResolvedPayloadMarkdownDocsSet => {
      if (!docsSet) {
        return false
      }

      if (!isVisibleDocsSet({ docsSet, includeDrafts })) {
        return false
      }

      return docsSet.routeBase === route || isRouteDescendant(docsSet.routeBase, route)
    })
    .sort((first, second) => second.routeBase.length - first.routeBase.length)[0]
}

const getRelatedDocsSet = (doc: unknown): ResolvedPayloadMarkdownDocsSet | undefined => {
  if (!isRecord(doc) || !isRecord(doc.docsSet)) {
    return undefined
  }

  return toResolvedDocsSet(doc.docsSet)
}

const findDocsSetForRecord = async ({
  collections,
  doc,
  includeDrafts,
  overrideAccess,
  payload,
  record,
}: {
  collections: ResolvedCollectionSlugs
  doc: unknown
  includeDrafts: boolean
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
  record: ResolvedPayloadMarkdownDocsRecord
}): Promise<ResolvedPayloadMarkdownDocsSet | undefined> => {
  if (record.docsSetId) {
    return findDocsSetById({
      id: record.docsSetId,
      collections,
      includeDrafts,
      overrideAccess,
      payload,
    })
  }

  const relatedDocsSet = getRelatedDocsSet(doc)

  if (relatedDocsSet && isVisibleDocsSet({ docsSet: relatedDocsSet, includeDrafts })) {
    return relatedDocsSet
  }

  return findDocsSetByRoutePrefix({
    collections,
    includeDrafts,
    overrideAccess,
    payload,
    route: record.route,
  })
}

const findDocsRecordByRoute = async ({
  collections,
  includeDrafts,
  markdownField,
  overrideAccess,
  payload,
  route,
}: {
  collections: ResolvedCollectionSlugs
  includeDrafts: boolean
  markdownField: string
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
  route: string
}): Promise<
  | {
      doc: unknown
      record: ResolvedPayloadMarkdownDocsRecord
    }
  | undefined
> => {
  const result = await payload.find({
    collection: collections.docs,
    depth: 1,
    draft: includeDrafts,
    limit: 5,
    overrideAccess,
    where: {
      route: {
        equals: route,
      },
    },
  })

  for (const doc of result.docs) {
    const record = toResolvedDocsRecord({
      doc,
      markdownField,
    })

    if (
      record &&
      record.route === route &&
      isVisibleDocsRecord({
        includeDrafts,
        record,
      })
    ) {
      return {
        doc,
        record,
      }
    }
  }

  return undefined
}

const findDocsSetIndexRecord = async ({
  collections,
  docsSet,
  includeDrafts,
  markdownField,
  overrideAccess,
  payload,
}: {
  collections: ResolvedCollectionSlugs
  docsSet: ResolvedPayloadMarkdownDocsSet
  includeDrafts: boolean
  markdownField: string
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
}): Promise<ResolvedPayloadMarkdownDocsRecord | undefined> => {
  const result = await findDocsRecordByRoute({
    collections,
    includeDrafts,
    markdownField,
    overrideAccess,
    payload,
    route: docsSet.routeBase,
  })

  if (!result) {
    return undefined
  }

  if (result.record.docsSetId && result.record.docsSetId !== docsSet.id) {
    return undefined
  }

  if (isRecord(result.doc)) {
    const relatedDocsSetId = getRelationshipId(result.doc.docsSet)

    if (relatedDocsSetId && relatedDocsSetId !== docsSet.id) {
      return undefined
    }
  }

  return result.record
}

const findGroupIndexRoute = async ({
  collections,
  includeDrafts,
  overrideAccess,
  payload,
  route,
}: {
  collections: ResolvedCollectionSlugs
  includeDrafts: boolean
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
  route: string
}): Promise<ResolvedPayloadMarkdownDocsRoute | undefined> => {
  const groupsById = await getGroupsById({
    collections,
    overrideAccess,
    payload,
  })
  const group = [...groupsById.entries()]
    .map(([groupId, doc]) => {
      const resolved = toResolvedDocsGroup(doc)
      const routePath = getGroupRoutePath({
        groupId,
        groupsById,
      })

      return resolved && routePath
        ? {
            ...resolved,
            routePath,
          }
        : undefined
    })
    .find((candidate) => candidate?.routePath === route && candidate.serveIndex)

  if (!group) {
    return undefined
  }

  const docsSetsResult = await payload.find({
    collection: collections.docsSets,
    depth: 0,
    draft: includeDrafts,
    limit: 1000,
    overrideAccess,
  })
  const docsSets = docsSetsResult.docs
    .filter((doc) => isRecord(doc) && getRelationshipId(doc.group) === group.id)
    .map((doc) =>
      withComputedDocsSetRoute({
        doc,
        docsSet: toResolvedDocsSet(doc),
        groupsById,
      }),
    )
    .filter((docsSet): docsSet is ResolvedPayloadMarkdownDocsSet => docsSet !== undefined)
    .filter((docsSet) => isVisibleDocsSet({ docsSet, includeDrafts }))
    .sort((first, second) => {
      if (first.order !== second.order) {
        return first.order - second.order
      }

      return first.routeBase.localeCompare(second.routeBase)
    })

  return {
    type: 'docsGroupIndex',
    docsSets,
    group,
    route,
  }
}

export const resolvePayloadMarkdownDocsRoute = async ({
  slug,
  collections: collectionOptions,
  includeDrafts = false,
  markdownField = DEFAULT_MARKDOWN_FIELD_NAME,
  // Route adapter reads plugin-owned generated docs collections server-side.
  // Access is overridden here, then public visibility is enforced explicitly.
  overrideAccess = true,
  path,
  payload,
}: ResolvePayloadMarkdownDocsRouteOptions): Promise<null | ResolvedPayloadMarkdownDocsRoute> => {
  const route = getPayloadMarkdownDocsRoutePath({
    slug,
    path,
  })
  const collections = resolveCollectionSlugs(collectionOptions)
  const docsSet = await findDocsSetByRouteBase({
    collections,
    includeDrafts,
    overrideAccess,
    payload,
    route,
  })

  if (docsSet) {
    const [doc, sidebar] = await Promise.all([
      findDocsSetIndexRecord({
        collections,
        docsSet,
        includeDrafts,
        markdownField,
        overrideAccess,
        payload,
      }),
      getPayloadMarkdownDocsSidebar({
        collections: collectionOptions,
        docsSet,
        includeDrafts,
        markdownField,
        overrideAccess,
        payload,
      }),
    ])

    return {
      ...(doc ? { doc } : {}),
      type: 'docsSetIndex',
      docsSet,
      route,
      sidebar,
    }
  }

  const docResult = await findDocsRecordByRoute({
    collections,
    includeDrafts,
    markdownField,
    overrideAccess,
    payload,
    route,
  })

  if (docResult) {
    const resolvedDocsSet = await findDocsSetForRecord({
      collections,
      doc: docResult.doc,
      includeDrafts,
      overrideAccess,
      payload,
      record: docResult.record,
    })

    if (resolvedDocsSet) {
      const sidebar = await getPayloadMarkdownDocsSidebar({
        collections: collectionOptions,
        docsSet: resolvedDocsSet,
        includeDrafts,
        markdownField,
        overrideAccess,
        payload,
      })

      return {
        type: 'doc',
        doc: docResult.record,
        docsSet: resolvedDocsSet,
        route,
        sidebar,
      }
    }
  }

  const groupRoute = await findGroupIndexRoute({
    collections,
    includeDrafts,
    overrideAccess,
    payload,
    route,
  })

  return groupRoute ?? null
}
