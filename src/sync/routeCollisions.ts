export type ManifestRouteCollisionReason =
  | 'case_insensitive_route_collision'
  | 'exact_route_collision'

export type ManifestRouteCollision = {
  /** Manifest paths (docs files first, then assets) that derive the colliding routes. */
  paths: string[]
  reason: ManifestRouteCollisionReason
  /** The first colliding route in manifest order. */
  route: string
  /** Every distinct route in the collision group (one entry for exact collisions). */
  routes: string[]
}

const toAsciiLowerCase = (value: string): string =>
  value.replace(/[A-Z]/g, (character) => character.toLowerCase())

const normalizeRoute = (route: string): string => {
  const normalized = `/${route.trim()}`.replace(/\\/g, '/').replace(/\/+/g, '/')
  const withoutTrailingSlash = normalized.length > 1 ? normalized.replace(/\/+$/g, '') : normalized

  return withoutTrailingSlash || '/'
}

const groupBy = (
  entries: Array<{ path: string; route: string }>,
  keyOf: (route: string) => string,
): Array<Array<{ path: string; route: string }>> => {
  const groups = new Map<string, Array<{ path: string; route: string }>>()

  for (const entry of entries) {
    const key = keyOf(entry.route)
    const group = groups.get(key)

    if (group) {
      group.push(entry)
    } else {
      groups.set(key, [entry])
    }
  }

  return [...groups.values()]
}

/**
 * Finds routes derived more than once inside a single manifest.
 *
 * - `exact_route_collision`: two entries derive the same route (for example
 *   `index.md` + `Index.md`, or `guide.md` + `guide/index.md`). The sync
 *   endpoint rejects these with `route_collision`.
 * - `case_insensitive_route_collision`: routes that differ only in ASCII
 *   letter case (`Guide.md` + `guide.md`). These are accepted but collide on
 *   case-insensitive filesystems, CDNs and caches, so clients report them as
 *   warnings.
 */
export const findManifestRouteCollisions = ({
  assets = [],
  files,
}: {
  assets?: Array<{ path: string; route?: string }>
  files: Array<{ path: string; route: string }>
}): ManifestRouteCollision[] => {
  const entries = [
    ...files.map((file) => ({ path: file.path, route: normalizeRoute(file.route) })),
    ...assets.flatMap((asset) =>
      asset.route ? [{ path: asset.path, route: normalizeRoute(asset.route) }] : [],
    ),
  ]
  const collisions: ManifestRouteCollision[] = []

  for (const group of groupBy(entries, (route) => route)) {
    if (group.length > 1 && group[0]) {
      collisions.push({
        paths: group.map((entry) => entry.path),
        reason: 'exact_route_collision',
        route: group[0].route,
        routes: [group[0].route],
      })
    }
  }

  for (const group of groupBy(entries, toAsciiLowerCase)) {
    const routes = [...new Set(group.map((entry) => entry.route))]

    if (routes.length > 1 && group[0]) {
      collisions.push({
        paths: group.map((entry) => entry.path),
        reason: 'case_insensitive_route_collision',
        route: group[0].route,
        routes,
      })
    }
  }

  return collisions
}
