import { describe, expect, it, vi } from 'vitest'

import type { ExistingPayloadDocsRecord } from './existingDocs.js'

import { buildDocsManifest, planDocsSync, validateDocsManifest } from '../sync/index.js'
import { resolveDocsRouteClaims, toReleasedRoute } from './routeClaims.js'
import { runInSyncTransaction } from './transaction.js'

const manifestFor = (files: { content: string; path: string }[], publish = true) => {
  const validation = validateDocsManifest(
    buildDocsManifest({ files, publish, sourceId: 'main-docs' }),
  )

  if (!validation.ok) {
    throw new Error('invalid test manifest')
  }

  return validation.data
}

const existingRecord = (
  id: string,
  sourcePath: string,
  route: string,
  archived = false,
): ExistingPayloadDocsRecord => ({
  id,
  archived,
  route,
  sourceHash: 'old',
  sourcePath,
  status: 'published',
})

describe('resolveDocsRouteClaims', () => {
  it('releases a same-set doc that moves away and rejects other owners', async () => {
    const desired = manifestFor([
      { content: '---\nslug: guide\n---\n# A\n', path: 'a.md' },
      { content: '---\nslug: other\n---\n# B\n', path: 'b.md' },
    ])
    const existing = [existingRecord('1', 'a.md', '/docs/a'), existingRecord('2', 'b.md', '/docs/guide')]
    const plan = planDocsSync({ deleteBehavior: 'archive', desired, existing })
    const find = vi.fn(() =>
      Promise.resolve({
        docs: [
          { id: '2', _status: 'published', route: '/docs/guide', sourcePath: 'b.md' },
          { id: '99', _status: 'published', route: '/docs/other', sourcePath: 'x.md' },
        ],
      }),
    )

    const result = await resolveDocsRouteClaims({
      collectionSlug: 'docs',
      deleteBehavior: 'archive',
      existing,
      payload: { find },
      plan,
      writesMainForUpdates: true,
    })

    expect(find).toHaveBeenCalledWith(expect.objectContaining({ draft: false, pagination: false }))
    expect(result.releases).toEqual([{ id: '2', route: 'archived:2:/docs/guide' }])
    expect(result.collisions).toEqual([
      { reason: 'existing_doc_route_collision', route: '/docs/other' },
    ])
  })

  it('rejects claiming a route still served by a published doc that this sync does not publish', async () => {
    const desired = manifestFor(
      [
        { content: '---\nslug: guide-old\n---\n# A\n', path: 'guide.md' },
        { content: '---\nslug: guide\n---\n# N\n', path: 'new.md' },
      ],
      false,
    )
    const existing = [existingRecord('1', 'guide.md', '/docs/guide')]
    const plan = planDocsSync({ deleteBehavior: 'archive', desired, existing })

    const result = await resolveDocsRouteClaims({
      collectionSlug: 'docs',
      deleteBehavior: 'archive',
      existing,
      payload: {
        find: () =>
          Promise.resolve({
            docs: [{ id: '1', _status: 'published', route: '/docs/guide', sourcePath: 'guide.md' }],
          }),
      },
      plan,
      writesMainForUpdates: false,
    })

    expect(result.releases).toEqual([])
    expect(result.collisions).toEqual([
      { reason: 'route_retained_by_published_doc', route: '/docs/guide', sourcePath: 'guide.md' },
    ])
  })

  it('never double-wraps released routes', () => {
    expect(toReleasedRoute('7', toReleasedRoute('7', '/docs/a'))).toBe('archived:7:/docs/a')
  })
})

describe('runInSyncTransaction', () => {
  it('commits on success and rolls back on failure', async () => {
    const db = {
      beginTransaction: vi.fn(() => Promise.resolve('tx-1')),
      commitTransaction: vi.fn(() => Promise.resolve()),
      rollbackTransaction: vi.fn(() => Promise.resolve()),
    }

    await expect(
      runInSyncTransaction({
        payload: { db },
        work: (req) => Promise.resolve(req.transactionID),
      }),
    ).resolves.toEqual({ result: 'tx-1', transactional: true })
    expect(db.commitTransaction).toHaveBeenCalledWith('tx-1')

    await expect(
      runInSyncTransaction({
        payload: { db },
        work: () => Promise.reject(new Error('boom')),
      }),
    ).rejects.toThrow('boom')
    expect(db.rollbackTransaction).toHaveBeenCalledWith('tx-1')
  })

  it('runs without a transaction when the adapter has none', async () => {
    await expect(
      runInSyncTransaction({ payload: {}, work: () => Promise.resolve('ok') }),
    ).resolves.toEqual({ result: 'ok', transactional: false })
  })
})
