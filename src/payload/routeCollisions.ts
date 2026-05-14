import type { DocsRouteCollision } from '../routing/index.js'

import {
  findPageRouteCollisions,
  findRouteReservationCollisions,
  normalizeRoutePath,
} from '../routing/index.js'

export type RouteCollisionPayloadOperations = {
  find: (args: {
    collection: string
    depth?: number
    draft?: boolean
    limit?: number
    overrideAccess?: boolean
    where?: unknown
  }) => Promise<{
    docs: unknown[]
  }>
}

export type DocsRouteCollisionIssue = {
  reason: string
  route: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getRecordId = (doc: Record<string, unknown>): string | undefined => {
  if (typeof doc.id === 'string' || typeof doc.id === 'number') {
    return String(doc.id)
  }

  return undefined
}

const getRelationshipId = (value: unknown): string | undefined => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  if (isRecord(value)) {
    return getRecordId(value)
  }

  return undefined
}

const getNestedString = (
  value: Record<string, unknown>,
  dottedPath: string,
): string | undefined => {
  const segments = dottedPath.split('.')
  let current: unknown = value

  for (const segment of segments) {
    if (!isRecord(current)) {
      return undefined
    }

    current = current[segment]
  }

  return typeof current === 'string' ? current : undefined
}

const collisionToIssue = (collision: DocsRouteCollision): DocsRouteCollisionIssue => ({
  reason: collision.reason,
  route:
    collision.first.route === collision.second.route
      ? collision.first.route
      : `${collision.first.route} <> ${collision.second.route}`,
})

export const findDuplicateDesiredRouteCollisions = (routes: string[]): DocsRouteCollisionIssue[] =>
  findRouteReservationCollisions(
    routes.map((route, index) => ({
      ownerId: `desired-${index}`,
      ownerType: 'doc',
      route,
    })),
  ).map(collisionToIssue)

export const findExistingDocsRouteCollisions = async ({
  collectionSlug,
  docsSetId,
  includeDrafts = false,
  payload,
  routes,
  sourceId,
}: {
  collectionSlug: string
  docsSetId?: number | string
  includeDrafts?: boolean
  payload: RouteCollisionPayloadOperations
  routes: string[]
  sourceId: string
}): Promise<DocsRouteCollisionIssue[]> => {
  const normalizedRoutes = [...new Set(routes.map(normalizeRoutePath))]

  if (normalizedRoutes.length === 0) {
    return []
  }

  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    draft: includeDrafts,
    limit: 1000,
    overrideAccess: true,
    where: {
      route: {
        in: normalizedRoutes,
      },
    },
  })

  return result.docs.flatMap((doc) => {
    if (!isRecord(doc) || typeof doc.route !== 'string') {
      return []
    }

    const existingDocsSetId = getRelationshipId(doc.docsSet)
    const existingSourceId = getNestedString(doc, 'sync.sourceId')
    const sameOwner = docsSetId
      ? existingDocsSetId === String(docsSetId) ||
        (!existingDocsSetId && existingSourceId === sourceId)
      : !existingDocsSetId && existingSourceId === sourceId

    if (sameOwner) {
      return []
    }

    return [
      {
        reason: 'existing_doc_route_collision',
        route: normalizeRoutePath(doc.route),
      },
    ]
  })
}

export const findExistingAssetRouteCollisions = async ({
  collectionSlug,
  docsSetId,
  payload,
  routes,
  sourceId,
}: {
  collectionSlug: string
  docsSetId?: number | string
  payload: RouteCollisionPayloadOperations
  routes: string[]
  sourceId: string
}): Promise<DocsRouteCollisionIssue[]> => {
  const normalizedRoutes = [...new Set(routes.map(normalizeRoutePath))]

  if (normalizedRoutes.length === 0) {
    return []
  }

  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    where: {
      route: {
        in: normalizedRoutes,
      },
    },
  })

  return result.docs.flatMap((doc) => {
    if (!isRecord(doc) || typeof doc.route !== 'string') {
      return []
    }

    const sync = isRecord(doc.sync) ? doc.sync : undefined

    if (sync?.archived === true) {
      return []
    }

    const existingDocsSetId = getRelationshipId(doc.docsSet)
    const existingSourceId = getNestedString(doc, 'sync.sourceId')
    const sameOwner = docsSetId
      ? existingDocsSetId === String(docsSetId) ||
        (!existingDocsSetId && existingSourceId === sourceId)
      : !existingDocsSetId && existingSourceId === sourceId

    if (sameOwner) {
      return []
    }

    return [
      {
        reason: 'existing_asset_route_collision',
        route: normalizeRoutePath(doc.route),
      },
    ]
  })
}

export const findConfiguredPagesRouteCollisions = async ({
  allowBridgePages,
  bridgeField,
  collectionSlug,
  docsSetRouteBase,
  payload,
  routeField,
}: {
  allowBridgePages: boolean
  bridgeField: string
  collectionSlug: string
  docsSetRouteBase: string
  payload: RouteCollisionPayloadOperations
  routeField: string
}): Promise<DocsRouteCollisionIssue[]> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1000,
    overrideAccess: true,
  })

  const collisions = findPageRouteCollisions({
    allowBridgePages,
    docsSetRouteBase,
    pages: result.docs.flatMap((doc) => {
      if (!isRecord(doc)) {
        return []
      }

      const route = getNestedString(doc, routeField)

      if (!route) {
        return []
      }

      return [
        {
          id: getRecordId(doc),
          bridge: doc[bridgeField] === true,
          route,
        },
      ]
    }),
  })

  return collisions.map(collisionToIssue)
}
