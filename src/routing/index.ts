export {
  DEFAULT_DOCS_SET_ROUTE_MODE,
  DEFAULT_PRODUCT_NESTED_DOCS_SEGMENT,
  deriveDocsSetProductRoutePath,
  deriveDocsSetRouteBase,
  isRouteDescendant,
  joinRouteSegments,
  normalizeRoutePath,
} from './paths.js'
export type { DocsSetRouteMode } from './paths.js'
export {
  createDocRouteReservations,
  createDocsGroupRouteReservation,
  createDocsSetRouteReservation,
  findPageRouteCollisions,
  findRouteReservationCollisions,
} from './reservations.js'
export type {
  DocsRouteCollision,
  DocsRouteCollisionReason,
  DocsRouteReservation,
  DocsRouteReservationOwnerType,
} from './reservations.js'
