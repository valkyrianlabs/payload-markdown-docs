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

  return (
    (first.ownerType === 'page' && first.allowBridge === true) ||
    (second.ownerType === 'page' && second.allowBridge === true)
  )
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
  routePath,
  serveIndex,
}: {
  ownerId?: string
  routePath: string
  serveIndex?: boolean
}): DocsRouteReservation => ({
  ownerId,
  ownerType: 'docsGroup',
  reservesDescendants: false,
  route: routePath,
  ...(serveIndex ? {} : { allowBridge: true }),
})

export const findPageRouteCollisions = ({
  allowBridgePages = true,
  docsSetRouteBase,
  pages,
}: {
  allowBridgePages?: boolean
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
