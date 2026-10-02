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
import { type DocsGroupsById, indexDocsGroupsById } from '../routing/docsSetRoutes.js'
import { isRouteDescendant, joinRouteSegments, normalizeRoutePath } from '../routing/index.js'
import { getRelationshipId, isRecord } from '../shared/records.js'
import {
  isVisibleDocsRecord,
  isVisibleDocsSet,
  toResolvedDocsGroup,
  toResolvedDocsRecord,
  toResolvedDocsSet,
} from './records.js'
import { getPayloadMarkdownDocsSidebar } from './sidebar.js'

type ResolvedCollectionSlugs = Required<
  Pick<PayloadMarkdownDocsCollectionSlugs, 'docs' | 'docsGroups' | 'docsSets'>
>

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
  path?: string | string[]
  slug?: string | string[]
}): string => {
  if (Array.isArray(path)) {
    return path.length === 0 ? '/' : joinRouteSegments(...path)
  }

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

type DocsSetCandidate = {
  doc: unknown
  docsSet: ResolvedPayloadMarkdownDocsSet
}

/**
 * Per-request docs set reads for the route adapter. Docs sets and groups are each
 * loaded at most once per resolution and resolved through the shared route derivation
 * (routing/docsSetRoutes) and visibility rules.
 */
type DocsSetLookup = {
  findById: (id: string) => Promise<ResolvedPayloadMarkdownDocsSet | undefined>
  groupsById: () => Promise<DocsGroupsById>
  /** Visible docs sets in query order, with their raw records. */
  visible: () => Promise<DocsSetCandidate[]>
}

const createDocsSetLookup = ({
  collections,
  includeDrafts,
  overrideAccess,
  payload,
}: {
  collections: ResolvedCollectionSlugs
  includeDrafts: boolean
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
}): DocsSetLookup => {
  let groups: Promise<DocsGroupsById> | undefined
  let visible: Promise<DocsSetCandidate[]> | undefined

  const groupsById = (): Promise<DocsGroupsById> =>
    (groups ??= payload
      .find({
        collection: collections.docsGroups,
        depth: 0,
        limit: 1000,
        overrideAccess,
      })
      .then((result) => indexDocsGroupsById(result.docs)))

  const toVisibleDocsSet = (
    doc: unknown,
    groupsById: DocsGroupsById,
  ): ResolvedPayloadMarkdownDocsSet | undefined => {
    const docsSet = toResolvedDocsSet(doc, groupsById)

    return docsSet && isVisibleDocsSet({ docsSet, includeDrafts }) ? docsSet : undefined
  }

  return {
    findById: async (id) => {
      const [result, groups] = await Promise.all([
        payload.find({
          collection: collections.docsSets,
          depth: 1,
          draft: includeDrafts,
          limit: 1,
          overrideAccess,
          where: {
            id: {
              equals: id,
            },
          },
        }),
        groupsById(),
      ])

      return toVisibleDocsSet(result.docs[0], groups)
    },
    groupsById,
    visible: () =>
      (visible ??= Promise.all([
        payload.find({
          collection: collections.docsSets,
          depth: 1,
          draft: includeDrafts,
          limit: 1000,
          overrideAccess,
        }),
        groupsById(),
      ]).then(([result, groups]) =>
        result.docs.flatMap((doc) => {
          const docsSet = toVisibleDocsSet(doc, groups)

          return docsSet ? [{ doc, docsSet }] : []
        }),
      )),
  }
}

const findDocsSetByRouteBase = async (
  lookup: DocsSetLookup,
  route: string,
): Promise<ResolvedPayloadMarkdownDocsSet | undefined> =>
  (await lookup.visible()).find(({ docsSet }) => docsSet.routeBase === route)?.docsSet

const findDocsSetByRoutePrefix = async (
  lookup: DocsSetLookup,
  route: string,
): Promise<ResolvedPayloadMarkdownDocsSet | undefined> =>
  (await lookup.visible())
    .map(({ docsSet }) => docsSet)
    .filter(
      (docsSet) => docsSet.routeBase === route || isRouteDescendant(docsSet.routeBase, route),
    )
    .sort((first, second) => second.routeBase.length - first.routeBase.length)[0]

type ProductNestedRouteAlias = {
  docsSet: ResolvedPayloadMarkdownDocsSet
  route: string
}

const normalizeProductNestedAliasSuffix = (suffix: string): string => {
  const segments = suffix
    .split('/')
    .map((segment) => segment.trim().replace(/\.md$/i, ''))
    .filter(Boolean)

  if (segments.at(-1)?.toLowerCase() === 'index') {
    segments.pop()
  }

  return segments.join('/')
}

const getProductNestedAliasSuffix = ({
  docsSet,
  route,
}: {
  docsSet: ResolvedPayloadMarkdownDocsSet
  route: string
}): string | undefined => {
  if (docsSet.routeMode !== 'product-nested') {
    return undefined
  }

  if (route === docsSet.productRoute) {
    return undefined
  }

  if (route === docsSet.routeBase || isRouteDescendant(docsSet.routeBase, route)) {
    return undefined
  }

  if (!isRouteDescendant(docsSet.productRoute, route)) {
    return undefined
  }

  return normalizeProductNestedAliasSuffix(route.slice(docsSet.productRoute.length + 1))
}

const findProductNestedRouteAliases = async (
  lookup: DocsSetLookup,
  route: string,
): Promise<ProductNestedRouteAlias[]> =>
  (await lookup.visible())
    .map(({ docsSet }) => docsSet)
    .filter(
      (docsSet) =>
        getProductNestedAliasSuffix({
          docsSet,
          route,
        }) !== undefined,
    )
    .sort((first, second) => second.productRoute.length - first.productRoute.length)
    .map((docsSet) => ({
      docsSet,
      route: joinRouteSegments(
        docsSet.routeBase,
        getProductNestedAliasSuffix({
          docsSet,
          route,
        }),
      ),
    }))

const findDocsSetForRecord = async ({
  lookup,
  record,
}: {
  lookup: DocsSetLookup
  record: ResolvedPayloadMarkdownDocsRecord
}): Promise<ResolvedPayloadMarkdownDocsSet | undefined> =>
  record.docsSetId
    ? lookup.findById(record.docsSetId)
    : findDocsSetByRoutePrefix(lookup, record.route)

const docsRecordBelongsToDocsSet = ({
  doc,
  docsSet,
  record,
}: {
  doc: unknown
  docsSet: ResolvedPayloadMarkdownDocsSet
  record: ResolvedPayloadMarkdownDocsRecord
}): boolean => {
  if (record.docsSetId && record.docsSetId !== docsSet.id) {
    return false
  }

  if (isRecord(doc)) {
    const relatedDocsSetId = getRelationshipId(doc.docsSet)

    if (relatedDocsSetId && relatedDocsSetId !== docsSet.id) {
      return false
    }
  }

  return true
}

const isProductNestedProductRoute = ({
  docsSet,
  route,
}: {
  docsSet: ResolvedPayloadMarkdownDocsSet
  route: string
}): boolean => docsSet.routeMode === 'product-nested' && route === docsSet.productRoute

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

  return docsRecordBelongsToDocsSet({
    doc: result.doc,
    docsSet,
    record: result.record,
  })
    ? result.record
    : undefined
}

const compareByOrderThenNavTitle = (
  first: { navTitle?: string; order: number; title: string },
  second: { navTitle?: string; order: number; title: string },
): number => {
  if (first.order !== second.order) {
    return first.order - second.order
  }

  return (first.navTitle ?? first.title).localeCompare(second.navTitle ?? second.title)
}

const findGroupIndexRoute = async (
  lookup: DocsSetLookup,
  route: string,
): Promise<ResolvedPayloadMarkdownDocsRoute | undefined> => {
  const groupsById = await lookup.groupsById()
  const group = [...groupsById.values()]
    .map((doc) => toResolvedDocsGroup(doc, groupsById))
    .find((candidate) => candidate?.routePath === route && candidate.pageMode === 'auto')

  if (!group) {
    return undefined
  }

  const childGroups = [...groupsById.values()]
    .filter((doc) => getRelationshipId(doc.parent) === group.id)
    .flatMap((doc) => {
      const resolved = toResolvedDocsGroup(doc, groupsById)

      return resolved ? [resolved] : []
    })
    .sort(compareByOrderThenNavTitle)
  const docsSets = (await lookup.visible())
    .filter(({ doc }) => isRecord(doc) && getRelationshipId(doc.group) === group.id)
    .map(({ docsSet }) => docsSet)
    .sort(compareByOrderThenNavTitle)

  return {
    type: 'docsGroupIndex',
    childGroups,
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
  const lookup = createDocsSetLookup({
    collections,
    includeDrafts,
    overrideAccess,
    payload,
  })
  const docsSet = await findDocsSetByRouteBase(lookup, route)

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
      lookup,
      record: docResult.record,
    })

    if (resolvedDocsSet) {
      if (
        isProductNestedProductRoute({
          docsSet: resolvedDocsSet,
          route,
        })
      ) {
        return null
      }

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

  const productNestedAliases = await findProductNestedRouteAliases(lookup, route)

  for (const alias of productNestedAliases) {
    if (alias.route === alias.docsSet.routeBase) {
      const [doc, sidebar] = await Promise.all([
        findDocsSetIndexRecord({
          collections,
          docsSet: alias.docsSet,
          includeDrafts,
          markdownField,
          overrideAccess,
          payload,
        }),
        getPayloadMarkdownDocsSidebar({
          collections: collectionOptions,
          docsSet: alias.docsSet,
          includeDrafts,
          markdownField,
          overrideAccess,
          payload,
        }),
      ])

      return {
        ...(doc ? { doc } : {}),
        type: 'docsSetIndex',
        docsSet: alias.docsSet,
        route: alias.route,
        sidebar,
      }
    }

    const aliasDocResult = await findDocsRecordByRoute({
      collections,
      includeDrafts,
      markdownField,
      overrideAccess,
      payload,
      route: alias.route,
    })

    if (
      aliasDocResult &&
      docsRecordBelongsToDocsSet({
        doc: aliasDocResult.doc,
        docsSet: alias.docsSet,
        record: aliasDocResult.record,
      })
    ) {
      const sidebar = await getPayloadMarkdownDocsSidebar({
        collections: collectionOptions,
        docsSet: alias.docsSet,
        includeDrafts,
        markdownField,
        overrideAccess,
        payload,
      })

      return {
        type: 'doc',
        doc: aliasDocResult.record,
        docsSet: alias.docsSet,
        route: alias.route,
        sidebar,
      }
    }
  }

  const groupRoute = await findGroupIndexRoute(lookup, route)

  return groupRoute ?? null
}
