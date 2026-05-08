import type {
  PayloadMarkdownDocsCollectionSlugs,
  PayloadMarkdownDocsReadPayload,
} from './types.js'

import {
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
} from '../constants.js'
import { deriveDocsSetRouteBase, joinRouteSegments } from '../routing/index.js'
import {
  getRelationshipId,
  isRecord,
  toResolvedDocsSet,
} from './records.js'

export type PayloadMarkdownDocsLink = {
  label: string
  url: string
}

export type GetPayloadMarkdownDocsLinksOptions = {
  collections?: Pick<PayloadMarkdownDocsCollectionSlugs, 'docsGroups' | 'docsSets'>
  overrideAccess?: boolean
  payload: PayloadMarkdownDocsReadPayload
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

  if (!isRecord(group) || typeof group.slug !== 'string') {
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

export const getPayloadMarkdownDocsLinks = async ({
  collections,
  overrideAccess = true,
  payload,
}: GetPayloadMarkdownDocsLinksOptions): Promise<PayloadMarkdownDocsLink[]> => {
  const docsGroupsCollectionSlug =
    collections?.docsGroups ?? DEFAULT_DOCS_GROUPS_COLLECTION_SLUG
  const docsSetsCollectionSlug =
    collections?.docsSets ?? DEFAULT_DOCS_SETS_COLLECTION_SLUG
  const [docsSetsResult, docsGroupsResult] = await Promise.all([
    payload.find({
      collection: docsSetsCollectionSlug,
      depth: 0,
      limit: 1000,
      overrideAccess,
    }),
    payload.find({
      collection: docsGroupsCollectionSlug,
      depth: 0,
      limit: 1000,
      overrideAccess,
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

  return docsSetsResult.docs
    .flatMap((doc) => {
      const docsSet = toResolvedDocsSet(doc)

      if (!docsSet?.slug || !isRecord(doc)) {
        return []
      }

      return [
        {
          label: docsSet.navTitle ?? docsSet.title,
          order: docsSet.order,
          url: deriveDocsSetRouteBase({
            docsSetSlug: docsSet.slug,
            groupRoutePath: getGroupRoutePath({
              groupId: getRelationshipId(doc.group),
              groupsById,
            }),
          }),
        },
      ]
    })
    .sort((first, second) => {
      if (first.order !== second.order) {
        return first.order - second.order
      }

      return first.label.localeCompare(second.label)
    })
    .map(({ label, url }) => ({
      label,
      url,
    }))
}
