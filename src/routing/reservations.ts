import { isRouteDescendant, normalizeRoutePath } from './paths.js'

export type DocsRouteReservationOwnerType = 'doc' | 'docsGroup' | 'docsSet' | 'page'

export type DocsRouteReservation = {
  allowBridge?: boolean
  ownerId?: string
  ownerType: DocsRouteReservationOwnerType
  reservesDescendants?: boolean
  route: string
}

export type DocsRouteCollisionReason =
  | 'descendant_route_collision'
  | 'exact_route_collision'

export type DocsRouteCollision = {
  first: DocsRouteReservation
  reason: DocsRouteCollisionReason
  second: DocsRouteReservation
}

const normalizeReservation = (
  reservation: DocsRouteReservation,
): DocsRouteReservation => ({
  ...reservation,
  route: normalizeRoutePath(reservation.route),
})

const sameOwner = (
  first: DocsRouteReservation,
  second: DocsRouteReservation,
): boolean =>
  first.ownerType === second.ownerType &&
  first.ownerId !== undefined &&
  first.ownerId === second.ownerId

const isAllowedBridgeCollision = (
  first: DocsRouteReservation,
  second: DocsRouteReservation,
): boolean => {
  if (first.route !== second.route) {
    return false
  }

  return first.allowBridge === true || second.allowBridge === true
}

export const findRouteReservationCollisions = (
  reservations: DocsRouteReservation[],
): DocsRouteCollision[] => {
  const normalizedReservations = reservations.map(normalizeReservation)
  const collisions: DocsRouteCollision[] = []

  for (let index = 0; index < normalizedReservations.length; index += 1) {
    for (
      let comparedIndex = index + 1;
      comparedIndex < normalizedReservations.length;
      comparedIndex += 1
    ) {
      const first = normalizedReservations[index]
      const second = normalizedReservations[comparedIndex]

      if (!first || !second || sameOwner(first, second)) {
        continue
      }

      if (first.route === second.route) {
        if (!isAllowedBridgeCollision(first, second)) {
          collisions.push({
            first,
            reason: 'exact_route_collision',
            second,
          })
        }

        continue
      }

      if (
        (first.reservesDescendants && isRouteDescendant(first.route, second.route)) ||
        (second.reservesDescendants && isRouteDescendant(second.route, first.route))
      ) {
        collisions.push({
          first,
          reason: 'descendant_route_collision',
          second,
        })
      }
    }
  }

  return collisions
}

export const createDocRouteReservations = (
  docs: {
    ownerId?: string
    route: string
  }[],
): DocsRouteReservation[] =>
  docs.map((doc) => ({
    ownerId: doc.ownerId,
    ownerType: 'doc',
    route: doc.route,
  }))

export const createDocsSetRouteReservation = ({
  ownerId,
  routeBase,
}: {
  ownerId?: string
  routeBase: string
}): DocsRouteReservation => ({
  ownerId,
  ownerType: 'docsSet',
  reservesDescendants: true,
  route: routeBase,
})

export const createDocsGroupRouteReservation = ({
  ownerId,
  pageMode,
  routePath,
}: {
  ownerId?: string
  pageMode?: 'auto' | 'custom'
  routePath: string
}): DocsRouteReservation => {
  const ownsRoute = pageMode !== 'custom'

  return {
    ownerId,
    ownerType: 'docsGroup',
    reservesDescendants: false,
    route: routePath,
    ...(ownsRoute ? {} : { allowBridge: true }),
  }
}

export const findPageRouteCollisions = ({
  allowBridgePages = true,
  docsGroupRoutes = [],
  docsSetRouteBase,
  pages,
}: {
  allowBridgePages?: boolean
  docsGroupRoutes?: {
    ownerId?: string
    pageMode?: 'auto' | 'custom'
    routePath: string
  }[]
  docsSetRouteBase: string
  pages: {
    bridge?: boolean
    id?: string
    route: string
  }[]
}): DocsRouteCollision[] => {
  const reservations = [
    createDocsSetRouteReservation({
      routeBase: docsSetRouteBase,
    }),
    ...docsGroupRoutes.map((group) =>
      createDocsGroupRouteReservation({
        ownerId: group.ownerId,
        pageMode: group.pageMode,
        routePath: group.routePath,
      }),
    ),
    ...pages.map((page) => ({
      allowBridge: allowBridgePages && page.bridge === true,
      ownerId: page.id,
      ownerType: 'page' as const,
      route: page.route,
    })),
  ]

  return findRouteReservationCollisions(reservations).filter(
    (collision) =>
      collision.first.ownerType === 'page' || collision.second.ownerType === 'page',
  )
}
