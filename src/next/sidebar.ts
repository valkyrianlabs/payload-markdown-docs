import type {
  PayloadMarkdownDocsCollectionSlugs,
  PayloadMarkdownDocsReadPayload,
  PayloadMarkdownDocsSidebarItem,
  ResolvedPayloadMarkdownDocsRecord,
  ResolvedPayloadMarkdownDocsSet,
} from './types.js'

import {
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_MARKDOWN_FIELD_NAME,
} from '../constants.js'
import { joinRouteSegments } from '../routing/index.js'
import {
  isVisibleDocsRecord,
  toResolvedDocsRecord,
} from './records.js'

export type BuildPayloadMarkdownDocsSidebarOptions = {
  docsSet?: ResolvedPayloadMarkdownDocsSet
  includeDrafts?: boolean
}

export type GetPayloadMarkdownDocsSidebarOptions = {
  collections?: PayloadMarkdownDocsCollectionSlugs
  docsSet: ResolvedPayloadMarkdownDocsSet
  includeDrafts?: boolean
  markdownField?: string
  overrideAccess?: boolean
  payload: PayloadMarkdownDocsReadPayload
}

const titleCaseSegment = (segment: string): string =>
  segment
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')

const getSidebarLabel = (record: ResolvedPayloadMarkdownDocsRecord): string =>
  record.overrides?.navTitle ?? record.navTitle ?? record.title ?? record.sourcePath

const getSourcePathSegments = (sourcePath: string): string[] => {
  const withoutExtension = sourcePath.replace(/\.md$/i, '')
  const segments = withoutExtension.split('/').filter(Boolean)

  if (segments.at(-1) === 'index') {
    return segments.slice(0, -1)
  }

  return segments
}

const compareSidebarItems = (
  first: PayloadMarkdownDocsSidebarItem,
  second: PayloadMarkdownDocsSidebarItem,
): number => {
  if (first.order !== second.order) {
    return first.order - second.order
  }

  return first.sourcePath.localeCompare(second.sourcePath)
}

const sortSidebarTree = (items: PayloadMarkdownDocsSidebarItem[]) => {
  items.sort(compareSidebarItems)

  for (const item of items) {
    if (item.children) {
      sortSidebarTree(item.children)
    }
  }
}

const getOrCreateFolderNode = ({
  currentItems,
  depth,
  docsSet,
  order,
  segment,
  sourcePath,
}: {
  currentItems: PayloadMarkdownDocsSidebarItem[]
  depth: number
  docsSet?: ResolvedPayloadMarkdownDocsSet
  order: number
  segment: string
  sourcePath: string
}): PayloadMarkdownDocsSidebarItem => {
  const existing = currentItems.find((item) => item.sourcePath === sourcePath)

  if (existing) {
    existing.order = Math.min(existing.order, order)
    return existing
  }

  const node: PayloadMarkdownDocsSidebarItem = {
    children: [],
    depth,
    label: titleCaseSegment(segment),
    order,
    route: docsSet ? joinRouteSegments(docsSet.routeBase, sourcePath) : `/${sourcePath}`,
    sourcePath,
  }

  currentItems.push(node)

  return node
}

const mergeLeafIntoTree = ({
  docsSet,
  record,
  rootItems,
}: {
  docsSet?: ResolvedPayloadMarkdownDocsSet
  record: ResolvedPayloadMarkdownDocsRecord
  rootItems: PayloadMarkdownDocsSidebarItem[]
}) => {
  const segments = getSourcePathSegments(record.sourcePath)

  if (segments.length === 0) {
    rootItems.push({
      depth: 0,
      label: getSidebarLabel(record),
      order: record.order,
      route: record.route,
      sourcePath: record.sourcePath,
    })
    return
  }

  let currentItems = rootItems

  for (const [index, segment] of segments.entries()) {
    const sourcePath = segments.slice(0, index + 1).join('/')
    const isLeaf = index === segments.length - 1

    if (isLeaf) {
      const existing = currentItems.find((item) => item.sourcePath === sourcePath)

      if (existing) {
        existing.label = getSidebarLabel(record)
        existing.order = record.order
        existing.route = record.route
        existing.sourcePath = record.sourcePath
        existing.children ??= []
        return
      }

      currentItems.push({
        depth: index,
        label: getSidebarLabel(record),
        order: record.order,
        route: record.route,
        sourcePath: record.sourcePath,
      })
      return
    }

    const folder = getOrCreateFolderNode({
      currentItems,
      depth: index,
      docsSet,
      order: record.order,
      segment,
      sourcePath,
    })

    folder.children ??= []
    currentItems = folder.children
  }
}

export const buildPayloadMarkdownDocsSidebar = (
  records: ResolvedPayloadMarkdownDocsRecord[],
  options: BuildPayloadMarkdownDocsSidebarOptions = {},
): PayloadMarkdownDocsSidebarItem[] => {
  const sidebar: PayloadMarkdownDocsSidebarItem[] = []
  const visibleRecords = records
    .filter((record) =>
      isVisibleDocsRecord({
        includeDrafts: options.includeDrafts,
        record,
      }),
    )
    .filter((record) => record.overrides?.hideFromNav !== true)
    .sort((first, second) => {
      if (first.order !== second.order) {
        return first.order - second.order
      }

      return first.sourcePath.localeCompare(second.sourcePath)
    })

  for (const record of visibleRecords) {
    mergeLeafIntoTree({
      docsSet: options.docsSet,
      record,
      rootItems: sidebar,
    })
  }

  sortSidebarTree(sidebar)

  return sidebar
}

export const getPayloadMarkdownDocsSidebar = async ({
  collections,
  docsSet,
  includeDrafts = false,
  markdownField = DEFAULT_MARKDOWN_FIELD_NAME,
  overrideAccess = false,
  payload,
}: GetPayloadMarkdownDocsSidebarOptions): Promise<PayloadMarkdownDocsSidebarItem[]> => {
  const result = await payload.find({
    collection: collections?.docs ?? DEFAULT_DOCS_COLLECTION_SLUG,
    depth: 0,
    limit: 1000,
    overrideAccess,
    where: {
      docsSet: {
        equals: docsSet.id,
      },
    },
  })

  const records = result.docs
    .map((doc) =>
      toResolvedDocsRecord({
        doc,
        markdownField,
      }),
    )
    .filter(
      (record): record is ResolvedPayloadMarkdownDocsRecord => record !== undefined,
    )

  return buildPayloadMarkdownDocsSidebar(records, {
    docsSet,
    includeDrafts,
  })
}
