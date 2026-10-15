import { describe, expect, it } from 'vitest'

import {
  inferStaleAssetProductRoute,
  inferStaleDocsRouteBase,
  parseStoredDocsRoute,
  planAssetRouteRewrite,
  planDocsRouteRewrite,
  toPendingRoute,
} from './docsRouteRewrite.js'

const plan = (route: string, sourcePath: string, target: string, staleBases: string[] = []) =>
  planDocsRouteRewrite({ route, sourcePath, staleBases, target })

describe('planDocsRouteRewrite', () => {
  it('re-derives routes synced under a stale base (group change)', () => {
    expect(plan('/a/x/guide/intro', 'guide/intro.md', '/b/x', ['/a/x'])).toEqual({
      route: '/b/x/guide/intro',
      status: 'move',
    })
    expect(plan('/a/x', 'index.md', '/b/x', ['/a/x'])).toEqual({ route: '/b/x', status: 'move' })
  })

  it('keeps frontmatter slugs', () => {
    expect(plan('/a/x/guide/custom', 'guide/page.md', '/b/x', ['/a/x'])).toEqual({
      route: '/b/x/guide/custom',
      status: 'move',
    })
    // index.md with a slug contributes one segment; the prefix fallback keeps it.
    expect(plan('/a/x/intro', 'index.md', '/b/x', ['/a/x'])).toEqual({
      route: '/b/x/intro',
      status: 'move',
    })
  })

  it('keeps routes that are current for the target base', () => {
    expect(plan('/b/x/guide', 'guide.md', '/b/x', ['/a/x'])).toEqual({ status: 'keep' })
    expect(plan('/b/x', 'index.md', '/b/x', [])).toEqual({ status: 'keep' })
  })

  it('rewrites the route embedded in a released tombstone and keeps the tombstone', () => {
    expect(plan('archived:7:/a/x/old', 'old.md', '/b/x', ['/a/x'])).toEqual({
      route: 'archived:7:/b/x/old',
      status: 'move',
    })
    expect(plan('archived:7:/b/x/old', 'old.md', '/b/x', ['/a/x'])).toEqual({ status: 'keep' })
  })

  it('handles a docs-root -> product-nested switch (target nested in the old base)', () => {
    expect(plan('/x/y', 'y.md', '/x/docs', ['/x'])).toEqual({ route: '/x/docs/y', status: 'move' })
    // A source folder named "docs" was at /x/docs/... before the switch.
    expect(plan('/x/docs/y', 'docs/y.md', '/x/docs', ['/x'])).toEqual({
      route: '/x/docs/docs/y',
      status: 'move',
    })
    // Already moved index-with-slug docs stay where they are.
    expect(plan('/x/docs/intro', 'index.md', '/x/docs', ['/x'])).toEqual({ status: 'keep' })
  })

  it('handles a product-nested -> docs-root switch (old base nested in the target)', () => {
    expect(plan('/x/docs/y', 'y.md', '/x', ['/x/docs'])).toEqual({ route: '/x/y', status: 'move' })
    // The plain index of the old base, not a page with frontmatter slug "docs".
    expect(plan('/x/docs', 'index.md', '/x', ['/x/docs'])).toEqual({ route: '/x', status: 'move' })
    expect(plan('/x/docs/intro', 'index.md', '/x', ['/x/docs'])).toEqual({
      route: '/x/intro',
      status: 'move',
    })
  })

  it('reports routes outside every known base as unresolved', () => {
    expect(plan('/elsewhere/page', 'page.md', '/b/x', ['/a/x'])).toEqual({ status: 'unresolved' })
    expect(plan('not-a-route', 'page.md', '/b/x', ['/a/x'])).toEqual({ status: 'unresolved' })
  })

  it('finishes a pending placeholder left by an interrupted rewrite', () => {
    expect(parseStoredDocsRoute(toPendingRoute('9', '/b/x/page'))).toEqual({
      pending: true,
      route: '/b/x/page',
    })
    expect(plan(toPendingRoute('9', '/b/x/page'), 'page.md', '/b/x', [])).toEqual({
      route: '/b/x/page',
      status: 'move',
    })
  })
})

describe('inferStaleDocsRouteBase', () => {
  it('infers the base stale docs were synced under by majority', () => {
    expect(
      inferStaleDocsRouteBase({
        records: [
          { id: '1', route: '/old/x', sourcePath: 'index.md' },
          { id: '2', route: '/old/x/guide', sourcePath: 'guide.md' },
          { id: '3', route: '/old/x/a/b', sourcePath: 'a/b.md' },
          { id: '4', route: '/old/x/intro', sourcePath: 'index.md' },
          { id: '5', route: 'archived:5:/old/x/gone', sourcePath: 'gone.md' },
        ],
        target: '/new/x',
      }),
    ).toBe('/old/x')
  })

  it('returns nothing when every route is current', () => {
    expect(
      inferStaleDocsRouteBase({
        records: [
          { id: '1', route: '/new/x', sourcePath: 'index.md' },
          { id: '2', route: '/new/x/guide', sourcePath: 'guide.md' },
        ],
        target: '/new/x',
      }),
    ).toBeUndefined()
  })
})

describe('asset routes', () => {
  const skill = {
    id: 's',
    kind: 'skill',
    route: '/a/x/skills/claude/SKILL.md',
    sourceId: 'x',
    sourcePath: 'skills/x/claude/SKILL.md',
  }

  it('re-derives skill routes and keeps root llms files', () => {
    expect(planAssetRouteRewrite({ asset: skill, staleProductRoutes: [], target: '/b/x' })).toEqual({
      route: '/b/x/skills/claude/SKILL.md',
      status: 'move',
    })
    expect(
      planAssetRouteRewrite({
        asset: { id: 'l', kind: 'llms', route: '/llms.txt' },
        staleProductRoutes: ['/a/x'],
        target: '/b/x',
      }),
    ).toEqual({ status: 'keep' })
    expect(
      planAssetRouteRewrite({
        asset: { id: 'l', kind: 'llms-full', route: '/a/x/llms-full.txt' },
        staleProductRoutes: ['/a/x'],
        target: '/b/x',
      }),
    ).toEqual({ route: '/b/x/llms-full.txt', status: 'move' })
  })

  it('moves static assets below a stale product route', () => {
    expect(
      planAssetRouteRewrite({
        asset: { id: 'f', kind: 'static', route: '/a/x/files/a.txt' },
        staleProductRoutes: ['/a/x'],
        target: '/b/x',
      }),
    ).toEqual({ route: '/b/x/files/a.txt', status: 'move' })
    expect(
      planAssetRouteRewrite({
        asset: { id: 'f', kind: 'static', route: '/b/x/files/a.txt' },
        staleProductRoutes: ['/a/x'],
        target: '/b/x',
      }),
    ).toEqual({ status: 'keep' })
  })

  it('infers the stale product route from skill and llms assets', () => {
    expect(
      inferStaleAssetProductRoute({
        assets: [skill, { id: 'l', kind: 'llms', route: '/a/x/llms.txt' }, { id: 'r', kind: 'llms', route: '/llms.txt' }],
        target: '/b/x',
      }),
    ).toBe('/a/x')
  })
})
