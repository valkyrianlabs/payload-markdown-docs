import type {
  DocsGroupReference,
  DocsPageReference,
  DocsRelationship,
  DocsRelationshipID,
  DocsSetReference,
} from '../marketing/types.js'

import { parseDocsSetRouteMode, resolveDocsGroupRoutePath } from '../routing/docsSetRoutes.js'
import {
  DEFAULT_DOCS_SET_ROUTE_MODE,
  deriveDocsSetProductRoutePath,
  deriveDocsSetRouteBase,
  type DocsSetRouteMode,
  normalizeRoutePath,
} from '../routing/index.js'
import { getString, isRecord } from '../shared/records.js'

export { getString, isRecord } from '../shared/records.js'

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

const getTypedDocsSetRouteMode = (
  value: DocsSetReference['routeMode'],
): DocsSetRouteMode => value ?? DEFAULT_DOCS_SET_ROUTE_MODE

/** Group route from populated relationship data (a stored `routePath` wins). */
const getTypedGroupRoutePath = (
  value: DocsRelationship<DocsGroupReference> | null | undefined,
): string | undefined =>
  resolveDocsGroupRoutePath(value, (reference) => {
    const group = getDocsRelationshipRecord(
      reference as DocsRelationship<DocsGroupReference> | null | undefined,
    )

    return group
      ? {
          id: getDocsRelationshipId(group),
          slug: getText(group.slug),
          parent: group.parent,
          routePath: getText(group.routePath),
        }
      : undefined
  })

/** Group route from untyped populated relationship data (a stored `routePath` wins). */
const getGroupRoutePath = (value: unknown): string | undefined =>
  resolveDocsGroupRoutePath(value, (reference) => {
    const group = getRelationshipValue(reference)

    return isRecord(group)
      ? {
          id: getRelationshipId(group),
          slug: getRecordString(group, 'slug'),
          parent: group.parent,
          routePath: getRecordString(group, 'routePath'),
        }
      : undefined
  })

const getDocsSetRoutes = (
  value: unknown,
): { productRoute?: string; routeBase?: string; routeMode: DocsSetRouteMode } | undefined => {
  const record = getRelationshipValue(value)

  if (!isRecord(record)) {
    return undefined
  }

  const routeMode = parseDocsSetRouteMode(record.routeMode)
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
