import type { DocsDeleteBehavior, DocsSyncPlan } from '../sync/index.js'
import type { ExistingPayloadDocsRecord } from './existingDocs.js'
import type { DocsRouteCollisionIssue } from './routeCollisions.js'

import { getRecordId, isRecord } from '../shared/records.js'
import { isArchivedPayloadRecord, isPublishedPayloadRecord } from './visibility.js'

/**
 * Route lifecycle for generated docs.
 *
 * The docs collection keeps `route` unique so two live docs can never share a URL.
 * Only live records may hold a real route: archiving a doc rewrites its route to a
 * released tombstone (`archived:<id>:<route>`) that can never equal a synced route
 * (synced routes always start with "/"). Reactivating or re-syncing the doc writes its
 * real route back.
 *
 * Because Payload enforces uniqueness on the main table (draft versions are not
 * unique-checked), route claims are resolved against main-table rows before any write.
 */

export const RELEASED_ROUTE_PREFIX = 'archived:'

export const isReleasedRoute = (route: string): boolean => route.startsWith(RELEASED_ROUTE_PREFIX)

export const toReleasedRoute = (id: number | string, route: string): string =>
  isReleasedRoute(route) ? route : `${RELEASED_ROUTE_PREFIX}${String(id)}:${route}`

export type DocsRouteRelease = {
  id: string
  route: string
}

export type DocsRouteClaimsPayloadOperations = {
  find: (args: {
    collection: string
    depth?: number
    draft?: boolean
    limit?: number
    overrideAccess?: boolean
    pagination?: boolean
    req?: unknown
    where?: unknown
  }) => Promise<{
    docs: unknown[]
  }>
}

export type DocsRouteClaimsResult = {
  collisions: DocsRouteCollisionIssue[]
  releases: DocsRouteRelease[]
}

export const getRemovedDocIds = ({
  deleteBehavior,
  existingBySourcePath,
  plan,
}: {
  deleteBehavior: DocsDeleteBehavior
  existingBySourcePath: Map<string, ExistingPayloadDocsRecord>
  plan: DocsSyncPlan
}): Set<string> => {
  const removals =
    deleteBehavior === 'archive'
      ? plan.archive
      : deleteBehavior === 'draft'
        ? plan.draft
        : deleteBehavior === 'delete'
          ? plan.delete
          : []

  return new Set(
    removals.flatMap((change) => {
      const current = existingBySourcePath.get(change.sourcePath)

      return current ? [current.id] : []
    }),
  )
}

/**
 * Plan-time route claim resolution (DOCS-2).
 *
 * Finds every main-table row that currently holds a route this sync will write to the
 * main table and decides, before any write happens, whether it can be released
 * (same docs set: archived, draft-only, or itself moving in this sync) or whether the
 * sync must be rejected (another owner, or a published doc of this set that keeps
 * serving the route because this sync does not touch its published version).
 */
export const resolveDocsRouteClaims = async ({
  collectionSlug,
  deleteBehavior,
  existing,
  payload,
  plan,
  req,
  writesMainForUpdates,
}: {
  collectionSlug: string
  deleteBehavior: DocsDeleteBehavior
  existing: ExistingPayloadDocsRecord[]
  payload: DocsRouteClaimsPayloadOperations
  plan: DocsSyncPlan
  req?: unknown
  /** Updates/reactivations write the main table (publish sync or drafts disabled). */
  writesMainForUpdates: boolean
}): Promise<DocsRouteClaimsResult> => {
  const existingById = new Map(existing.map((record) => [record.id, record]))
  const existingBySourcePath = new Map(existing.map((record) => [record.sourcePath, record]))
  const removedIds = getRemovedDocIds({
    deleteBehavior,
    existingBySourcePath,
    plan,
  })
  const claimantByRoute = new Map<string, string>()
  const mainWriteIds = new Set<string>()

  for (const change of plan.create) {
    if (change.desired) {
      claimantByRoute.set(change.desired.route, `create:${change.sourcePath}`)
    }
  }

  if (writesMainForUpdates) {
    const reactivations = plan.unchanged.filter((change) => change.current?.archived === true)

    for (const change of [...plan.update, ...reactivations]) {
      const current = existingBySourcePath.get(change.sourcePath)

      if (!change.desired || !current) {
        continue
      }

      claimantByRoute.set(change.desired.route, current.id)
      mainWriteIds.add(current.id)
    }
  }

  if (claimantByRoute.size === 0) {
    return {
      collisions: [],
      releases: [],
    }
  }

  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    // Main-table rows: uniqueness is enforced there, not on draft versions.
    draft: false,
    overrideAccess: true,
    pagination: false,
    req,
    where: {
      route: {
        in: [...claimantByRoute.keys()],
      },
    },
  })
  const collisions: DocsRouteCollisionIssue[] = []
  const releases = new Map<string, DocsRouteRelease>()

  for (const holder of result.docs) {
    if (!isRecord(holder) || typeof holder.route !== 'string') {
      continue
    }

    const holderId = getRecordId(holder)
    const claimant = claimantByRoute.get(holder.route)

    if (!holderId || claimant === undefined || claimant === holderId || removedIds.has(holderId)) {
      continue
    }

    const sameOwner = existingById.has(holderId)
    const holderArchived = isArchivedPayloadRecord(holder)
    const holderDraftOnly = !isPublishedPayloadRecord(holder)

    if (!sameOwner) {
      collisions.push({
        reason: 'existing_doc_route_collision',
        route: holder.route,
      })
      continue
    }

    if (mainWriteIds.has(holderId) || holderArchived || holderDraftOnly) {
      releases.set(holderId, {
        id: holderId,
        route: toReleasedRoute(holderId, holder.route),
      })
      continue
    }

    collisions.push({
      reason: 'route_retained_by_published_doc',
      route: holder.route,
      sourcePath: typeof holder.sourcePath === 'string' ? holder.sourcePath : undefined,
    })
  }

  return {
    collisions,
    releases: [...releases.values()],
  }
}
