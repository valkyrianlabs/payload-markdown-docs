/**
 * The single owner of docs group and docs set route derivation.
 *
 * Every reader (sync source lookup, route adapter, nav links, sitemap, llms, admin
 * manager data, marketing-block hrefs) derives group routes and docs-set routes here so
 * the URL a sync validates against is always the URL the site serves.
 *
 * Group route rule: a group's route is its parent's route plus its own slug. A group
 * without a usable (trimmed, non-empty) slug has no route. A parent that cannot be
 * resolved contributes nothing. A cycle in the parent chain stops at the first group
 * that is visited twice, so each group appears at most once in a route.
 */
import type { DocsSetRouteMode } from './paths.js'

import { getRecordId, getRelationshipId, getString, isRecord } from '../shared/records.js'
import {
  DEFAULT_DOCS_SET_ROUTE_MODE,
  deriveDocsSetProductRoutePath,
  deriveDocsSetRouteBase,
  joinRouteSegments,
  normalizeRoutePath,
} from './paths.js'

/** One step of a group parent-chain walk. */
export type DocsGroupRouteNode = {
  /** Identity used for cycle detection; untracked when undefined. */
  id?: string
  /** Reference to the parent group, resolved with the same resolver. */
  parent?: unknown
  /** Stored route that ends the walk (populated relationship data only). */
  routePath?: string
  slug?: string
}

export type DocsGroupRouteResolver = (reference: unknown) => DocsGroupRouteNode | undefined

/** Walks a group's parent chain and returns its route, or undefined when it has none. */
export const resolveDocsGroupRoutePath = (
  start: unknown,
  resolve: DocsGroupRouteResolver,
): string | undefined => {
  const visit = (reference: unknown, seen: ReadonlySet<string>): string | undefined => {
    const node = resolve(reference)

    if (!node) {
      return undefined
    }

    if (node.routePath) {
      return normalizeRoutePath(node.routePath)
    }

    if (!node.slug || (node.id !== undefined && seen.has(node.id))) {
      return undefined
    }

    const nextSeen = node.id === undefined ? seen : new Set([node.id, ...seen])

    return joinRouteSegments(visit(node.parent, nextSeen), node.slug)
  }

  return visit(start, new Set())
}

export type DocsGroupsById = ReadonlyMap<string, Record<string, unknown>>

/** Indexes raw docs group records (`depth: 0` or populated) by string id. */
export const indexDocsGroupsById = (docs: readonly unknown[]): Map<string, Record<string, unknown>> =>
  new Map(
    docs.flatMap((doc) => {
      const id = isRecord(doc) ? getRecordId(doc) : undefined

      return isRecord(doc) && id !== undefined ? [[id, doc] as const] : []
    }),
  )

/** Group route for a group id (or relationship value) looked up in `groupsById`. */
export const getDocsGroupRoutePath = ({
  group,
  groupsById,
}: {
  group: unknown
  groupsById: DocsGroupsById
}): string | undefined =>
  resolveDocsGroupRoutePath(group, (reference) => {
    const id = getRelationshipId(reference)
    const doc = id === undefined ? undefined : groupsById.get(id)

    return doc
      ? {
          id,
          slug: getString(doc.slug),
          parent: doc.parent,
        }
      : undefined
  })

export const parseDocsSetRouteMode = (value: unknown): DocsSetRouteMode =>
  value === 'product-nested' || value === 'docs-root' ? value : DEFAULT_DOCS_SET_ROUTE_MODE

export type DocsSetRoutes = {
  /** Related group id, when the docs set has one (even if the group cannot be resolved). */
  groupId?: string
  /** Route of the related group; undefined without a group or when it has no route. */
  groupRoutePath?: string
  /** `/<group route>/<slug>`: the product page route. */
  productRoute: string
  /** Where the docs are served: the product route, or `<product route>/docs` when nested. */
  routeBase: string
  routeMode: DocsSetRouteMode
  /** Trimmed docs set slug. */
  slug: string
}

/** Derives a docs set's routes from its raw record; undefined without a usable slug. */
export const resolveDocsSetRoutes = ({
  doc,
  groupsById,
}: {
  doc: unknown
  groupsById: DocsGroupsById
}): DocsSetRoutes | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  const slug = getString(doc.slug)

  if (!slug) {
    return undefined
  }

  const groupId = getRelationshipId(doc.group)
  const groupRoutePath = groupId ? getDocsGroupRoutePath({ group: groupId, groupsById }) : undefined
  const routeMode = parseDocsSetRouteMode(doc.routeMode)

  return {
    slug,
    groupId,
    groupRoutePath,
    productRoute: deriveDocsSetProductRoutePath({
      docsSetSlug: slug,
      groupRoutePath,
    }),
    routeBase: deriveDocsSetRouteBase({
      docsSetSlug: slug,
      groupRoutePath,
      routeMode,
    }),
    routeMode,
  }
}
