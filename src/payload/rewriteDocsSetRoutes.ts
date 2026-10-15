/**
 * Rewrites the stored routes of generated docs (main rows and latest versions) and docs
 * assets after docs set routes changed. Planning lives in ./docsRouteRewrite.ts; this
 * module loads records, resolves unique-route claims, and writes.
 *
 * Write rules:
 * - Writes go through `payload.db` (route-only updates, like sync route releases): no new
 *   versions, no hooks, no publish side effects, and the request's transaction (`req`).
 *   Skipping collection hooks is deliberate: `route` is Git-owned, and the MCP agent
 *   guard (agentGuard.ts) refuses agent writes to it. The rewrite is server code that
 *   follows a docs set / group change (which an agent may make through MCP), so it must
 *   not be judged as an agent edit of the docs.
 * - `route` is unique on the docs main table. All target routes are checked against
 *   current holders before any write. A doc whose target route is the current route of
 *   another moving doc (a swap, or a base nested in the old one) is parked on a
 *   placeholder first, then every doc moves to its final route.
 * - With drafts enabled the latest version (what the admin edits and what a later
 *   publish copies to the main row) is rewritten too. Older history versions keep the
 *   route they were saved with.
 */
import { APIError } from 'payload'

import type { DocsAssetRouteRecord, DocsRouteRecord } from './docsRouteRewrite.js'

import { getRecordId, getRelationshipId, getString, isRecord } from '../shared/records.js'
import {
  inferStaleAssetProductRoute,
  inferStaleDocsRouteBase,
  parseStoredDocsRoute,
  planAssetRouteRewrite,
  planDocsRouteRewrite,
  toPendingRoute,
} from './docsRouteRewrite.js'

type FindArgs = {
  collection: string
  depth?: number
  draft?: boolean
  limit?: number
  overrideAccess?: boolean
  pagination?: boolean
  req?: unknown
  select?: Record<string, unknown>
  where?: unknown
}

export type DocsRouteRewritePayload = {
  collections?: Record<string, { config?: { versions?: unknown } } | undefined>
  db: {
    findVersions?: (args: {
      collection: string
      limit?: number
      pagination?: boolean
      req?: unknown
      select?: Record<string, unknown>
      where?: unknown
    }) => Promise<{ docs: unknown[] }>
    name?: string
    updateOne: (args: {
      collection: string
      data: Record<string, unknown>
      id: number | string
      req?: unknown
      returning?: boolean
    }) => Promise<unknown>
    updateVersion?: (args: {
      collection: string
      id: number | string
      req?: unknown
      returning?: boolean
      versionData: Record<string, unknown>
    }) => Promise<unknown>
  }
  find: (args: FindArgs) => Promise<{ docs: unknown[] }>
}

export type DocsSetRoutePair = {
  productRoute: string
  routeBase: string
}

export type DocsSetRouteRewriteTarget = {
  docsSetId: number | string
  /** Earlier routes of the docs set, most trusted first (inference covers the rest). */
  hints?: DocsSetRoutePair[]
  routes: DocsSetRoutePair
  /**
   * Source ids (docs set slugs) whose records carry no `docsSet` relationship but
   * belong to this set (records written before the relationship existed).
   */
  sourceIds?: string[]
}

export type DocsRouteRewriteIssue = {
  collection: string
  id: string
  route: string
}

export type DocsRouteCollision = {
  /** Current holder of the route, when it is a stored doc. */
  holderId?: string
  /** The doc that would move onto the route. */
  id: string
  route: string
}

export type DocsSetRouteRewriteReport = {
  assets: number
  collisions: DocsRouteCollision[]
  docs: number
  docsSetId: string
  productRoute: string
  routeBase: string
  unresolved: DocsRouteRewriteIssue[]
  versions: number
}

export type DocsRouteRewriteResult = {
  /** Old and new public routes of everything that moved, plus the docs set routes. */
  paths: string[]
  sets: DocsSetRouteRewriteReport[]
}

export type DocsRouteRewriteCollections = {
  /** Docs collection slug, when enabled. */
  docs?: string
  /** Docs assets collection slug, when enabled. */
  docsAssets?: string
}

type Move = {
  from: string
  id: string
  setIndex: number
  to: string
}

type VersionMove = {
  /** The doc the version belongs to. */
  docId: string
  from: string
  id: number | string
  setIndex: number
  to: string
}

const ID_CHUNK_SIZE = 200

const chunk = <T>(items: T[], size = ID_CHUNK_SIZE): T[][] => {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

const publicRouteOf = (stored: string): string | undefined => {
  const parts = parseStoredDocsRoute(stored)

  return parts && !parts.tombstonePrefix && !parts.pending ? parts.route : undefined
}

const belongsToSet = (
  record: Record<string, unknown>,
  docsSetId: string,
  sourceIds: Set<string>,
): boolean => {
  const relatedSetId = getRelationshipId(record.docsSet)

  if (relatedSetId !== undefined) {
    return relatedSetId === docsSetId
  }

  const sync = isRecord(record.sync) ? record.sync : undefined
  const sourceId = getString(sync?.sourceId) ?? getString(record.sourceId)

  return sourceId !== undefined && sourceIds.has(sourceId)
}

const setRecordsWhere = (docsSetId: number | string, sourceIds: string[]) => ({
  or: [
    { docsSet: { equals: docsSetId } },
    ...(sourceIds.length > 0 ? [{ 'sync.sourceId': { in: sourceIds } }] : []),
  ],
})

export const hasDocsDrafts = (payload: DocsRouteRewritePayload, docsCollection: string): boolean => {
  const versions = payload.collections?.[docsCollection]?.config?.versions

  return isRecord(versions) && Boolean(versions.drafts)
}

/** Route-only version update; Mongoose needs a dotted path to keep the rest of `version`. */
const versionRouteData = (payload: DocsRouteRewritePayload, route: string) =>
  payload.db.name === 'mongoose' ? { 'version.route': route } : { version: { route } }

const describeCollisions = (collisions: DocsRouteCollision[]): string => {
  const routes = [...new Set(collisions.map((collision) => collision.route))]
  const listed = routes.slice(0, 5).join(', ')

  return `${listed}${routes.length > 5 ? ` and ${routes.length - 5} more` : ''}`
}

export class DocsRouteCollisionError extends APIError {
  collisions: DocsRouteCollision[]

  constructor(collisions: DocsRouteCollision[]) {
    super(
      `This change would move generated docs onto routes that are already in use: ${describeCollisions(
        collisions,
      )}. Change the docs set or group so its routes do not overlap another docs set.`,
      409,
      { collisions },
      true,
    )
    this.collisions = collisions
  }
}

/**
 * Rewrites docs and asset routes for every target docs set. `onCollision: 'throw'`
 * (hooks) aborts before any write; `'skip'` (repair) leaves colliding docs, and docs
 * whose target is held by one of them, where they are and reports them.
 */
export const rewriteDocsSetRoutes = async ({
  collections,
  dryRun = false,
  onCollision = 'throw',
  payload,
  req,
  targets,
}: {
  collections: DocsRouteRewriteCollections
  dryRun?: boolean
  onCollision?: 'skip' | 'throw'
  payload: DocsRouteRewritePayload
  req?: unknown
  targets: DocsSetRouteRewriteTarget[]
}): Promise<DocsRouteRewriteResult> => {
  const docsCollection = collections.docs
  const assetsCollection = collections.docsAssets
  const drafts = docsCollection ? hasDocsDrafts(payload, docsCollection) : false
  const reports: DocsSetRouteRewriteReport[] = []
  const paths = new Set<string>()
  const moves: Move[] = []
  const versionMoves: VersionMove[] = []
  const assetMoves: Move[] = []

  for (const [setIndex, target] of targets.entries()) {
    const docsSetId = String(target.docsSetId)
    const sourceIds = [...new Set(target.sourceIds ?? [])]
    const sourceIdSet = new Set(sourceIds)
    const hints = target.hints ?? []
    const report: DocsSetRouteRewriteReport = {
      assets: 0,
      collisions: [],
      docs: 0,
      docsSetId,
      productRoute: target.routes.productRoute,
      routeBase: target.routes.routeBase,
      unresolved: [],
      versions: 0,
    }

    reports.push(report)
    paths.add(target.routes.routeBase)
    paths.add(target.routes.productRoute)

    for (const hint of hints) {
      paths.add(hint.routeBase)
      paths.add(hint.productRoute)
    }

    if (docsCollection) {
      const result = await payload.find({
        collection: docsCollection,
        depth: 0,
        // Main rows: published (or never-published) state, where `route` is unique.
        draft: false,
        overrideAccess: true,
        pagination: false,
        req,
        select: { docsSet: true, route: true, sourcePath: true, sync: { sourceId: true } },
        where: setRecordsWhere(target.docsSetId, sourceIds),
      })
      const records: DocsRouteRecord[] = result.docs.flatMap((doc) => {
        const id = getRecordId(doc)

        return isRecord(doc) &&
          id !== undefined &&
          typeof doc.route === 'string' &&
          belongsToSet(doc, docsSetId, sourceIdSet)
          ? [
              {
                id,
                route: doc.route,
                sourcePath: getString(doc.sourcePath),
              },
            ]
          : []
      })
      const inferred = inferStaleDocsRouteBase({ records, target: target.routes.routeBase })
      const staleBases = [...hints.map((hint) => hint.routeBase), ...(inferred ? [inferred] : [])]

      for (const record of records) {
        const decision = planDocsRouteRewrite({
          route: record.route,
          sourcePath: record.sourcePath,
          staleBases,
          target: target.routes.routeBase,
        })

        if (decision.status === 'move') {
          moves.push({ id: record.id, from: record.route, setIndex, to: decision.route })
        } else if (decision.status === 'unresolved') {
          report.unresolved.push({ id: record.id, collection: docsCollection, route: record.route })
        }

        const live = publicRouteOf(record.route)

        if (live) {
          paths.add(live)
        }
      }

      if (drafts && typeof payload.db.findVersions === 'function' && records.length > 0) {
        for (const ids of chunk(records.map((record) => record.id))) {
          const versions = await payload.db.findVersions({
            collection: docsCollection,
            limit: 0,
            pagination: false,
            req,
            select: { parent: true, version: { route: true, sourcePath: true } },
            where: {
              and: [{ parent: { in: ids } }, { latest: { equals: true } }],
            },
          })

          for (const version of versions.docs) {
            const versionId =
              isRecord(version) && (typeof version.id === 'string' || typeof version.id === 'number')
                ? version.id
                : undefined
            const data = isRecord(version) && isRecord(version.version) ? version.version : undefined
            const docId = isRecord(version) ? getRelationshipId(version.parent) : undefined

            if (versionId === undefined || docId === undefined || typeof data?.route !== 'string') {
              continue
            }

            const decision = planDocsRouteRewrite({
              route: data.route,
              sourcePath: getString(data.sourcePath),
              staleBases,
              target: target.routes.routeBase,
            })

            if (decision.status === 'move') {
              versionMoves.push({
                id: versionId,
                docId,
                from: data.route,
                setIndex,
                to: decision.route,
              })
            }
          }
        }
      }
    }

    if (assetsCollection) {
      const result = await payload.find({
        collection: assetsCollection,
        depth: 0,
        overrideAccess: true,
        pagination: false,
        req,
        select: {
          docsSet: true,
          kind: true,
          route: true,
          sourceId: true,
          sourcePath: true,
          sync: { sourceId: true },
        },
        where: setRecordsWhere(target.docsSetId, sourceIds),
      })
      const assets: DocsAssetRouteRecord[] = result.docs.flatMap((doc) => {
        const id = getRecordId(doc)

        return isRecord(doc) && id !== undefined && belongsToSet(doc, docsSetId, sourceIdSet)
          ? [
              {
                id,
                kind: getString(doc.kind),
                route: typeof doc.route === 'string' ? doc.route : undefined,
                sourceId: getString(doc.sourceId),
                sourcePath: getString(doc.sourcePath),
              },
            ]
          : []
      })
      const inferred = inferStaleAssetProductRoute({ assets, target: target.routes.productRoute })
      const staleProductRoutes = [
        ...hints.map((hint) => hint.productRoute),
        ...(inferred ? [inferred] : []),
      ]

      for (const asset of assets) {
        const decision = planAssetRouteRewrite({
          asset,
          staleProductRoutes,
          target: target.routes.productRoute,
        })

        if (decision.status === 'move' && asset.route) {
          assetMoves.push({ id: asset.id, from: asset.route, setIndex, to: decision.route })
        } else if (decision.status === 'unresolved' && asset.route) {
          report.unresolved.push({ id: asset.id, collection: assetsCollection, route: asset.route })
        }
      }
    }
  }

  // Unique-route claims: every live target route must be free, or held by a doc that
  // moves away in this rewrite.
  const liveMoves = moves.filter((move) => publicRouteOf(move.to) !== undefined)
  const holders = new Map<string, string>()

  if (docsCollection) {
    for (const routes of chunk([...new Set(liveMoves.map((move) => move.to))])) {
      const result = await payload.find({
        collection: docsCollection,
        depth: 0,
        draft: false,
        overrideAccess: true,
        pagination: false,
        req,
        select: { route: true },
        where: { route: { in: routes } },
      })

      for (const holder of result.docs) {
        const holderId = getRecordId(holder)

        if (holderId !== undefined && isRecord(holder) && typeof holder.route === 'string') {
          holders.set(holder.route, holderId)
        }
      }
    }
  }

  const blocked = new Map<string, DocsRouteCollision>()

  for (;;) {
    const movingIds = new Set(
      liveMoves.filter((move) => !blocked.has(move.id)).map((move) => move.id),
    )
    const claimed = new Map<string, string>()
    let changed = false

    for (const move of liveMoves) {
      if (blocked.has(move.id)) {
        continue
      }

      const holderId = holders.get(move.to)
      const otherClaimant = claimed.get(move.to)

      if (holderId !== undefined && holderId !== move.id && !movingIds.has(holderId)) {
        blocked.set(move.id, { id: move.id, holderId, route: move.to })
        changed = true
      } else if (otherClaimant !== undefined) {
        blocked.set(move.id, { id: move.id, holderId: otherClaimant, route: move.to })
        changed = true
      } else {
        claimed.set(move.to, move.id)
      }
    }

    if (!changed || onCollision === 'throw') {
      break
    }

    // Blocked docs keep their route, which may now block other moves.
    for (const move of liveMoves) {
      if (blocked.has(move.id) && publicRouteOf(move.from)) {
        holders.set(move.from, move.id)
      }
    }
  }

  if (blocked.size > 0) {
    const collisions = [...blocked.values()]

    if (onCollision === 'throw') {
      throw new DocsRouteCollisionError(collisions)
    }

    for (const move of moves) {
      const collision = blocked.get(move.id)

      if (collision) {
        reports[move.setIndex]?.collisions.push(collision)
      }
    }
  }

  const applied = moves.filter((move) => !blocked.has(move.id))
  const appliedIds = new Set(applied.map((move) => move.id))
  // A doc left in place keeps its draft on the same route.
  const appliedVersions = versionMoves.filter((move) => !blocked.has(move.docId))

  for (const move of [...applied, ...appliedVersions, ...assetMoves]) {
    for (const route of [publicRouteOf(move.from), publicRouteOf(move.to)]) {
      if (route) {
        paths.add(route)
      }
    }
  }

  for (const move of applied) {
    reports[move.setIndex].docs += 1
  }

  for (const move of appliedVersions) {
    reports[move.setIndex].versions += 1
  }

  for (const move of assetMoves) {
    reports[move.setIndex].assets += 1
  }

  if (dryRun) {
    return { paths: [...paths], sets: reports }
  }

  if (docsCollection) {
    const writeRoute = (id: string, route: string) =>
      payload.db.updateOne({
        id,
        collection: docsCollection,
        data: { route },
        req,
        returning: false,
      })
    const vacated = new Set(applied.map((move) => move.from))
    const parked = applied.filter((move) => vacated.has(move.to) && appliedIds.has(move.id))

    // Phase 1: park docs whose target is still held by another moving doc.
    for (const move of parked) {
      await writeRoute(move.id, toPendingRoute(move.id, move.to))
    }

    const parkedIds = new Set(parked.map((move) => move.id))

    // Phase 2: every other doc moves straight to a free route; parked docs follow.
    for (const move of applied.filter((candidate) => !parkedIds.has(candidate.id))) {
      await writeRoute(move.id, move.to)
    }

    for (const move of parked) {
      await writeRoute(move.id, move.to)
    }

    if (typeof payload.db.updateVersion === 'function') {
      for (const move of appliedVersions) {
        await payload.db.updateVersion({
          id: move.id,
          collection: docsCollection,
          req,
          returning: false,
          versionData: versionRouteData(payload, move.to),
        })
      }
    }
  }

  if (assetsCollection) {
    for (const move of assetMoves) {
      await payload.db.updateOne({
        id: move.id,
        collection: assetsCollection,
        data: { route: move.to },
        req,
        returning: false,
      })
    }
  }

  return { paths: [...paths], sets: reports }
}
