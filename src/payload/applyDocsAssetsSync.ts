import type {
  DocsAssetsSyncPlan,
  DocsDeleteBehavior,
  ValidatedDocsManifest,
} from '../sync/index.js'
import type { DocsSyncConflict } from './docsConflicts.js'
import type { ExistingPayloadDocsAssetRecord } from './existingAssets.js'

import { findDocsAssetsSyncConflicts } from './assetsConflicts.js'
import { buildAssetArchiveData, buildAssetData } from './assetsData.js'

export type ApplyDocsAssetsSyncPayloadOperations = {
  create: (args: {
    collection: string
    data: Record<string, unknown>
    overrideAccess?: boolean
  }) => Promise<Record<string, unknown>>
  delete?: (args: {
    collection: string
    id: string
    overrideAccess?: boolean
  }) => Promise<Record<string, unknown>>
  update: (args: {
    collection: string
    data: Record<string, unknown>
    id: string
    overrideAccess?: boolean
  }) => Promise<Record<string, unknown>>
}

export type ApplyDocsAssetsSyncResult =
  | {
      conflicts: DocsSyncConflict[]
      ok: false
    }
  | {
      ok: true
      writes: {
        archive: number
        create: number
        delete: number
        update: number
      }
    }

export const applyDocsAssetsSync = async ({
  collectionSlug,
  deleteBehavior,
  docsSetId,
  existing,
  manifest,
  now,
  payload,
  plan,
  syncRunId,
}: {
  collectionSlug: string
  deleteBehavior: DocsDeleteBehavior
  docsSetId?: number | string
  existing: ExistingPayloadDocsAssetRecord[]
  manifest: ValidatedDocsManifest
  now: Date
  payload: ApplyDocsAssetsSyncPayloadOperations
  plan: DocsAssetsSyncPlan
  syncRunId?: number | string
}): Promise<ApplyDocsAssetsSyncResult> => {
  const existingBySourcePath = new Map(existing.map((record) => [record.sourcePath, record]))
  const conflicts = findDocsAssetsSyncConflicts({
    existingBySourcePath,
    plannedChanges: [...plan.update, ...plan.archive, ...plan.delete],
  })

  if (conflicts.length > 0) {
    return {
      conflicts,
      ok: false,
    }
  }

  const writes = {
    archive: 0,
    create: 0,
    delete: 0,
    update: 0,
  }

  for (const change of plan.create) {
    if (!change.desired) {
      continue
    }

    await payload.create({
      collection: collectionSlug,
      data: buildAssetData({
        desired: change.desired,
        docsSetId,
        manifest,
        now,
        syncRunId,
      }),
      overrideAccess: true,
    })
    writes.create += 1
  }

  for (const change of plan.update) {
    if (!change.desired) {
      continue
    }

    const current = existingBySourcePath.get(change.sourcePath)

    if (!current) {
      continue
    }

    await payload.update({
      id: current.id,
      collection: collectionSlug,
      data: buildAssetData({
        desired: change.desired,
        docsSetId,
        manifest,
        now,
        syncRunId,
      }),
      overrideAccess: true,
    })
    writes.update += 1
  }

  if (deleteBehavior === 'archive' || deleteBehavior === 'draft') {
    for (const change of plan.archive) {
      const current = existingBySourcePath.get(change.sourcePath)

      if (!current) {
        continue
      }

      await payload.update({
        id: current.id,
        collection: collectionSlug,
        data: buildAssetArchiveData({
          now,
          syncRunId,
        }),
        overrideAccess: true,
      })
      writes.archive += 1
    }
  }

  if (deleteBehavior === 'delete') {
    if (!payload.delete) {
      throw new Error('Payload delete operation is required for hard delete.')
    }

    for (const change of plan.delete) {
      const current = existingBySourcePath.get(change.sourcePath)

      if (!current) {
        continue
      }

      await payload.delete({
        id: current.id,
        collection: collectionSlug,
        overrideAccess: true,
      })
      writes.delete += 1
    }
  }

  return {
    ok: true,
    writes,
  }
}
