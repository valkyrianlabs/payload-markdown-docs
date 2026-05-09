import type {
  PayloadMarkdownDocsDefaults,
  PayloadMarkdownDocsHeroImage,
  PayloadMarkdownDocsOverrides,
  ResolvedPayloadMarkdownDocsGroup,
  ResolvedPayloadMarkdownDocsRecord,
  ResolvedPayloadMarkdownDocsSet,
} from './types.js'

import { deriveDocsSetRouteBase, normalizeRoutePath } from '../routing/index.js'
import { isAiMarkdownExportManifestPath, validateDocsAiExportManifest } from '../sync/index.js'

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const getRecordId = (doc: Record<string, unknown>): string | undefined => {
  if (typeof doc.id === 'string' || typeof doc.id === 'number') {
    return String(doc.id)
  }

  return undefined
}

export const getRelationshipId = (value: unknown): string | undefined => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  if (isRecord(value)) {
    return getRecordId(value)
  }

  return undefined
}

const getOptionalString = (doc: Record<string, unknown>, key: string): string | undefined =>
  typeof doc[key] === 'string' ? doc[key] : undefined

const getOptionalNumber = (doc: Record<string, unknown>, key: string): number | undefined =>
  typeof doc[key] === 'number' ? doc[key] : undefined

const getOptionalBoolean = (doc: Record<string, unknown>, key: string): boolean | undefined =>
  typeof doc[key] === 'boolean' ? doc[key] : undefined

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

const toHeroImage = (value: unknown): PayloadMarkdownDocsHeroImage | undefined => {
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

export const toResolvedDocsSet = (doc: unknown): ResolvedPayloadMarkdownDocsSet | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  const id = getRecordId(doc)
  const routeBase = getOptionalString(doc, 'routeBase')
  const title = getOptionalString(doc, 'title')
  const slug = getOptionalString(doc, 'slug')

  if (!id || !title || (!routeBase && !slug)) {
    return undefined
  }

  const aiExportValidation =
    doc.aiExport === undefined || doc.aiExport === null
      ? undefined
      : validateDocsAiExportManifest(doc.aiExport)

  return {
    ...(aiExportValidation?.ok ? { aiExport: aiExportValidation.manifest } : {}),
    id,
    slug,
    defaults: toDefaults(doc.defaults),
    description: getOptionalString(doc, 'description'),
    navTitle: getOptionalString(doc, 'navTitle'),
    order: getOptionalNumber(doc, 'order') ?? 0,
    routeBase: normalizeRoutePath(
      routeBase ??
        deriveDocsSetRouteBase({
          docsSetSlug: slug ?? id,
        }),
    ),
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
}): boolean => {
  if (!includeDrafts && docsSet.status === 'draft') {
    return false
  }

  return true
}

export const toResolvedDocsGroup = (doc: unknown): ResolvedPayloadMarkdownDocsGroup | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  const id = getRecordId(doc)
  const routePath = getOptionalString(doc, 'routePath')
  const title = getOptionalString(doc, 'title')
  const slug = getOptionalString(doc, 'slug')

  if (!id || !title || (!routePath && !slug)) {
    return undefined
  }

  return {
    id,
    slug,
    description: getOptionalString(doc, 'description'),
    navTitle: getOptionalString(doc, 'navTitle'),
    order: getOptionalNumber(doc, 'order') ?? 0,
    routePath: normalizeRoutePath(routePath ?? `/${slug}`),
    serveIndex: getOptionalBoolean(doc, 'serveIndex') ?? false,
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

  if (isAiMarkdownExportManifestPath(record.sourcePath)) {
    return false
  }

  if (!includeDrafts && record.status === 'draft') {
    return false
  }

  return true
}
