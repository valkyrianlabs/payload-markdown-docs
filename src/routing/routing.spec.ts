import { describe, expect, it } from 'vitest'

import {
  deriveDocsSetRouteBase,
  findPageRouteCollisions,
  findRouteReservationCollisions,
  isRouteDescendant,
  joinRouteSegments,
  normalizeRoutePath,
} from './index.js'

describe('route path helpers', () => {
  it('normalizes route paths', () => {
    expect(normalizeRoutePath('plugins/')).toBe('/plugins')
    expect(normalizeRoutePath('/internal//tools/')).toBe('/internal/tools')
    expect(normalizeRoutePath('/')).toBe('/')
  })

  it('joins route segments', () => {
    expect(joinRouteSegments('/plugins/', '/payload-markdown/')).toBe(
      '/plugins/payload-markdown',
    )
  })

  it('derives docs set route bases', () => {
    expect(
      deriveDocsSetRouteBase({
        docsSetSlug: 'payload-markdown',
        groupRoutePath: '/plugins',
      }),
    ).toBe('/plugins/payload-markdown')
    expect(
      deriveDocsSetRouteBase({
        docsSetSlug: 'payload-markdown',
        groupRoutePath: '/plugins',
        routeMode: 'product-nested',
      }),
    ).toBe('/plugins/payload-markdown/docs')
  })

  it('detects descendants without treating exact routes as descendants', () => {
    expect(isRouteDescendant('/plugins', '/plugins/payload-markdown')).toBe(true)
    expect(isRouteDescendant('/plugins', '/plugins')).toBe(false)
  })
})

describe('route reservation helpers', () => {
  it('detects exact route collisions', () => {
    const collisions = findRouteReservationCollisions([
      {
        ownerId: 'set-a',
        ownerType: 'docsSet',
        route: '/plugins/payload-markdown',
      },
      {
        ownerId: 'set-b',
        ownerType: 'docsSet',
        route: '/plugins/payload-markdown/',
      },
    ])

    expect(collisions).toHaveLength(1)
    expect(collisions[0]?.reason).toBe('exact_route_collision')
  })

  it('detects descendant route collisions', () => {
    const collisions = findRouteReservationCollisions([
      {
        ownerId: 'set-a',
        ownerType: 'docsSet',
        reservesDescendants: true,
        route: '/plugins',
      },
      {
        ownerId: 'set-b',
        ownerType: 'docsSet',
        route: '/plugins/payload-markdown',
      },
    ])

    expect(collisions).toHaveLength(1)
    expect(collisions[0]?.reason).toBe('descendant_route_collision')
  })

  it('allows ancestor page routes but rejects pages inside docs set namespaces', () => {
    const collisions = findPageRouteCollisions({
      docsSetRouteBase: '/plugins/payload-markdown',
      pages: [
        {
          id: 'plugins-page',
          route: '/plugins',
        },
        {
          id: 'themes-page',
          route: '/plugins/payload-markdown/configuration/themes',
        },
      ],
    })

    expect(collisions).toHaveLength(1)
    expect(collisions[0]?.reason).toBe('descendant_route_collision')
  })

  it('allows exact bridge page routes when bridge pages are enabled', () => {
    const collisions = findPageRouteCollisions({
      allowBridgePages: true,
      docsSetRouteBase: '/plugins/payload-markdown',
      pages: [
        {
          id: 'bridge-page',
          bridge: true,
          route: '/plugins/payload-markdown',
        },
      ],
    })

    expect(collisions).toHaveLength(0)
  })

  it('checks auto group page reservations without claiming custom group routes', () => {
    expect(
      findPageRouteCollisions({
        docsGroupRoutes: [
          {
            pageMode: 'auto',
            routePath: '/plugins',
          },
        ],
        docsSetRouteBase: '/plugins/payload-markdown',
        pages: [
          {
            id: 'plugins-page',
            route: '/plugins',
          },
        ],
      }),
    ).toHaveLength(1)

    expect(
      findPageRouteCollisions({
        docsGroupRoutes: [
          {
            pageMode: 'custom',
            routePath: '/plugins',
          },
        ],
        docsSetRouteBase: '/plugins/payload-markdown',
        pages: [
          {
            id: 'plugins-page',
            route: '/plugins',
          },
        ],
      }),
    ).toHaveLength(0)
  })
})
