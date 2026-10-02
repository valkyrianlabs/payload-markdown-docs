import { describe, expect, it } from 'vitest'

import {
  getDocsGroupRoutePath,
  indexDocsGroupsById,
  resolveDocsGroupRoutePath,
  resolveDocsSetRoutes,
} from './docsSetRoutes.js'
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

describe('docs group and docs set route derivation', () => {
  const groups = indexDocsGroupsById([
    { id: 1, slug: 'platform' },
    { id: 2, slug: 'sdk', parent: 1 },
    { id: 3, slug: ' tools ', parent: { id: 2, slug: 'sdk' } },
    { id: 4, slug: 'orphan', parent: 99 },
    { id: 5, slug: 'loop-a', parent: 6 },
    { id: 6, slug: 'loop-b', parent: 5 },
    { id: 7, slug: 'self', parent: 7 },
    { id: 8, slug: '   ', parent: 1 },
  ])

  it('walks parent chains through ids and populated relationships', () => {
    expect(getDocsGroupRoutePath({ group: 1, groupsById: groups })).toBe('/platform')
    expect(getDocsGroupRoutePath({ group: '2', groupsById: groups })).toBe('/platform/sdk')
    expect(getDocsGroupRoutePath({ group: { id: 3 }, groupsById: groups })).toBe(
      '/platform/sdk/tools',
    )
  })

  it('ignores unresolvable parents and groups without a usable slug', () => {
    expect(getDocsGroupRoutePath({ group: 4, groupsById: groups })).toBe('/orphan')
    expect(getDocsGroupRoutePath({ group: 8, groupsById: groups })).toBeUndefined()
    expect(getDocsGroupRoutePath({ group: 42, groupsById: groups })).toBeUndefined()
    expect(getDocsGroupRoutePath({ group: undefined, groupsById: groups })).toBeUndefined()
  })

  it('stops a parent cycle at the first revisited group', () => {
    expect(getDocsGroupRoutePath({ group: 5, groupsById: groups })).toBe('/loop-b/loop-a')
    expect(getDocsGroupRoutePath({ group: 6, groupsById: groups })).toBe('/loop-a/loop-b')
    expect(getDocsGroupRoutePath({ group: 7, groupsById: groups })).toBe('/self')
  })

  it('honors a stored routePath in populated walks', () => {
    expect(
      resolveDocsGroupRoutePath({ slug: 'ignored', routePath: 'stored/route/' }, (reference) =>
        reference && typeof reference === 'object'
          ? (reference as { routePath?: string; slug?: string })
          : undefined,
      ),
    ).toBe('/stored/route')
  })

  it('derives docs set routes for both route modes', () => {
    expect(resolveDocsSetRoutes({ doc: { slug: 'alpha' }, groupsById: groups })).toEqual({
      slug: 'alpha',
      groupId: undefined,
      groupRoutePath: undefined,
      productRoute: '/alpha',
      routeBase: '/alpha',
      routeMode: 'docs-root',
    })
    expect(
      resolveDocsSetRoutes({
        doc: { slug: ' beta ', group: { id: 2 }, routeMode: 'product-nested' },
        groupsById: groups,
      }),
    ).toEqual({
      slug: 'beta',
      groupId: '2',
      groupRoutePath: '/platform/sdk',
      productRoute: '/platform/sdk/beta',
      routeBase: '/platform/sdk/beta/docs',
      routeMode: 'product-nested',
    })
    expect(
      resolveDocsSetRoutes({ doc: { slug: 'x', group: 42, routeMode: 'bogus' }, groupsById: groups }),
    ).toMatchObject({ groupId: '42', groupRoutePath: undefined, routeBase: '/x', routeMode: 'docs-root' })
    expect(resolveDocsSetRoutes({ doc: { slug: '  ' }, groupsById: groups })).toBeUndefined()
  })
})
