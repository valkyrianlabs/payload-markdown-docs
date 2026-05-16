import type {
  PayloadMarkdownDocsCollectionSlugs,
  PayloadMarkdownDocsReadPayload,
  PayloadMarkdownDocsSidebarItem,
  ResolvedPayloadMarkdownDocsRecord,
  ResolvedPayloadMarkdownDocsSet,
} from './types.js'

import { DEFAULT_DOCS_COLLECTION_SLUG, DEFAULT_MARKDOWN_FIELD_NAME } from '../constants.js'
import { isVisibleDocsRecord, toResolvedDocsRecord } from './records.js'

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

  if (segments.at(-1)?.toLowerCase() === 'index') {
    return segments.slice(0, -1)
  }

  return segments
}

const getSidebarPath = (segments: string[]): string => segments.join('/')

const getFolderPaths = (records: ResolvedPayloadMarkdownDocsRecord[]): Set<string> => {
  const folderPaths = new Set<string>()

  for (const record of records) {
    const segments = getSourcePathSegments(record.sourcePath)

    for (let index = 1; index < segments.length; index += 1) {
      folderPaths.add(getSidebarPath(segments.slice(0, index)))
    }
  }

  return folderPaths
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
  order,
  segment,
  sourcePath,
}: {
  currentItems: PayloadMarkdownDocsSidebarItem[]
  depth: number
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
    sourcePath,
  }

  currentItems.push(node)

  return node
}

const mergeLeafIntoTree = ({
  folderPaths,
  record,
  rootItems,
}: {
  folderPaths: Set<string>
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
    const sourcePath = getSidebarPath(segments.slice(0, index + 1))
    const isLeaf = index === segments.length - 1

    if (isLeaf) {
      const existing = currentItems.find((item) => item.sourcePath === sourcePath)
      const itemSourcePath = folderPaths.has(sourcePath) ? sourcePath : record.sourcePath

      if (existing) {
        existing.label = getSidebarLabel(record)
        existing.order = record.order
        existing.route = record.route
        existing.sourcePath = itemSourcePath
        existing.children ??= []
        return
      }

      currentItems.push({
        depth: index,
        label: getSidebarLabel(record),
        order: record.order,
        route: record.route,
        sourcePath: itemSourcePath,
      })
      return
    }

    const folder = getOrCreateFolderNode({
      currentItems,
      depth: index,
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
  const folderPaths = getFolderPaths(visibleRecords)

  for (const record of visibleRecords) {
    mergeLeafIntoTree({
      folderPaths,
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
  // Sidebar data reads plugin-owned generated docs server-side.
  // Access is overridden here, then nav visibility is enforced explicitly.
  overrideAccess = true,
  payload,
}: GetPayloadMarkdownDocsSidebarOptions): Promise<PayloadMarkdownDocsSidebarItem[]> => {
  const result = await payload.find({
    collection: collections?.docs ?? DEFAULT_DOCS_COLLECTION_SLUG,
    depth: 0,
    draft: includeDrafts,
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
    .filter((record): record is ResolvedPayloadMarkdownDocsRecord => record !== undefined)

  return buildPayloadMarkdownDocsSidebar(records, {
    docsSet,
    includeDrafts,
  })
}
