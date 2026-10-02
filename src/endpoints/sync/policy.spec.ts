import { describe, expect, it } from 'vitest'

import type { ValidatedDocsManifest } from '../../sync/index.js'
import type { CreateSyncEndpointOptions } from './context.js'

import { assertApplyPolicy, assertLifecyclePolicy, createSyncPolicy } from './policy.js'
import { SyncRequestError } from './respond.js'

const options = (overrides: Partial<CreateSyncEndpointOptions> = {}) =>
  ({
    allowPublish: true,
    allowWrites: true,
    docsEnableDrafts: true,
    syncRunsEnabled: true,
    ...overrides,
  }) as CreateSyncEndpointOptions

const manifest = (overrides: Partial<ValidatedDocsManifest> = {}) =>
  ({
    assets: [],
    files: [],
    mode: 'sync',
    publish: true,
    source: { id: 'docs' },
    ...overrides,
  }) as unknown as ValidatedDocsManifest

const rejection = (assertion: () => void): string | undefined => {
  try {
    assertion()
  } catch (error) {
    if (error instanceof SyncRequestError) {
      return `${error.status} ${error.code}`
    }

    throw error
  }

  return undefined
}

describe('sync policy', () => {
  it('derives publish, draft, deferral, and audit decisions in one place', () => {
    expect(createSyncPolicy({ manifest: manifest(), options: options() })).toEqual({
      apply: true,
      deferAssetWrites: false,
      deleteBehavior: 'archive',
      draftsEnabled: true,
      publish: true,
      recordAudit: true,
      writesMainForUpdates: true,
    })
    expect(
      createSyncPolicy({ manifest: manifest({ publish: false }), options: options() }),
    ).toMatchObject({ deferAssetWrites: true, writesMainForUpdates: false })
    expect(
      createSyncPolicy({
        manifest: manifest({ publish: false }),
        options: options({ applyAssetsOnDraftSync: true }),
      }),
    ).toMatchObject({ deferAssetWrites: false })
    expect(
      createSyncPolicy({
        manifest: manifest({ publish: false }),
        options: options({ docsEnableDrafts: false }),
      }),
    ).toMatchObject({ deferAssetWrites: false, writesMainForUpdates: true })
    expect(
      createSyncPolicy({
        manifest: manifest({ mode: 'dry-run' }),
        options: options({ auditDryRuns: false }),
      }),
    ).toMatchObject({ apply: false, recordAudit: false })
    expect(
      createSyncPolicy({ manifest: manifest(), options: options({ deleteBehavior: 'draft' }) }),
    ).toMatchObject({ deleteBehavior: 'draft' })
  })

  it('rejects lifecycle and apply requests the server configuration forbids', () => {
    const check = (o: Partial<CreateSyncEndpointOptions>, m: Partial<ValidatedDocsManifest> = {}) => {
      const resolvedOptions = options(o)
      const policy = createSyncPolicy({ manifest: manifest(m), options: resolvedOptions })

      return (
        rejection(() => assertLifecyclePolicy({ options: resolvedOptions, policy })) ??
        rejection(() => assertApplyPolicy({ options: resolvedOptions, policy }))
      )
    }

    expect(check({})).toBeUndefined()
    expect(check({ allowPublish: false })).toBe('403 publish_disabled')
    expect(check({ docsEnableDrafts: false })).toBe('400 publish_not_available')
    expect(check({ deleteBehavior: 'draft', docsEnableDrafts: false }, { publish: false })).toBe(
      '400 draft_behavior_not_available',
    )
    expect(check({ deleteBehavior: 'delete' })).toBe('403 hard_delete_disabled')
    expect(check({ allowWrites: false })).toBe('403 sync_writes_disabled')
    expect(check({ allowWrites: false }, { mode: 'dry-run' })).toBeUndefined()
    expect(check({ syncRunsEnabled: false })).toBe('500 audit_unavailable')
  })
})
