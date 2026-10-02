import type {
  PayloadMarkdownDocsDefaults,
  PayloadMarkdownDocsGroupPageMode,
  PayloadMarkdownDocsHeroImage,
  PayloadMarkdownDocsOpenGraph,
  PayloadMarkdownDocsOpenGraphImage,
  PayloadMarkdownDocsOverrides,
  PayloadMarkdownDocsRouteMode,
  ResolvedPayloadMarkdownDocsGroup,
  ResolvedPayloadMarkdownDocsRecord,
  ResolvedPayloadMarkdownDocsSet,
} from './types.js'

import {
  type DocsGroupsById,
  getDocsGroupRoutePath,
  resolveDocsSetRoutes,
} from '../routing/docsSetRoutes.js'
import { normalizeRoutePath } from '../routing/index.js'
import { getRecordId, getRelationshipId, isRecord } from '../shared/records.js'

const getOptionalString = (doc: Record<string, unknown>, key: string): string | undefined =>
  typeof doc[key] === 'string' ? doc[key] : undefined

const getOptionalNumber = (doc: Record<string, unknown>, key: string): number | undefined =>
  typeof doc[key] === 'number' ? doc[key] : undefined

const getOptionalBoolean = (doc: Record<string, unknown>, key: string): boolean | undefined =>
  typeof doc[key] === 'boolean' ? doc[key] : undefined

const getOptionalStringArray = (
  doc: Record<string, unknown>,
  key: string,
): string[] | undefined => {
  const value = doc[key]

  if (!Array.isArray(value)) {
    return undefined
  }

  const items = value.flatMap((item) =>
    typeof item === 'string' && item.trim() !== '' ? [item.trim()] : [],
  )

  return items.length > 0 ? items : undefined
}

const cleanObject = <T extends Record<string, unknown>>(input: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null),
  ) as Partial<T>

const toDefaults = (value: unknown): PayloadMarkdownDocsDefaults | undefined => {
  if (!isRecord(value)) {
    return undefined
  }

  const sidebarMode: PayloadMarkdownDocsDefaults['sidebarMode'] =
    value.sidebarMode === 'auto' || value.sidebarMode === 'hidden' || value.sidebarMode === 'manual'
      ? value.sidebarMode
      : undefined
  const defaults = cleanObject({
    sidebarMode,
  } satisfies PayloadMarkdownDocsDefaults)

  return Object.keys(defaults).length > 0 ? (defaults as PayloadMarkdownDocsDefaults) : undefined
}

const toOverrides = (value: unknown): PayloadMarkdownDocsOverrides | undefined => {
  if (!isRecord(value)) {
    return undefined
  }

  const overrides = cleanObject({
    hideFromNav: getOptionalBoolean(value, 'hideFromNav'),
    navTitle: getOptionalString(value, 'navTitle'),
  })

  return Object.keys(overrides).length > 0 ? overrides : undefined
}

const toMediaImage = (value: unknown): PayloadMarkdownDocsHeroImage | undefined => {
  const media = isRecord(value) && isRecord(value.value) ? value.value : value

  if (!isRecord(media)) {
    return undefined
  }

  const url = getOptionalString(media, 'url')

  if (!url) {
    return undefined
  }

  return cleanObject({
    id: getRecordId(media),
    alt: getOptionalString(media, 'alt'),
    height: getOptionalNumber(media, 'height'),
    relationTo: isRecord(value) ? getOptionalString(value, 'relationTo') : undefined,
    url,
    width: getOptionalNumber(media, 'width'),
  }) as PayloadMarkdownDocsHeroImage
}

const toHeroImage = (value: unknown): PayloadMarkdownDocsHeroImage | undefined =>
  toMediaImage(value)

const toOpenGraphImage = (value: unknown): PayloadMarkdownDocsOpenGraphImage | undefined =>
  toMediaImage(value) as PayloadMarkdownDocsOpenGraphImage | undefined

const toOpenGraph = (value: unknown): PayloadMarkdownDocsOpenGraph | undefined => {
  if (!isRecord(value)) {
    return undefined
  }

  const openGraph = cleanObject({
    description: getOptionalString(value, 'description'),
    image: toOpenGraphImage(value.image),
    title: getOptionalString(value, 'title'),
  } satisfies PayloadMarkdownDocsOpenGraph)

  return Object.keys(openGraph).length > 0 ? (openGraph as PayloadMarkdownDocsOpenGraph) : undefined
}

const getPageMode = (pageMode: unknown): PayloadMarkdownDocsGroupPageMode =>
  pageMode === 'custom' ? 'custom' : 'auto'

const NO_GROUPS: DocsGroupsById = new Map()

/**
 * Public projection of a raw docs set record. Routes come from the shared derivation in
 * routing/docsSetRoutes (the same one the sync endpoint validates against); pass the
 * docs groups so grouped docs sets get their group route.
 */
export const toResolvedDocsSet = (
  doc: unknown,
  groupsById: DocsGroupsById = NO_GROUPS,
): ResolvedPayloadMarkdownDocsSet | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  const id = getRecordId(doc)
  const title = getOptionalString(doc, 'title')
  const slug = getOptionalString(doc, 'slug')
  const routes = resolveDocsSetRoutes({ doc, groupsById })

  if (!id || !title || !slug || !routes) {
    return undefined
  }

  const { productRoute, routeBase, routeMode } = routes

  return {
    id,
    slug,
    defaults: toDefaults(doc.defaults),
    description: getOptionalString(doc, 'description'),
    navTitle: getOptionalString(doc, 'navTitle'),
    openGraph: toOpenGraph(doc.meta) ?? toOpenGraph(doc.openGraph),
    order: getOptionalNumber(doc, 'order') ?? 0,
    productRoute,
    routeBase,
    routeMode: routeMode satisfies PayloadMarkdownDocsRouteMode,
    status: doc._status === 'draft' || doc._status === 'published' ? doc._status : undefined,
    title,
  }
}

export const isVisibleDocsSet = ({
  docsSet,
  includeDrafts = false,
}: {
  docsSet: ResolvedPayloadMarkdownDocsSet
  includeDrafts?: boolean
}): boolean => !(!includeDrafts && docsSet.status === 'draft')

/** Public projection of a raw docs group; undefined when the group has no route. */
export const toResolvedDocsGroup = (
  doc: unknown,
  groupsById: DocsGroupsById,
): ResolvedPayloadMarkdownDocsGroup | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  const id = getRecordId(doc)
  const title = getOptionalString(doc, 'title')
  const slug = getOptionalString(doc, 'slug')
  const routePath = id ? getDocsGroupRoutePath({ group: id, groupsById }) : undefined

  if (!id || !title || !slug || !routePath) {
    return undefined
  }

  const pageMode = getPageMode(doc.pageMode)

  return {
    id,
    slug,
    description: getOptionalString(doc, 'description'),
    navTitle: getOptionalString(doc, 'navTitle'),
    order: getOptionalNumber(doc, 'order') ?? 0,
    pageMode,
    routePath,
    title,
  }
}

export const toResolvedDocsRecord = ({
  doc,
  markdownField,
}: {
  doc: unknown
  markdownField: string
}): ResolvedPayloadMarkdownDocsRecord | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  const id = getRecordId(doc)
  const route = getOptionalString(doc, 'route')
  const sourcePath = getOptionalString(doc, 'sourcePath')
  const title = getOptionalString(doc, 'title')

  if (!id || !route || !sourcePath || !title) {
    return undefined
  }

  const sync = isRecord(doc.sync) ? doc.sync : undefined
  const status = doc._status === 'draft' || doc._status === 'published' ? doc._status : undefined

  return {
    id,
    archived: getOptionalBoolean(sync ?? {}, 'archived') ?? false,
    content: typeof doc[markdownField] === 'string' ? doc[markdownField] : undefined,
    dependencies: getOptionalStringArray(doc, 'dependencies'),
    depth: getOptionalNumber(doc, 'depth') ?? 0,
    description: getOptionalString(doc, 'description'),
    docsSetId: getRelationshipId(doc.docsSet),
    heroImage: toHeroImage(doc.heroImage),
    navTitle: getOptionalString(doc, 'navTitle'),
    order: getOptionalNumber(doc, 'order') ?? 0,
    overrides: toOverrides(doc.overrides),
    route: normalizeRoutePath(route),
    sourceHash: getOptionalString(doc, 'sourceHash'),
    sourcePath,
    status,
    title,
  }
}

export const isVisibleDocsRecord = ({
  includeDrafts = false,
  record,
}: {
  includeDrafts?: boolean
  record: ResolvedPayloadMarkdownDocsRecord
}): boolean => {
  if (record.archived) {
    return false
  }

  return !(!includeDrafts && record.status === 'draft')
}
