import type {
  DocsDeleteBehavior,
  DocsSyncPlan,
  ValidatedDocsManifest,
} from '../sync/index.js'
import type { DocsSyncConflict } from './docsConflicts.js'
import type { DocsPublishMode } from './docsData.js'
import type { ExistingPayloadDocsRecord } from './existingDocs.js'

import { findDocsSyncConflicts } from './docsConflicts.js'
import { buildArchiveData, buildDocsData } from './docsData.js'

export type ApplyDocsSyncPayloadOperations = {
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
        delete: number
        draft: number
        reactivate: number
        update: number
      }
    }

export const assertApplyDeleteBehaviorSupported = (
  deleteBehavior: DocsDeleteBehavior,
  {
    allowHardDelete = false,
    docsEnableDrafts = false,
  }: {
    allowHardDelete?: boolean
    docsEnableDrafts?: boolean
  } = {},
): boolean => {
  if (deleteBehavior === 'archive' || deleteBehavior === 'ignore') {
    return true
  }

  if (deleteBehavior === 'draft') {
    return docsEnableDrafts
  }

  return allowHardDelete
}

export const applyDocsSync = async ({
  collectionSlug,
  deleteBehavior,
  docsEnableDrafts,
  docsSetId,
  existing,
  manifest,
  markdownFieldName,
  now,
  payload,
  plan,
  publishMode,
  syncRunId,
}: {
  collectionSlug: string
  deleteBehavior: DocsDeleteBehavior
  docsEnableDrafts: boolean
  docsSetId?: string
  existing: ExistingPayloadDocsRecord[]
  manifest: ValidatedDocsManifest
  markdownFieldName: string
  now: Date
  payload: ApplyDocsSyncPayloadOperations
  plan: DocsSyncPlan
  publishMode: DocsPublishMode
  syncRunId?: string
}): Promise<ApplyDocsSyncResult> => {
  const existingBySourcePath = new Map(
    existing.map((record) => [record.sourcePath, record]),
  )
  const reactivations = plan.unchanged.filter((change) => change.current?.archived)
  const conflicts = findDocsSyncConflicts({
    existingBySourcePath,
    plannedChanges: [
      ...plan.update,
      ...plan.archive,
      ...plan.draft,
      ...plan.delete,
      ...reactivations,
    ],
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
    draft: 0,
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
        docsEnableDrafts,
        docsSetId,
        manifest,
        markdownFieldName,
        now,
        publishMode,
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
        current,
        desired: change.desired,
        docsEnableDrafts,
        docsSetId,
        manifest,
        markdownFieldName,
        now,
        publishMode,
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
        current,
        desired: change.desired,
        docsEnableDrafts,
        docsSetId,
        manifest,
        markdownFieldName,
        now,
        publishMode,
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
          docsEnableDrafts,
          now,
          syncRunId,
        }),
        overrideAccess: true,
      })
      writes.archive += 1
    }
  }

  if (deleteBehavior === 'draft') {
    for (const change of plan.draft) {
      const current = existingBySourcePath.get(change.sourcePath)

      if (!current) {
        continue
      }

      await payload.update({
        id: current.id,
        collection: collectionSlug,
        data: buildArchiveData({
          docsEnableDrafts,
          draftMissing: true,
          now,
          syncRunId,
        }),
        overrideAccess: true,
      })
      writes.draft += 1
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
