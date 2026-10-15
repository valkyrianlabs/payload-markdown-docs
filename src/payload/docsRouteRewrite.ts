/**
 * Route rewrite planning for generated docs and docs assets whose docs set route changed
 * (docs set group / slug / routeMode, or a group slug / parent anywhere in its chain).
 *
 * Docs and assets store their full `route`, derived at sync time from the docs set's
 * route base. When the base changes, the stored routes go stale until the next sync.
 * These pure functions decide, per stored route, what the route must become:
 *
 * - A doc route that is exactly what the sync derives for the target base (from its
 *   `sourcePath`, with or without a frontmatter slug) is current and kept.
 * - A doc route that the sync derives for a stale base is re-derived for the target
 *   base, so the result matches what the next sync would write.
 * - Otherwise a route below a stale base keeps its suffix under the target base.
 * - Anything else is left alone and reported as unresolved.
 *
 * Stale bases come from hints (the previous docs set / group state) and, so data that is
 * already stale can be repaired without knowing the old state, from inference: each doc's
 * route minus the segments its source path contributes, majority vote.
 *
 * Archived docs hold a released tombstone (`archived:<id>:<route>`); the embedded route
 * is rewritten the same way (so the admin shows the current path) and the tombstone
 * prefix is kept, so it can never claim a live route.
 */
import { deriveAssetRouteFromSourcePath, deriveRouteFromSourcePath } from '../sync/paths.js'
import { RELEASED_ROUTE_PREFIX } from './routeClaims.js'

/**
 * Placeholder a rewrite parks a route under while routes are swapped
 * (`rewriting:<id>:<route>`). It only exists inside the rewrite's transaction; a
 * leftover from an adapter without transactions is recognized and finished by the next
 * rewrite or repair.
 */
export const PENDING_ROUTE_PREFIX = 'rewriting:'

export const toPendingRoute = (id: string, route: string): string =>
  `${PENDING_ROUTE_PREFIX}${id}:${route}`

export type StoredRouteParts = {
  /** The stored value is a pending placeholder for `route`. */
  pending?: boolean
  /** The live route (starts with "/"). */
  route: string
  /** `archived:<id>:` for released tombstones. */
  tombstonePrefix?: string
}

const splitPrefixedRoute = (
  stored: string,
  prefix: string,
): { head: string; route: string } | undefined => {
  const rest = stored.slice(prefix.length)
  const separator = rest.indexOf(':')
  const route = separator >= 0 ? rest.slice(separator + 1) : ''

  return route.startsWith('/')
    ? { head: `${prefix}${rest.slice(0, separator + 1)}`, route }
    : undefined
}

/** Splits a stored doc route into its live route and tombstone prefix, if any. */
export const parseStoredDocsRoute = (stored: string): StoredRouteParts | undefined => {
  if (stored.startsWith('/')) {
    return { route: stored }
  }

  if (stored.startsWith(PENDING_ROUTE_PREFIX)) {
    const pending = splitPrefixedRoute(stored, PENDING_ROUTE_PREFIX)

    return pending ? { pending: true, route: pending.route } : undefined
  }

  if (!stored.startsWith(RELEASED_ROUTE_PREFIX)) {
    return undefined
  }

  const released = splitPrefixedRoute(stored, RELEASED_ROUTE_PREFIX)

  return released ? { route: released.route, tombstonePrefix: released.head } : undefined
}

const formatStoredRoute = (parts: StoredRouteParts, route: string): string =>
  `${parts.tombstonePrefix ?? ''}${route}`

const segmentsOf = (route: string): string[] => route.split('/').filter(Boolean)

/** True when `route` is `base` or below it. */
export const isRouteAtOrUnder = (route: string, base: string): boolean =>
  base === '/' || route === base || route.startsWith(`${base}/`)

const replaceRouteBase = (route: string, from: string, to: string): string => {
  const suffix = route === from ? '' : route.slice(from === '/' ? 0 : from.length)

  return to === '/' ? suffix || '/' : `${to}${suffix}`
}

/**
 * Whether the sync derives `route` from `sourcePath` for `routeBase`: without a
 * frontmatter slug, or (`guessSlug`) with a slug equal to the route's last segment.
 * Returns the slug used, or undefined when the route is not derived there.
 */
const matchSyncDerivation = ({
  guessSlug,
  route,
  routeBase,
  sourcePath,
}: {
  guessSlug?: boolean
  route: string
  routeBase: string
  sourcePath?: string
}): { slug?: string } | undefined => {
  if (!sourcePath) {
    return undefined
  }

  const slugs = guessSlug === undefined ? [undefined, segmentsOf(route).at(-1)] : guessSlug ? [segmentsOf(route).at(-1)] : [undefined]

  for (const slug of slugs) {
    if (deriveRouteFromSourcePath({ slug, routeBase, sourcePath }) === route) {
      return { slug }
    }
  }

  return undefined
}

export type DocsRouteRecord = {
  id: string
  /** Stored route (live route or released tombstone). */
  route: string
  sourcePath?: string
}

/**
 * Infers the route base stale docs were synced under: for each doc whose route is not
 * current for `target`, its route minus the segments its source path contributes;
 * the most common candidate wins (ties: shortest, then alphabetical).
 */
export const inferStaleDocsRouteBase = ({
  records,
  target,
}: {
  records: DocsRouteRecord[]
  target: string
}): string | undefined => {
  const votes = new Map<string, number>()

  for (const record of records) {
    const parts = parseStoredDocsRoute(record.route)

    if (!parts || !record.sourcePath) {
      continue
    }

    if (matchSyncDerivation({ route: parts.route, routeBase: target, sourcePath: record.sourcePath })) {
      continue
    }

    const contributed = segmentsOf(
      deriveRouteFromSourcePath({ routeBase: '/', sourcePath: record.sourcePath }),
    ).length
    const segments = segmentsOf(parts.route)

    if (segments.length <= contributed) {
      continue
    }

    const base = `/${segments.slice(0, segments.length - contributed).join('/')}`

    if (base !== target) {
      votes.set(base, (votes.get(base) ?? 0) + 1)
    }
  }

  return [...votes.entries()].sort(
    ([firstBase, firstVotes], [secondBase, secondVotes]) =>
      secondVotes - firstVotes ||
      firstBase.length - secondBase.length ||
      firstBase.localeCompare(secondBase),
  )[0]?.[0]
}

export type RouteRewriteDecision =
  | { route: string; status: 'move' }
  | { status: 'keep' }
  | { status: 'unresolved' }

/** Decides what a stored doc route must become for the target route base. */
export const planDocsRouteRewrite = ({
  route: stored,
  sourcePath,
  staleBases,
  target,
}: {
  route: string
  sourcePath?: string
  /** Route bases the doc may still be stored under, most trusted first. */
  staleBases: string[]
  target: string
}): RouteRewriteDecision => {
  const parts = parseStoredDocsRoute(stored)

  if (!parts) {
    return { status: 'unresolved' }
  }

  const { route } = parts

  const move = (next: string): RouteRewriteDecision => {
    const nextStored = formatStoredRoute(parts, next)

    return nextStored === stored ? { status: 'keep' } : { route: nextStored, status: 'move' }
  }

  const candidates = [...new Set(staleBases)].filter((base) => base !== target)

  // Plain derivations (no frontmatter slug) are checked before slug-guessed ones: an
  // index page at `/x/docs` is the plain index of base `/x/docs` before it is a page
  // with slug "docs" under `/x`.
  for (const guessSlug of [false, true]) {
    if (matchSyncDerivation({ guessSlug, route, routeBase: target, sourcePath })) {
      return move(route)
    }

    for (const base of candidates) {
      const match = matchSyncDerivation({ guessSlug, route, routeBase: base, sourcePath })

      if (match && sourcePath) {
        return move(deriveRouteFromSourcePath({ slug: match.slug, routeBase: target, sourcePath }))
      }
    }
  }

  const underTarget = isRouteAtOrUnder(route, target)
  const byLength = [...candidates].sort((first, second) => second.length - first.length)

  for (const base of byLength) {
    // A route below both the target and a shorter stale base (target nested in it, e.g.
    // a docs-root -> product-nested switch) has already moved.
    if (isRouteAtOrUnder(route, base) && (!underTarget || base.length > target.length)) {
      return move(replaceRouteBase(route, base, target))
    }
  }

  return underTarget ? move(route) : { status: 'unresolved' }
}

export type DocsAssetRouteRecord = {
  id: string
  kind?: string
  route?: null | string
  sourceId?: string
  sourcePath?: string
}

const LLMS_FILES: Record<string, string> = {
  'llms': 'llms.txt',
  'llms-full': 'llms-full.txt',
}

/** The product route an llms or skill asset route was derived under, when recognizable. */
const inferAssetProductRoute = (asset: DocsAssetRouteRecord): string | undefined => {
  const route = asset.route

  if (!route?.startsWith('/')) {
    return undefined
  }

  const llmsFile = asset.kind ? LLMS_FILES[asset.kind] : undefined

  if (llmsFile) {
    return route !== `/${llmsFile}` && route.endsWith(`/${llmsFile}`)
      ? route.slice(0, -(llmsFile.length + 1))
      : undefined
  }

  if (asset.kind === 'skill' && asset.sourceId && asset.sourcePath) {
    const prefix = `skills/${asset.sourceId}/`
    const rest = asset.sourcePath.startsWith(prefix) ? asset.sourcePath.slice(prefix.length) : ''
    const suffix = `/skills/${rest}`

    return rest && route.endsWith(suffix) && route.length > suffix.length
      ? route.slice(0, -suffix.length)
      : undefined
  }

  return undefined
}

/** Majority vote of recognizable asset product routes that differ from `target`. */
export const inferStaleAssetProductRoute = ({
  assets,
  target,
}: {
  assets: DocsAssetRouteRecord[]
  target: string
}): string | undefined => {
  const votes = new Map<string, number>()

  for (const asset of assets) {
    const base = inferAssetProductRoute(asset)

    if (base && base !== target) {
      votes.set(base, (votes.get(base) ?? 0) + 1)
    }
  }

  return [...votes.entries()].sort(
    ([firstBase, firstVotes], [secondBase, secondVotes]) =>
      secondVotes - firstVotes ||
      firstBase.length - secondBase.length ||
      firstBase.localeCompare(secondBase),
  )[0]?.[0]
}

/**
 * Decides what an asset route must become for the target product route (assets are
 * served below the docs set's product route, see `resolveAssetRoute`). Root llms files
 * (`/llms.txt`, `/llms-full.txt`) do not depend on the docs set route and are kept.
 */
export const planAssetRouteRewrite = ({
  asset,
  staleProductRoutes,
  target,
}: {
  asset: DocsAssetRouteRecord
  staleProductRoutes: string[]
  target: string
}): RouteRewriteDecision => {
  const route = asset.route

  if (!route?.startsWith('/')) {
    return { status: 'keep' }
  }

  const move = (next: string | undefined): RouteRewriteDecision =>
    !next ? { status: 'unresolved' } : next === route ? { status: 'keep' } : { route: next, status: 'move' }

  if (asset.kind === 'skill' && asset.sourcePath) {
    return move(
      deriveAssetRouteFromSourcePath({
        kind: 'skill',
        routeBase: target,
        sourceId: asset.sourceId,
        sourcePath: asset.sourcePath,
      }),
    )
  }

  const llmsFile = asset.kind ? LLMS_FILES[asset.kind] : undefined

  if (llmsFile) {
    return route === `/${llmsFile}` ? { status: 'keep' } : move(`${target === '/' ? '' : target}/${llmsFile}`)
  }

  if (isRouteAtOrUnder(route, target)) {
    return { status: 'keep' }
  }

  const byLength = [...new Set(staleProductRoutes)]
    .filter((base) => base !== target)
    .sort((first, second) => second.length - first.length)

  for (const base of byLength) {
    if (isRouteAtOrUnder(route, base)) {
      return move(replaceRouteBase(route, base, target))
    }
  }

  return { status: 'unresolved' }
}
