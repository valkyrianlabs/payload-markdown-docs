import { describe, expect, it, vi } from 'vitest'

import { publishGeneratedDocsForSet } from './publishGeneratedDocs.js'

describe('publishGeneratedDocsForSet', () => {
  it('publishes draft generated docs for one docs set and skips archived docs', async () => {
    const payload = {
      find: vi.fn(() =>
        Promise.resolve({
          docs: [
            {
              id: 'draft-1',
              _status: 'draft',
              docsSet: 'set-1',
              sync: {
                archived: false,
              },
            },
            {
              id: 'published-1',
              _status: 'published',
              docsSet: 'set-1',
              sync: {
                archived: false,
              },
            },
            {
              id: 'archived-1',
              _status: 'draft',
              docsSet: 'set-1',
              sync: {
                archived: true,
              },
            },
            {
              id: 'other-set',
              _status: 'draft',
              docsSet: 'set-2',
              sync: {
                archived: false,
              },
            },
          ],
        }),
      ),
      update: vi.fn(() => Promise.resolve({})),
    }

    await expect(
      publishGeneratedDocsForSet({
        docsCollectionSlug: 'docs',
        docsSetId: 'set-1',
        payload,
      }),
    ).resolves.toEqual({
      archived: 1,
      drafts: 1,
      published: 2,
      total: 3,
      updated: 1,
    })

    expect(payload.find).toHaveBeenCalledWith({
      collection: 'docs',
      depth: 0,
      limit: 1000,
      overrideAccess: true,
      where: {
        docsSet: {
          equals: 'set-1',
        },
      },
    })
    expect(payload.update).toHaveBeenCalledWith({
      id: 'draft-1',
      collection: 'docs',
      data: {
        _status: 'published',
      },
      overrideAccess: true,
    })
  })
})
