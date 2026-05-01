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
  isRouteDescendant,
  joinRouteSegments,
  normalizeRoutePath,
} from '../routing/index.js'
import {
  getRelationshipId,
  isRecord,
  isVisibleDocsRecord,
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

const findDocsSetById = async ({
  id,
  collections,
  overrideAccess,
  payload,
}: {
  collections: ResolvedCollectionSlugs
  id: string
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
}): Promise<ResolvedPayloadMarkdownDocsSet | undefined> => {
  const result = await payload.find({
    collection: collections.docsSets,
    depth: 0,
    limit: 1,
    overrideAccess,
    where: {
      id: {
        equals: id,
      },
    },
  })

  return toResolvedDocsSet(result.docs[0])
}

const findDocsSetByRouteBase = async ({
  collections,
  overrideAccess,
  payload,
  route,
}: {
  collections: ResolvedCollectionSlugs
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
  route: string
}): Promise<ResolvedPayloadMarkdownDocsSet | undefined> => {
  const result = await payload.find({
    collection: collections.docsSets,
    depth: 0,
    limit: 1,
    overrideAccess,
    where: {
      routeBase: {
        equals: route,
      },
    },
  })

  return result.docs
    .map(toResolvedDocsSet)
    .find((docsSet) => docsSet?.routeBase === route)
}

const findDocsSetByRoutePrefix = async ({
  collections,
  overrideAccess,
  payload,
  route,
}: {
  collections: ResolvedCollectionSlugs
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
  route: string
}): Promise<ResolvedPayloadMarkdownDocsSet | undefined> => {
  const result = await payload.find({
    collection: collections.docsSets,
    depth: 0,
    limit: 1000,
    overrideAccess,
  })

  return result.docs
    .map(toResolvedDocsSet)
    .filter((docsSet): docsSet is ResolvedPayloadMarkdownDocsSet => {
      if (!docsSet) {
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
  overrideAccess,
  payload,
  record,
}: {
  collections: ResolvedCollectionSlugs
  doc: unknown
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
  record: ResolvedPayloadMarkdownDocsRecord
}): Promise<ResolvedPayloadMarkdownDocsSet | undefined> => {
  const relatedDocsSet = getRelatedDocsSet(doc)

  if (relatedDocsSet) {
    return relatedDocsSet
  }

  if (record.docsSetId) {
    const docsSetById = await findDocsSetById({
      id: record.docsSetId,
      collections,
      overrideAccess,
      payload,
    })

    if (docsSetById) {
      return docsSetById
    }
  }

  return findDocsSetByRoutePrefix({
    collections,
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
  overrideAccess,
  payload,
  route,
}: {
  collections: ResolvedCollectionSlugs
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
  route: string
}): Promise<ResolvedPayloadMarkdownDocsRoute | undefined> => {
  const result = await payload.find({
    collection: collections.docsGroups,
    depth: 0,
    limit: 5,
    overrideAccess,
    where: {
      routePath: {
        equals: route,
      },
    },
  })
  const group = result.docs
    .map(toResolvedDocsGroup)
    .find((candidate) => candidate?.routePath === route && candidate.serveIndex)

  if (!group) {
    return undefined
  }

  const docsSetsResult = await payload.find({
    collection: collections.docsSets,
    depth: 0,
    limit: 1000,
    overrideAccess,
    where: {
      group: {
        equals: group.id,
      },
    },
  })
  const docsSets = docsSetsResult.docs
    .map(toResolvedDocsSet)
    .filter((docsSet): docsSet is ResolvedPayloadMarkdownDocsSet => docsSet !== undefined)
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
  overrideAccess = false,
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
    overrideAccess,
    payload,
    route,
  })

  return groupRoute ?? null
}
