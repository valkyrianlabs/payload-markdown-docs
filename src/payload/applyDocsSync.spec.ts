import { describe, expect, it, vi } from 'vitest'

import type { DocsDeleteBehavior, ValidatedDocsManifest } from '../sync/index.js'
import type { ExistingPayloadDocsRecord } from './existingDocs.js'

import { MANAGED_BY } from '../constants.js'
import { buildDocsManifest, planDocsSync, sha256Hex, validateDocsManifest } from '../sync/index.js'
import { applyDocsSync, assertApplyDeleteBehaviorSupported } from './applyDocsSync.js'
import { buildDocsData } from './docsData.js'
import { findDocsSetBySlug } from './docsSets.js'
import { findExistingPayloadDocsRecords, toExistingDocsRecord } from './existingDocs.js'

const now = new Date('2026-01-01T00:00:00.000Z')

const getValidatedManifest = (
  files = [
    {
      content: '# Home\n',
      path: 'index.md',
    },
  ],
  publish = false,
): ValidatedDocsManifest => {
  const validation = validateDocsManifest(
    buildDocsManifest({
      files,
      publish,
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
  contentHashAtLastSync = sha256Hex(content),
  managedBy = MANAGED_BY,
  sourceHashAtLastSync = sha256Hex(content),
  sourcePath = 'index.md',
  status,
}: {
  archived?: boolean
  content?: string
  contentHashAtLastSync?: string
  id?: string
  managedBy?: string
  sourceHashAtLastSync?: string
  sourcePath?: string
  status?: 'draft' | 'published'
} = {}): ExistingPayloadDocsRecord => ({
  id,
  archived,
  content,
  route: sourcePath === 'index.md' ? '/docs' : `/docs/${sourcePath.replace(/\.md$/, '')}`,
  sourceHash: sourceHashAtLastSync,
  sourcePath,
  status,
  sync: {
    archived,
    contentHashAtLastSync,
    managedBy,
    sourceHashAtLastSync,
    sourceId: 'main-docs',
    sourcePath,
  },
  title: 'Home',
})

const createPayloadMock = () => ({
  create: vi.fn((args) => Promise.resolve({ id: 'created-doc', ...args.data })),
  delete: vi.fn((args) => Promise.resolve({ id: args.id })),
  update: vi.fn((args) => Promise.resolve({ id: args.id, ...args.data })),
})

describe('docs sync apply helpers', () => {
  it('filters existing docs by docs set when a docs set is resolved', async () => {
    const payload = {
      find: vi.fn(() =>
        Promise.resolve({
          docs: [],
        }),
      ),
    }

    await findExistingPayloadDocsRecords({
      collectionSlug: 'docs',
      docsSetId: 'docs-set-1',
      markdownFieldName: 'content',
      payload,
      sourceId: 'main-docs',
    })

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
        where: {
          or: [
            {
              docsSet: {
                equals: 'docs-set-1',
              },
            },
            {
              'sync.sourceId': {
                equals: 'main-docs',
              },
            },
          ],
        },
      }),
    )
  })

  it('preserves numeric docs set ids from Payload records', async () => {
    const payload = {
      find: vi.fn(({ collection }) =>
        Promise.resolve({
          docs:
            collection === 'docs-sets'
              ? [
                  {
                    id: 123,
                    slug: 'main-docs',
                    branch: 'main',
                  },
                ]
              : [],
        }),
      ),
    }

    await expect(
      findDocsSetBySlug({
        slug: 'main-docs',
        collectionSlug: 'docs-sets',
        docsGroupsCollectionSlug: 'docs-groups',
        payload,
      }),
    ).resolves.toMatchObject({
      id: 123,
    })
  })

  it('maps validated files to docs collection data with configured markdown field', () => {
    const manifest = getValidatedManifest([
      {
        content:
          '---\ntitle: Install\nnavTitle: Install\ndescription: Install docs.\norder: 10\ndependencies:\n  - "@valkyrianlabs/payload-markdown"\n---\n# Installation\n',
        path: 'getting-started/installation.md',
      },
    ])

    expect(
      buildDocsData({
        desired: manifest.files[0],
        docsEnableDrafts: false,
        manifest,
        markdownFieldName: 'body',
        now,
        publish: false,
        syncRunId: 'sync-run-1',
      }),
    ).toMatchObject({
      body: '# Installation\n',
      dependencies: ['@valkyrianlabs/payload-markdown'],
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
      docsEnableDrafts: false,
      existing: [],
      manifest,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      publish: false,
      syncRunId: 456,
    })

    expect(result).toMatchObject({ ok: true, writes: { create: 1 } })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
        data: expect.objectContaining({
          content: '# Home\n',
          sync: expect.objectContaining({
            contentHashAtLastSync: sha256Hex('# Home\n'),
            lastSyncRunId: 456,
            sourceHashAtLastSync: sha256Hex('# Home\n'),
          }),
        }),
      }),
    )
    expect(payload.create.mock.calls[0]?.[0].data).not.toHaveProperty('_status')
  })

  it('writes docsSet relationships when a sync resolves to a docs set', async () => {
    const manifest = getValidatedManifest()
    const payload = createPayloadMock()
    const plan = planDocsSync({
      desired: manifest,
      existing: [],
    })

    await applyDocsSync({
      collectionSlug: 'docs',
      deleteBehavior: 'archive',
      docsEnableDrafts: false,
      docsSetId: 123,
      existing: [],
      manifest,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      publish: false,
    })

    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          docsSet: 123,
        }),
      }),
    )
  })

  it('creates draft docs when publish is not requested', async () => {
    const manifest = getValidatedManifest()
    const payload = createPayloadMock()
    const plan = planDocsSync({
      desired: manifest,
      existing: [],
    })

    const result = await applyDocsSync({
      collectionSlug: 'docs',
      deleteBehavior: 'archive',
      docsEnableDrafts: true,
      existing: [],
      manifest,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      publish: false,
    })

    expect(result).toMatchObject({ ok: true, writes: { create: 1 } })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          _status: 'draft',
        }),
        draft: true,
      }),
    )
  })

  it('creates published docs when publish is requested', async () => {
    const manifest = getValidatedManifest(undefined, true)
    const payload = createPayloadMock()
    const plan = planDocsSync({
      desired: manifest,
      existing: [],
    })

    await applyDocsSync({
      collectionSlug: 'docs',
      deleteBehavior: 'archive',
      docsEnableDrafts: true,
      existing: [],
      manifest,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      publish: true,
    })

    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          _status: 'published',
        }),
        draft: false,
      }),
    )
  })

  it('publishes unchanged draft docs when publish is requested', async () => {
    const manifest = getValidatedManifest(undefined, true)
    const existing = [existingRecord({ status: 'draft' })]
    const payload = createPayloadMock()
    const plan = planDocsSync({
      desired: manifest,
      existing: existing.map(toExistingDocsRecord),
    })

    const result = await applyDocsSync({
      collectionSlug: 'docs',
      deleteBehavior: 'archive',
      docsEnableDrafts: true,
      existing,
      manifest,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      publish: true,
    })

    expect(result).toMatchObject({ ok: true, writes: { update: 1 } })
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          _status: 'published',
        }),
        draft: false,
      }),
    )
  })

  it('sets synced docs to draft when publish is not requested', async () => {
    const manifest = getValidatedManifest([
      { content: '# Changed\n', path: 'index.md' },
      { content: '# New\n', path: 'new.md' },
    ])
    const existing = [existingRecord({ content: '# Old\n', status: 'published' })]
    const payload = createPayloadMock()
    const plan = planDocsSync({
      desired: manifest,
      existing: existing.map(toExistingDocsRecord),
    })

    await applyDocsSync({
      collectionSlug: 'docs',
      deleteBehavior: 'archive',
      docsEnableDrafts: true,
      existing,
      manifest,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      publish: false,
    })

    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'doc-1',
        data: expect.objectContaining({
          _status: 'draft',
        }),
        draft: true,
      }),
    )
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          _status: 'draft',
        }),
        draft: true,
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
      docsEnableDrafts: false,
      existing,
      manifest,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      publish: false,
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
      docsEnableDrafts: false,
      existing,
      manifest,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      publish: false,
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
      docsEnableDrafts: false,
      existing,
      manifest: desired,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      publish: false,
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
      docsEnableDrafts: false,
      existing,
      manifest: desired,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      publish: false,
    })

    expect(result).toMatchObject({ ok: true, writes: { archive: 0 } })
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('drafts and archives missing docs when delete behavior is draft', async () => {
    const desired = {
      ...getValidatedManifest(),
      files: [],
    }
    const existing = [existingRecord({ status: 'published' })]
    const payload = createPayloadMock()
    const plan = planDocsSync({
      deleteBehavior: 'draft',
      desired,
      existing: existing.map(toExistingDocsRecord),
    })

    const result = await applyDocsSync({
      collectionSlug: 'docs',
      deleteBehavior: 'draft',
      docsEnableDrafts: true,
      existing,
      manifest: desired,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      publish: false,
    })

    expect(result).toMatchObject({ ok: true, writes: { draft: 1 } })
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          _status: 'draft',
          sync: expect.objectContaining({
            archived: true,
          }),
        }),
        draft: true,
      }),
    )
  })

  it('hard deletes missing docs when delete behavior is delete', async () => {
    const desired = {
      ...getValidatedManifest(),
      files: [],
    }
    const existing = [existingRecord()]
    const payload = createPayloadMock()
    const plan = planDocsSync({
      deleteBehavior: 'delete',
      desired,
      existing: existing.map(toExistingDocsRecord),
    })

    const result = await applyDocsSync({
      collectionSlug: 'docs',
      deleteBehavior: 'delete',
      docsEnableDrafts: false,
      existing,
      manifest: desired,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      publish: false,
    })

    expect(result).toMatchObject({ ok: true, writes: { delete: 1 } })
    expect(payload.delete).toHaveBeenCalledWith({
      id: 'doc-1',
      collection: 'docs',
      overrideAccess: true,
    })
  })

  it.each<DocsDeleteBehavior>(['delete', 'draft'])(
    'requires explicit support for %s delete behavior',
    (deleteBehavior) => {
      expect(assertApplyDeleteBehaviorSupported(deleteBehavior)).toBe(false)
    },
  )

  it('detects hard-delete conflicts and aborts before writes', async () => {
    const desired = {
      ...getValidatedManifest(),
      files: [],
    }
    const existing = [
      existingRecord({
        content: '# Manual edit\n',
        contentHashAtLastSync: sha256Hex('# Old\n'),
        sourceHashAtLastSync: sha256Hex('# Old\n'),
      }),
    ]
    const payload = createPayloadMock()
    const plan = planDocsSync({
      deleteBehavior: 'delete',
      desired,
      existing: existing.map(toExistingDocsRecord),
    })

    const result = await applyDocsSync({
      collectionSlug: 'docs',
      deleteBehavior: 'delete',
      docsEnableDrafts: false,
      existing,
      manifest: desired,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      publish: false,
    })

    expect(result).toMatchObject({
      conflicts: [{ reason: 'current_content_hash_mismatch' }],
      ok: false,
    })
    expect(payload.delete).not.toHaveBeenCalled()
  })

  it('detects manual content conflicts and aborts before writes', async () => {
    const manifest = getValidatedManifest([{ content: '# New\n', path: 'index.md' }])
    const existing = [
      existingRecord({
        content: '# Manually edited\n',
        contentHashAtLastSync: sha256Hex('# Old\n'),
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
      docsEnableDrafts: false,
      existing,
      manifest,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      publish: false,
    })

    expect(result).toMatchObject({
      conflicts: [{ reason: 'current_content_hash_mismatch' }],
      ok: false,
    })
    expect(payload.create).not.toHaveBeenCalled()
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('allows legacy records that only stored the raw source hash before content hash tracking', async () => {
    const previousManifest = getValidatedManifest([
      {
        content: '---\ntitle: Home\n---\n# Old\n',
        path: 'index.md',
      },
    ])
    const manifest = getValidatedManifest([
      {
        content: '---\ntitle: Home\n---\n# New\n',
        path: 'index.md',
      },
    ])
    const previousSourceHash = previousManifest.files[0]?.sha256 ?? ''
    const existing = [
      existingRecord({
        content: '# Old\n',
        contentHashAtLastSync: undefined,
        sourceHashAtLastSync: previousSourceHash,
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
      docsEnableDrafts: false,
      existing,
      manifest,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      publish: false,
    })

    expect(result).toMatchObject({
      ok: true,
      writes: { update: 1 },
    })
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: '# New\n',
          sync: expect.objectContaining({
            contentHashAtLastSync: sha256Hex('# New\n'),
            sourceHashAtLastSync: manifest.files[0]?.sha256,
          }),
        }),
      }),
    )
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
      docsEnableDrafts: false,
      existing,
      manifest,
      markdownFieldName: 'content',
      now,
      payload,
      plan,
      publish: false,
    })

    expect(result).toMatchObject({
      conflicts: [{ reason: 'unmanaged_record' }],
      ok: false,
    })
  })
})
