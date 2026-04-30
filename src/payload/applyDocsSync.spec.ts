import { describe, expect, it, vi } from 'vitest'

import type { DocsDeleteBehavior, ValidatedDocsManifest } from '../sync/index.js'
import type { ExistingPayloadDocsRecord } from './existingDocs.js'

import { MANAGED_BY } from '../constants.js'
import {
  buildDocsManifest,
  planDocsSync,
  sha256Hex,
  validateDocsManifest,
} from '../sync/index.js'
import { applyDocsSync, assertApplyDeleteBehaviorSupported } from './applyDocsSync.js'
import { buildDocsData } from './docsData.js'
import { toExistingDocsRecord } from './existingDocs.js'

const now = new Date('2026-01-01T00:00:00.000Z')

const getValidatedManifest = (
  files = [
    {
      content: '# Home\n',
      path: 'index.md',
    },
  ],
): ValidatedDocsManifest => {
  const validation = validateDocsManifest(
    buildDocsManifest({
      files,
      sourceId: 'main-docs',
    }),
  )

  if (!validation.ok) {
    throw new Error('Expected test manifest to validate.')
  }

  return validation.data
}

const existingRecord = ({
  id = 'doc-1',
  archived = false,
  content = '# Home\n',
  managedBy = MANAGED_BY,
  sourceHashAtLastSync = sha256Hex(content),
  sourcePath = 'index.md',
}: {
  archived?: boolean
  content?: string
  id?: string
  managedBy?: string
  sourceHashAtLastSync?: string
  sourcePath?: string
} = {}): ExistingPayloadDocsRecord => ({
  id,
  archived,
  content,
  route: sourcePath === 'index.md' ? '/docs' : `/docs/${sourcePath.replace(/\.md$/, '')}`,
  sourceHash: sourceHashAtLastSync,
  sourcePath,
  sync: {
    archived,
    managedBy,
    sourceHashAtLastSync,
    sourceId: 'main-docs',
    sourcePath,
  },
  title: 'Home',
})

const createPayloadMock = () => ({
  create: vi.fn((args) => Promise.resolve({ id: 'created-doc', ...args.data })),
  update: vi.fn((args) => Promise.resolve({ id: args.id, ...args.data })),
})

describe('docs sync apply helpers', () => {
  it('maps validated files to docs collection data with configured markdown field', () => {
    const manifest = getValidatedManifest([
      {
        content:
          '---\ntitle: Install\nnavTitle: Install\ndescription: Install docs.\norder: 10\n---\n# Installation\n',
        path: 'getting-started/installation.md',
      },
    ])

    expect(
      buildDocsData({
        desired: manifest.files[0],
        manifest,
        markdownFieldName: 'body',
        now,
        syncRunId: 'sync-run-1',
      }),
    ).toMatchObject({
      body: '# Installation\n',
      depth: 1,
      description: 'Install docs.',
      navTitle: 'Install',
      order: 10,
      route: '/docs/getting-started/installation',
      sourcePath: 'getting-started/installation.md',
      sync: {
        archived: false,
        lastSyncRunId: 'sync-run-1',
        managedBy: MANAGED_BY,
        sourceId: 'main-docs',
      },
      title: 'Install',
    })
  })

  it('creates new docs', async () => {
    const manifest = getValidatedManifest()
    const payload = createPayloadMock()
    const plan = planDocsSync({
      desired: manifest,
      existing: [],
    })

    const result = await applyDocsSync({
      collectionSlug: 'docs',
      deleteBehavior: 'archive',
      existing: [],
      manifest,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      syncRunId: 'sync-run-1',
    })

    expect(result).toMatchObject({ ok: true, writes: { create: 1 } })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
        data: expect.objectContaining({
          content: '# Home\n',
          sync: expect.objectContaining({
            lastSyncRunId: 'sync-run-1',
            sourceHashAtLastSync: sha256Hex('# Home\n'),
          }),
        }),
      }),
    )
  })

  it('updates changed docs and skips unchanged docs', async () => {
    const manifest = getValidatedManifest([
      { content: '# Home changed\n', path: 'index.md' },
      { content: '# Same\n', path: 'same.md' },
    ])
    const existing = [
      existingRecord({ content: '# Home\n' }),
      existingRecord({ id: 'doc-2', content: '# Same\n', sourcePath: 'same.md' }),
    ]
    const payload = createPayloadMock()
    const plan = planDocsSync({
      desired: manifest,
      existing: existing.map(toExistingDocsRecord),
    })

    const result = await applyDocsSync({
      collectionSlug: 'docs',
      deleteBehavior: 'archive',
      existing,
      manifest,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
    })

    expect(result).toMatchObject({ ok: true, writes: { update: 1 } })
    expect(payload.update).toHaveBeenCalledTimes(1)
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'doc-1',
      }),
    )
  })

  it('unarchives an archived desired doc', async () => {
    const manifest = getValidatedManifest()
    const existing = [existingRecord({ archived: true })]
    const payload = createPayloadMock()
    const plan = planDocsSync({
      desired: manifest,
      existing: existing.map(toExistingDocsRecord),
    })

    const result = await applyDocsSync({
      collectionSlug: 'docs',
      deleteBehavior: 'archive',
      existing,
      manifest,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
    })

    expect(result).toMatchObject({ ok: true, writes: { reactivate: 1 } })
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sync: expect.objectContaining({
            archived: false,
            archivedAt: null,
          }),
        }),
      }),
    )
  })

  it('archives missing docs when delete behavior is archive', async () => {
    const manifest = getValidatedManifest()
    const existing = [existingRecord()]
    const payload = createPayloadMock()
    const desired = {
      ...manifest,
      files: [],
    }
    const plan = planDocsSync({
      desired,
      existing: existing.map(toExistingDocsRecord),
    })

    const result = await applyDocsSync({
      collectionSlug: 'docs',
      deleteBehavior: 'archive',
      existing,
      manifest: desired,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      syncRunId: 'sync-run-1',
    })

    expect(result).toMatchObject({ ok: true, writes: { archive: 1 } })
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'doc-1',
        data: expect.objectContaining({
          sync: expect.objectContaining({
            archived: true,
            lastSyncRunId: 'sync-run-1',
          }),
        }),
      }),
    )
  })

  it('ignores missing docs when delete behavior is ignore', async () => {
    const desired = {
      ...getValidatedManifest(),
      files: [],
    }
    const existing = [existingRecord()]
    const payload = createPayloadMock()
    const plan = planDocsSync({
      deleteBehavior: 'ignore',
      desired,
      existing: existing.map(toExistingDocsRecord),
    })

    const result = await applyDocsSync({
      collectionSlug: 'docs',
      deleteBehavior: 'ignore',
      existing,
      manifest: desired,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
    })

    expect(result).toMatchObject({ ok: true, writes: { archive: 0 } })
    expect(payload.update).not.toHaveBeenCalled()
  })

  it.each<DocsDeleteBehavior>(['delete', 'draft'])(
    'rejects %s delete behavior as unsupported for apply',
    (deleteBehavior) => {
      expect(assertApplyDeleteBehaviorSupported(deleteBehavior)).toBe(false)
    },
  )

  it('detects manual content conflicts and aborts before writes', async () => {
    const manifest = getValidatedManifest([{ content: '# New\n', path: 'index.md' }])
    const existing = [
      existingRecord({
        content: '# Manually edited\n',
        sourceHashAtLastSync: sha256Hex('# Old\n'),
      }),
    ]
    const payload = createPayloadMock()
    const plan = planDocsSync({
      desired: manifest,
      existing: existing.map(toExistingDocsRecord),
    })

    const result = await applyDocsSync({
      collectionSlug: 'docs',
      deleteBehavior: 'archive',
      existing,
      manifest,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
    })

    expect(result).toMatchObject({
      conflicts: [{ reason: 'current_content_hash_mismatch' }],
      ok: false,
    })
    expect(payload.create).not.toHaveBeenCalled()
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('detects unmanaged record conflicts', async () => {
    const manifest = getValidatedManifest([{ content: '# New\n', path: 'index.md' }])
    const existing = [existingRecord({ managedBy: 'someone-else' })]
    const payload = createPayloadMock()
    const plan = planDocsSync({
      desired: manifest,
      existing: existing.map(toExistingDocsRecord),
    })

    const result = await applyDocsSync({
      collectionSlug: 'docs',
      deleteBehavior: 'archive',
      existing,
      manifest,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
    })

    expect(result).toMatchObject({
      conflicts: [{ reason: 'unmanaged_record' }],
      ok: false,
    })
  })
})
