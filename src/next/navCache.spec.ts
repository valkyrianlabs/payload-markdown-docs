import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG } from '../constants.js'
import { getPayloadMarkdownDocsHeaderNavItems, getPayloadMarkdownDocsNavItems } from './links.js'

/** A tag-aware stand-in for the Next data cache. */
const cache = vi.hoisted(() => {
  const entries = new Map<string, { tags: string[]; value: unknown }>()

  return {
    entries,
    revalidateTag: (tag: string) => {
      for (const [key, entry] of entries) {
        if (entry.tags.includes(tag)) {
          entries.delete(key)
        }
      }
    },
    unstableCache: vi.fn(
      (
        callback: (...args: unknown[]) => Promise<unknown>,
        keyParts: string[] = [],
        options: { tags?: string[] } = {},
      ) =>
        async (...args: unknown[]) => {
          const key = JSON.stringify([keyParts, args])
          const hit = entries.get(key)

          if (hit) {
            return hit.value
          }

          const value = await callback(...args)

          entries.set(key, { tags: options.tags ?? [], value })

          return value
        },
    ),
  }
})

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: cache.revalidateTag,
  unstable_cache: cache.unstableCache,
}))

const createPayload = () => {
  const docsSets = [
    { id: 's1', slug: 'alpha', _status: 'published', title: 'Alpha' },
    { id: 's2', slug: 'beta', _status: 'published', title: 'Beta' },
  ]

  return {
    docsSets,
    find: vi.fn(({ collection }: { collection: string }) =>
      Promise.resolve({ docs: collection === 'docs-sets' ? docsSets.map((doc) => ({ ...doc })) : [] }),
    ),
  }
}

describe('docs nav cache', () => {
  beforeEach(() => {
    cache.entries.clear()
    cache.unstableCache.mockClear()
  })

  it('queries once across renders until the nav tag is revalidated', async () => {
    const payload = createPayload()

    const first = await getPayloadMarkdownDocsNavItems({ payload: payload as never })
    await getPayloadMarkdownDocsNavItems({ payload: payload as never })
    // Capacity is applied after the cached read, so header layouts share one entry.
    const capped = await getPayloadMarkdownDocsHeaderNavItems({ maxItems: 1, payload: payload as never })

    expect(first.map((item) => item.route)).toEqual(['/alpha', '/beta'])
    expect(capped).toHaveLength(1)
    expect(payload.find).toHaveBeenCalledTimes(2) // docs sets + docs groups, once
    expect(cache.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      expect.arrayContaining(['docs-sets', 'docs-groups', 'limit:1000']),
      { tags: [PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG] },
    )

    payload.docsSets[1].title = 'Beta 2'
    expect((await getPayloadMarkdownDocsNavItems({ payload: payload as never }))[1]?.label).toBe('Beta')

    cache.revalidateTag(PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG)

    expect((await getPayloadMarkdownDocsNavItems({ payload: payload as never }))[1]?.label).toBe('Beta 2')
    expect(payload.find).toHaveBeenCalledTimes(4)
  })

  it('never caches draft-aware reads or reads with cache: false', async () => {
    const payload = createPayload()

    await getPayloadMarkdownDocsNavItems({ includeDrafts: true, payload: payload as never })
    await getPayloadMarkdownDocsNavItems({ includeDrafts: true, payload: payload as never })
    await getPayloadMarkdownDocsNavItems({ cache: false, payload: payload as never })

    expect(cache.unstableCache).not.toHaveBeenCalled()
    expect(payload.find).toHaveBeenCalledTimes(6)
  })

  it('falls back to a direct read outside a Next runtime', async () => {
    const payload = createPayload()

    cache.unstableCache.mockImplementationOnce(() => () => {
      throw new Error('Invariant: incrementalCache missing in unstable_cache')
    })

    expect(await getPayloadMarkdownDocsNavItems({ payload: payload as never })).toHaveLength(2)
  })
})
