import type {
  DocsDeleteBehavior,
  DocsSyncPlan,
  ValidatedDocsManifest,
} from '../sync/index.js'
import type { DocsSyncConflict } from './docsConflicts.js'
import type { ExistingPayloadDocsRecord } from './existingDocs.js'

import { findDocsSyncConflicts } from './docsConflicts.js'
import { buildArchiveData, buildDocsData } from './docsData.js'

export type ApplyDocsSyncPayloadOperations = {
  create: (args: {
    collection: string
    data: Record<string, unknown>
    overrideAccess?: boolean
  }) => Promise<Record<string, unknown>>
  update: (args: {
    collection: string
    data: Record<string, unknown>
    id: string
    overrideAccess?: boolean
  }) => Promise<Record<string, unknown>>
}

export type ApplyDocsSyncResult =
  | {
      conflicts: DocsSyncConflict[]
      ok: false
    }
  | {
      ok: true
      writes: {
        archive: number
        create: number
        reactivate: number
        update: number
      }
    }

export const assertApplyDeleteBehaviorSupported = (
  deleteBehavior: DocsDeleteBehavior,
): boolean => deleteBehavior === 'archive' || deleteBehavior === 'ignore'

export const applyDocsSync = async ({
  collectionSlug,
  deleteBehavior,
  existing,
  manifest,
  markdownFieldName,
  now,
  payload,
  plan,
  syncRunId,
}: {
  collectionSlug: string
  deleteBehavior: DocsDeleteBehavior
  existing: ExistingPayloadDocsRecord[]
  manifest: ValidatedDocsManifest
  markdownFieldName: string
  now: Date
  payload: ApplyDocsSyncPayloadOperations
  plan: DocsSyncPlan
  syncRunId?: string
}): Promise<ApplyDocsSyncResult> => {
  const existingBySourcePath = new Map(
    existing.map((record) => [record.sourcePath, record]),
  )
  const reactivations = plan.unchanged.filter((change) => change.current?.archived)
  const conflicts = findDocsSyncConflicts({
    existingBySourcePath,
    plannedChanges: [...plan.update, ...plan.archive, ...reactivations],
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
    reactivate: 0,
    update: 0,
  }

  for (const change of plan.create) {
    if (!change.desired) {
      continue
    }

    await payload.create({
      collection: collectionSlug,
      data: buildDocsData({
        desired: change.desired,
        manifest,
        markdownFieldName,
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
      data: buildDocsData({
        desired: change.desired,
        manifest,
        markdownFieldName,
        now,
        syncRunId,
      }),
      overrideAccess: true,
    })
    writes.update += 1
  }

  for (const change of reactivations) {
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
      data: buildDocsData({
        desired: change.desired,
        manifest,
        markdownFieldName,
        now,
        syncRunId,
      }),
      overrideAccess: true,
    })
    writes.reactivate += 1
  }

  if (deleteBehavior === 'archive') {
    for (const change of plan.archive) {
      const current = existingBySourcePath.get(change.sourcePath)

      if (!current) {
        continue
      }

      await payload.update({
        id: current.id,
        collection: collectionSlug,
        data: buildArchiveData({
          now,
          syncRunId,
        }),
        overrideAccess: true,
      })
      writes.archive += 1
    }
  }

  return {
    ok: true,
    writes,
  }
}
