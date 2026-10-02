import { describe, expect, it } from 'vitest'

import { resolvePayloadMarkdownDocsRoute } from '../next/route.js'
import { findDocsSetBySlug } from './docsSets.js'

const groups = [
  { id: 1, slug: 'loop-a', pageMode: 'auto', parent: 2, title: 'Loop A' },
  { id: 2, slug: 'loop-b', pageMode: 'auto', parent: 1, title: 'Loop B' },
]
const docsSets = [{ id: 10, slug: 'cyclic', _status: 'published', group: 1, title: 'Cyclic' }]

const payload = {
  find: ({ collection }: { collection: string }) =>
    Promise.resolve({
      docs: collection === 'docs-groups' ? groups : collection === 'docs-sets' ? docsSets : [],
    }),
}

describe('docs set route agreement between sync and the route adapter', () => {
  it('derives the same route base for a docs set in a cyclic group chain', async () => {
    const synced = await findDocsSetBySlug({
      slug: 'cyclic',
      collectionSlug: 'docs-sets',
      docsGroupsCollectionSlug: 'docs-groups',
      payload,
    })

    expect(synced).toMatchObject({
      groupPageMode: 'auto',
      groupRoutePath: '/loop-b/loop-a',
      routeBase: '/loop-b/loop-a/cyclic',
    })

    const served = await resolvePayloadMarkdownDocsRoute({
      path: synced?.routeBase,
      payload: payload as never,
    })

    expect(served).toMatchObject({
      type: 'docsSetIndex',
      docsSet: { routeBase: '/loop-b/loop-a/cyclic' },
    })
  })
})
