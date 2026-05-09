import type { PayloadMarkdownDocsCollectionSlugs, PayloadMarkdownDocsReadPayload } from './types.js'

import {
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
} from '../constants.js'
import { deriveDocsSetRouteBase, joinRouteSegments } from '../routing/index.js'
import {
  getRelationshipId,
  isRecord,
  isVisibleDocsSet,
  toResolvedDocsGroup,
  toResolvedDocsSet,
} from './records.js'

export type PayloadMarkdownDocsLink = {
  label: string
  url: string
}

export type PayloadMarkdownDocsNavItemType = 'docsGroup' | 'docsSet'

export type PayloadMarkdownDocsNavItem = {
  children?: PayloadMarkdownDocsNavItem[]
  collection: string
  id: string
  label: string
  order: number
  route: string
  type: PayloadMarkdownDocsNavItemType
  url?: string
}

export type PayloadMarkdownDocsNavCapacityOptions = {
  availableSlots?: number
  existingItemsCount?: number
  maxItems?: number
}

export type GetPayloadMarkdownDocsNavItemsOptions = {
  collections?: Pick<PayloadMarkdownDocsCollectionSlugs, 'docsGroups' | 'docsSets'>
  fetchLimit?: number
  includeDrafts?: boolean
  overrideAccess?: boolean
  payload: PayloadMarkdownDocsReadPayload
} & PayloadMarkdownDocsNavCapacityOptions

export type GetPayloadMarkdownDocsLinksOptions = {
  collections?: Pick<PayloadMarkdownDocsCollectionSlugs, 'docsGroups' | 'docsSets'>
  includeDrafts?: boolean
  overrideAccess?: boolean
  payload: PayloadMarkdownDocsReadPayload
}

export type PayloadMarkdownDocsHeaderNavLink =
  | {
      label: string
      newTab?: false
      reference: {
        relationTo: string
        value: string
      }
      type: 'reference'
    }
  | {
      label: string
      newTab?: false
      type: 'custom'
      url: string
    }

export type PayloadMarkdownDocsHeaderNavItem = {
  childItems?: PayloadMarkdownDocsHeaderNavItem[]
  link: PayloadMarkdownDocsHeaderNavLink
  subItems?: PayloadMarkdownDocsHeaderNavItem[]
}

export type GetPayloadMarkdownDocsHeaderNavItemsOptions = {
  existingItems?: unknown[]
  mode?: 'relationship' | 'url'
} & GetPayloadMarkdownDocsNavItemsOptions

export type AppendPayloadMarkdownDocsHeaderNavItemsOptions<TExistingItem> = {
  existingItems: TExistingItem[]
} & GetPayloadMarkdownDocsHeaderNavItemsOptions

const getAvailableSlots = ({
  availableSlots,
  existingItemsCount = 0,
  maxItems,
}: PayloadMarkdownDocsNavCapacityOptions): number | undefined => {
  if (availableSlots !== undefined) {
    return Math.max(0, availableSlots)
  }

  if (maxItems === undefined) {
    return undefined
  }

  return Math.max(0, maxItems - existingItemsCount)
}

const applyTopLevelCapacity = (
  items: PayloadMarkdownDocsNavItem[],
  options: PayloadMarkdownDocsNavCapacityOptions,
): PayloadMarkdownDocsNavItem[] => {
  const availableSlots = getAvailableSlots(options)

  return availableSlots === undefined ? items : items.slice(0, availableSlots)
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

const sortByOrderThenLabel = <T extends { label: string; order: number }>(items: T[]): T[] =>
  [...items].sort((first, second) => {
    if (first.order !== second.order) {
      return first.order - second.order
    }

    return first.label.localeCompare(second.label)
  })

const getFirstLinkableUrl = (item: PayloadMarkdownDocsNavItem): string | undefined => {
  if (item.url) {
    return item.url
  }

  for (const child of item.children ?? []) {
    const url = getFirstLinkableUrl(child)

    if (url) {
      return url
    }
  }

  return undefined
}

export const getPayloadMarkdownDocsNavItems = async ({
  collections,
  fetchLimit = 1000,
  includeDrafts = false,
  overrideAccess = true,
  payload,
  ...capacityOptions
}: GetPayloadMarkdownDocsNavItemsOptions): Promise<PayloadMarkdownDocsNavItem[]> => {
  const docsGroupsCollectionSlug = collections?.docsGroups ?? DEFAULT_DOCS_GROUPS_COLLECTION_SLUG
  const docsSetsCollectionSlug = collections?.docsSets ?? DEFAULT_DOCS_SETS_COLLECTION_SLUG
  const [docsSetsResult, docsGroupsResult] = await Promise.all([
    payload.find({
      collection: docsSetsCollectionSlug,
      depth: 0,
      draft: includeDrafts,
      limit: fetchLimit,
      overrideAccess,
    }),
    payload.find({
      collection: docsGroupsCollectionSlug,
      depth: 0,
      limit: fetchLimit,
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
  const childGroupIdsByParentId = new Map<string, string[]>()
  const topLevelGroupIds: string[] = []

  for (const [groupId, group] of groupsById) {
    const parentId = getRelationshipId(group.parent)

    if (parentId) {
      childGroupIdsByParentId.set(parentId, [
        ...(childGroupIdsByParentId.get(parentId) ?? []),
        groupId,
      ])
    } else {
      topLevelGroupIds.push(groupId)
    }
  }

  const docsSetItemsByGroupId = new Map<string, PayloadMarkdownDocsNavItem[]>()
  const topLevelDocsSetItems: PayloadMarkdownDocsNavItem[] = []

  for (const doc of docsSetsResult.docs) {
    const docsSet = toResolvedDocsSet(doc)

    if (!docsSet?.slug || !isRecord(doc) || !isVisibleDocsSet({ docsSet, includeDrafts })) {
      continue
    }

    const groupId = getRelationshipId(doc.group)
    const groupRoutePath = groupId
      ? getGroupRoutePath({
          groupId,
          groupsById,
        })
      : undefined

    if (groupId && !groupRoutePath) {
      continue
    }

    const item: PayloadMarkdownDocsNavItem = {
      id: docsSet.id,
      type: 'docsSet',
      collection: docsSetsCollectionSlug,
      label: docsSet.navTitle ?? docsSet.title,
      order: docsSet.order,
      route: deriveDocsSetRouteBase({
        docsSetSlug: docsSet.slug,
        groupRoutePath,
      }),
      url: deriveDocsSetRouteBase({
        docsSetSlug: docsSet.slug,
        groupRoutePath,
      }),
    }

    if (groupId) {
      docsSetItemsByGroupId.set(groupId, [...(docsSetItemsByGroupId.get(groupId) ?? []), item])
    } else {
      topLevelDocsSetItems.push(item)
    }
  }

  const buildGroupItem = (
    groupId: string,
    seen = new Set<string>(),
  ): PayloadMarkdownDocsNavItem | undefined => {
    if (seen.has(groupId)) {
      return undefined
    }

    const doc = groupsById.get(groupId)
    const group = toResolvedDocsGroup(doc)
    const routePath = getGroupRoutePath({
      groupId,
      groupsById,
    })

    if (!group || !routePath) {
      return undefined
    }

    const nextSeen = new Set([groupId, ...seen])
    const childGroups = (childGroupIdsByParentId.get(groupId) ?? []).flatMap((childGroupId) => {
      const item = buildGroupItem(childGroupId, nextSeen)

      return item ? [item] : []
    })
    const childDocsSets = docsSetItemsByGroupId.get(groupId) ?? []
    const children = sortByOrderThenLabel([...childGroups, ...childDocsSets])

    return {
      ...(children.length > 0 ? { children } : {}),
      id: group.id,
      type: 'docsGroup',
      collection: docsGroupsCollectionSlug,
      label: group.navTitle ?? group.title,
      order: group.order,
      route: routePath,
      ...(group.serveIndex ? { url: routePath } : {}),
    }
  }

  return applyTopLevelCapacity(
    sortByOrderThenLabel([
      ...topLevelGroupIds.flatMap((groupId) => {
        const item = buildGroupItem(groupId)

        return item ? [item] : []
      }),
      ...topLevelDocsSetItems,
    ]),
    capacityOptions,
  )
}

export const getPayloadMarkdownDocsLinks = async ({
  collections,
  includeDrafts = false,
  overrideAccess = true,
  payload,
}: GetPayloadMarkdownDocsLinksOptions): Promise<PayloadMarkdownDocsLink[]> => {
  const docsGroupsCollectionSlug = collections?.docsGroups ?? DEFAULT_DOCS_GROUPS_COLLECTION_SLUG
  const docsSetsCollectionSlug = collections?.docsSets ?? DEFAULT_DOCS_SETS_COLLECTION_SLUG
  const [docsSetsResult, docsGroupsResult] = await Promise.all([
    payload.find({
      collection: docsSetsCollectionSlug,
      depth: 0,
      draft: includeDrafts,
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

      if (!docsSet?.slug || !isRecord(doc) || !isVisibleDocsSet({ docsSet, includeDrafts })) {
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

const toHeaderLink = ({
  item,
  mode,
}: {
  item: PayloadMarkdownDocsNavItem
  mode: 'relationship' | 'url'
}): PayloadMarkdownDocsHeaderNavLink | undefined => {
  if (mode === 'relationship') {
    return {
      type: 'reference',
      label: item.label,
      reference: {
        relationTo: item.collection,
        value: item.id,
      },
    }
  }

  const url = getFirstLinkableUrl(item)

  return url
    ? {
        type: 'custom',
        label: item.label,
        url,
      }
    : undefined
}

const toHeaderNavItem = (
  item: PayloadMarkdownDocsNavItem,
  mode: 'relationship' | 'url',
  depth = 0,
): PayloadMarkdownDocsHeaderNavItem | undefined => {
  const link = toHeaderLink({
    item,
    mode,
  })

  if (!link) {
    return undefined
  }

  const children = (item.children ?? []).flatMap((child) => {
    const childItem = toHeaderNavItem(child, mode, depth + 1)

    return childItem ? [childItem] : []
  })

  return {
    link,
    ...(children.length > 0
      ? depth === 0
        ? { subItems: children }
        : { childItems: children }
      : {}),
  }
}

export const getPayloadMarkdownDocsHeaderNavItems = async ({
  existingItems,
  existingItemsCount = existingItems?.length ?? 0,
  mode = 'url',
  ...options
}: GetPayloadMarkdownDocsHeaderNavItemsOptions): Promise<PayloadMarkdownDocsHeaderNavItem[]> => {
  const items = await getPayloadMarkdownDocsNavItems({
    ...options,
    existingItemsCount,
  })

  return items.flatMap((item) => {
    const headerItem = toHeaderNavItem(item, mode)

    return headerItem ? [headerItem] : []
  })
}

export const appendPayloadMarkdownDocsHeaderNavItems = async <TExistingItem>({
  existingItems,
  ...options
}: AppendPayloadMarkdownDocsHeaderNavItemsOptions<TExistingItem>): Promise<
  (PayloadMarkdownDocsHeaderNavItem | TExistingItem)[]
> => [
  ...existingItems,
  ...(await getPayloadMarkdownDocsHeaderNavItems({
    ...options,
    existingItems,
  })),
]
