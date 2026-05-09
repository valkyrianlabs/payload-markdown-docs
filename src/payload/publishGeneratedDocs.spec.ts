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
              content: '# Draft\n',
              docsSet: 'set-1',
              sync: {
                archived: false,
              },
            },
            {
              id: 'published-1',
              _status: 'published',
              content: '# Published\n',
              docsSet: 'set-1',
              sync: {
                archived: false,
                contentHashAtLastSync:
                  'c8d2983a4f4aaf1aa12c8fb3cefa70a791e5d86f1127cdac4542ffcec0e8aa9c',
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
        markdownFieldName: 'content',
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
        sync: {
          archived: false,
          contentHashAtLastSync: 'c47fffce7ab6215da4633829b59605e9bdf14fb3d49b6ac0fe8105e639b9c4f9',
        },
      },
      overrideAccess: true,
    })
  })
})
