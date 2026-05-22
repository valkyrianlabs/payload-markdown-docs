import type {
  DocsGroupReference,
  DocsPageReference,
  DocsRelationship,
  DocsRelationshipID,
  DocsSetReference,
} from '../marketing/types.js'

import {
  DEFAULT_DOCS_SET_ROUTE_MODE,
  deriveDocsSetProductRoutePath,
  deriveDocsSetRouteBase,
  type DocsSetRouteMode,
  joinRouteSegments,
  normalizeRoutePath,
} from '../routing/index.js'

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

export const getNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

export const getBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined

export const getRecordString = (
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined => (record ? getString(record[key]) : undefined)

export const getRelationshipValue = (value: unknown): unknown =>
  isRecord(value) && 'value' in value ? value.value : value

export const getRelationshipId = (value: unknown): string | undefined => {
  const record = getRelationshipValue(value)

  if (typeof record === 'string' || typeof record === 'number') {
    return String(record)
  }

  if (!isRecord(record)) {
    return undefined
  }

  if (typeof record.id === 'string' || typeof record.id === 'number') {
    return String(record.id)
  }

  return undefined
}

export const getText = (value: null | string | undefined): string | undefined => {
  const trimmed = value?.trim()

  return trimmed ? trimmed : undefined
}

export const getDocsRelationshipValue = <TRecord>(
  value: DocsRelationship<TRecord> | null | undefined,
): DocsRelationshipID | TRecord | undefined => {
  if (value === null || value === undefined) {
    return undefined
  }

  if (typeof value === 'object' && 'value' in value) {
    return value.value
  }

  return value
}

export const getDocsRelationshipRecord = <TRecord extends object>(
  value: DocsRelationship<TRecord> | null | undefined,
): TRecord | undefined => {
  const relationshipValue = getDocsRelationshipValue(value)

  return typeof relationshipValue === 'object' ? relationshipValue : undefined
}

export const getDocsRelationshipId = <TRecord extends { id?: DocsRelationshipID }>(
  value: DocsRelationship<TRecord> | null | undefined,
): string | undefined => {
  const relationshipValue = getDocsRelationshipValue(value)

  if (typeof relationshipValue === 'string' || typeof relationshipValue === 'number') {
    return String(relationshipValue)
  }

  return relationshipValue?.id === undefined ? undefined : String(relationshipValue.id)
}

export const getDocsSetTitle = (
  value: DocsRelationship<DocsSetReference> | null | undefined,
): string | undefined => {
  const record = getDocsRelationshipRecord(value)

  return getText(record?.navTitle) ?? getText(record?.title) ?? getText(record?.label)
}

export const getDocsPageTitle = (
  value: DocsRelationship<DocsPageReference> | null | undefined,
): string | undefined => {
  const record = getDocsRelationshipRecord(value)

  return getText(record?.navTitle) ?? getText(record?.title) ?? getText(record?.label)
}

export const getDocsSetDescription = (
  value: DocsRelationship<DocsSetReference> | null | undefined,
): string | undefined => getText(getDocsRelationshipRecord(value)?.description)

export const getDocsPageDescription = (
  value: DocsRelationship<DocsPageReference> | null | undefined,
): string | undefined => {
  const record = getDocsRelationshipRecord(value)

  return getText(record?.description) ?? getText(record?.excerpt)
}

const getDocsSetRouteMode = (value: unknown): DocsSetRouteMode =>
  value === 'product-nested' || value === 'docs-root'
    ? value
    : DEFAULT_DOCS_SET_ROUTE_MODE

const getTypedDocsSetRouteMode = (
  value: DocsSetReference['routeMode'],
): DocsSetRouteMode => value ?? DEFAULT_DOCS_SET_ROUTE_MODE

const getTypedGroupRoutePath = (
  value: DocsRelationship<DocsGroupReference> | null | undefined,
  seen = new Set<string>(),
): string | undefined => {
  const group = getDocsRelationshipRecord(value)

  if (!group) {
    return undefined
  }

  const explicitRoutePath = getText(group.routePath)

  if (explicitRoutePath) {
    return normalizeRoutePath(explicitRoutePath)
  }

  const slug = getText(group.slug)

  if (!slug) {
    return undefined
  }

  const groupId = getDocsRelationshipId(group)

  if (groupId && seen.has(groupId)) {
    return joinRouteSegments(slug)
  }

  const nextSeen = groupId ? new Set([groupId, ...seen]) : seen
  const parentRoutePath = getTypedGroupRoutePath(group.parent, nextSeen)

  return joinRouteSegments(parentRoutePath, slug)
}

const getGroupRoutePath = (value: unknown, seen = new Set<string>()): string | undefined => {
  const group = getRelationshipValue(value)

  if (!isRecord(group)) {
    return undefined
  }

  const explicitRoutePath = getRecordString(group, 'routePath')

  if (explicitRoutePath) {
    return normalizeRoutePath(explicitRoutePath)
  }

  const slug = getRecordString(group, 'slug')

  if (!slug) {
    return undefined
  }

  const groupId = getRelationshipId(group)

  if (groupId && seen.has(groupId)) {
    return joinRouteSegments(slug)
  }

  const nextSeen = groupId ? new Set([groupId, ...seen]) : seen
  const parentRoutePath = getGroupRoutePath(group.parent, nextSeen)

  return joinRouteSegments(parentRoutePath, slug)
}

const getDocsSetRoutes = (
  value: unknown,
): { productRoute?: string; routeBase?: string; routeMode: DocsSetRouteMode } | undefined => {
  const record = getRelationshipValue(value)

  if (!isRecord(record)) {
    return undefined
  }

  const routeMode = getDocsSetRouteMode(record.routeMode)
  const storedProductRoute = getRecordString(record, 'productRoute')
  const storedRouteBase = getRecordString(record, 'routeBase')
  const slug = getRecordString(record, 'slug')
  const groupRoutePath = getGroupRoutePath(record.group)
  const canDeriveRoute = Boolean(slug && (groupRoutePath || (!storedProductRoute && !storedRouteBase)))
  const productRoute =
    canDeriveRoute && slug
      ? deriveDocsSetProductRoutePath({
          docsSetSlug: slug,
          groupRoutePath,
        })
      : storedProductRoute
  const routeBase =
    canDeriveRoute && slug
      ? deriveDocsSetRouteBase({
          docsSetSlug: slug,
          groupRoutePath,
          routeMode,
        })
      : storedRouteBase

  return {
    productRoute: productRoute ? normalizeRoutePath(productRoute) : undefined,
    routeBase: routeBase ? normalizeRoutePath(routeBase) : undefined,
    routeMode,
  }
}

export const getDocsSetDocsHref = (value: unknown): string | undefined => {
  const routes = getDocsSetRoutes(value)

  return routes?.routeBase ?? routes?.productRoute
}

export const getDocsSetPublicHref = (value: unknown): string | undefined => {
  const routes = getDocsSetRoutes(value)

  if (!routes) {
    return undefined
  }

  return routes.routeMode === 'product-nested'
    ? routes.productRoute ?? routes.routeBase
    : routes.routeBase ?? routes.productRoute
}

const getTypedDocsSetRoutes = (
  value: DocsRelationship<DocsSetReference> | null | undefined,
): { productRoute?: string; routeBase?: string; routeMode: DocsSetRouteMode } | undefined => {
  const record = getDocsRelationshipRecord(value)

  if (!record) {
    return undefined
  }

  const routeMode = getTypedDocsSetRouteMode(record.routeMode)
  const storedProductRoute = getText(record.productRoute)
  const storedRouteBase = getText(record.routeBase)
  const slug = getText(record.slug)
  const groupRoutePath = getTypedGroupRoutePath(record.group)
  const canDeriveRoute = Boolean(slug && (groupRoutePath || (!storedProductRoute && !storedRouteBase)))
  const productRoute =
    canDeriveRoute && slug
      ? deriveDocsSetProductRoutePath({
          docsSetSlug: slug,
          groupRoutePath,
        })
      : storedProductRoute
  const routeBase =
    canDeriveRoute && slug
      ? deriveDocsSetRouteBase({
          docsSetSlug: slug,
          groupRoutePath,
          routeMode,
        })
      : storedRouteBase

  return {
    productRoute: productRoute ? normalizeRoutePath(productRoute) : undefined,
    routeBase: routeBase ? normalizeRoutePath(routeBase) : undefined,
    routeMode,
  }
}

export const getTypedDocsSetPublicHref = (
  value: DocsRelationship<DocsSetReference> | null | undefined,
): string | undefined => {
  const routes = getTypedDocsSetRoutes(value)

  if (!routes) {
    return undefined
  }

  return routes.routeMode === 'product-nested'
    ? routes.productRoute ?? routes.routeBase
    : routes.routeBase ?? routes.productRoute
}

export const getTypedDocsSetDocsHref = (
  value: DocsRelationship<DocsSetReference> | null | undefined,
): string | undefined => {
  const routes = getTypedDocsSetRoutes(value)

  return routes?.routeBase ?? routes?.productRoute
}

export const getTypedDocsPageHref = (
  value: DocsRelationship<DocsPageReference> | null | undefined,
): string | undefined => {
  const record = getDocsRelationshipRecord(value)

  return getText(record?.route) ?? getText(record?.href) ?? getText(record?.url)
}

export const getDocsPageHref = (value: unknown): string | undefined => {
  const record = getRelationshipValue(value)

  if (!isRecord(record)) {
    return undefined
  }

  return getRecordString(record, 'route') ?? getRouteLikeHref(record)
}

export const getRouteLikeHref = (value: unknown): string | undefined => {
  const record = getRelationshipValue(value)

  if (!isRecord(record)) {
    return undefined
  }

  return (
    getRecordString(record, 'href') ??
    getRecordString(record, 'url') ??
    getRecordString(record, 'route') ??
    getRecordString(record, 'routePath') ??
    getDocsSetPublicHref(record) ??
    getRecordString(record, 'routeBase') ??
    getRecordString(record, 'productRoute')
  )
}

export const getRouteLikeTitle = (value: unknown): string | undefined => {
  const record = getRelationshipValue(value)

  if (!isRecord(record)) {
    return undefined
  }

  return (
    getRecordString(record, 'navTitle') ??
    getRecordString(record, 'title') ??
    getRecordString(record, 'label')
  )
}

export const getRouteLikeDescription = (value: unknown): string | undefined => {
  const record = getRelationshipValue(value)

  if (!isRecord(record)) {
    return undefined
  }

  return getRecordString(record, 'description') ?? getRecordString(record, 'excerpt')
}
