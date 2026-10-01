import type { DocsDeleteBehavior, DocsSyncPlan, ValidatedDocsManifest } from '../sync/index.js'
import type { DocsSyncConflict } from './docsConflicts.js'
import type { ExistingPayloadDocsRecord } from './existingDocs.js'
import type { DocsRouteRelease } from './routeClaims.js'

import { findDocsSyncConflicts } from './docsConflicts.js'
import { buildArchiveData, buildDocsData } from './docsData.js'
import { toReleasedRoute } from './routeClaims.js'

export type ApplyDocsSyncPayloadOperations = {
  create: (args: {
    collection: string
    data: Record<string, unknown>
    draft?: boolean
    overrideAccess?: boolean
    req?: unknown
  }) => Promise<Record<string, unknown>>
  db?: {
    updateOne?: (args: {
      collection: string
      data: Record<string, unknown>
      id: number | string
      req?: unknown
    }) => Promise<unknown>
  }
  delete?: (args: {
    collection: string
    id: string
    overrideAccess?: boolean
    req?: unknown
  }) => Promise<Record<string, unknown>>
  update: (args: {
    collection: string
    data: Record<string, unknown>
    draft?: boolean
    id: string
    overrideAccess?: boolean
    req?: unknown
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
        release: number
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

const getDocsWriteDraftOption = ({
  docsEnableDrafts,
  publish,
}: {
  docsEnableDrafts: boolean
  publish: boolean
}): { draft?: boolean } => (docsEnableDrafts ? { draft: !publish } : {})

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
  publish,
  releases = [],
  req,
  syncRunId,
}: {
  collectionSlug: string
  deleteBehavior: DocsDeleteBehavior
  docsEnableDrafts: boolean
  docsSetId?: number | string
  existing: ExistingPayloadDocsRecord[]
  manifest: ValidatedDocsManifest
  markdownFieldName: string
  now: Date
  payload: ApplyDocsSyncPayloadOperations
  plan: DocsSyncPlan
  publish: boolean
  /** Main-table routes to release before route-claiming writes (see resolveDocsRouteClaims). */
  releases?: DocsRouteRelease[]
  /** Request carrying the sync transaction, passed to every Payload operation. */
  req?: unknown
  syncRunId?: number | string
}): Promise<ApplyDocsSyncResult> => {
  const existingBySourcePath = new Map(existing.map((record) => [record.sourcePath, record]))
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
    release: 0,
    update: 0,
  }
  const writeDraftOption = getDocsWriteDraftOption({
    docsEnableDrafts,
    publish,
  })
  // Removals must change what is publicly served even in a non-publish sync, so they
  // always write the main (published) record rather than a new draft version (DOCS-3).
  const mainWriteOption = docsEnableDrafts ? { draft: false } : {}

  // Write order (DOCS-2): removals release their routes first, then remaining route
  // holders are released, then updates move routes, and creates claim routes last.
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
        req,
      })
      writes.delete += 1
    }
  }

  if (deleteBehavior === 'archive' || deleteBehavior === 'draft') {
    const removals = deleteBehavior === 'archive' ? plan.archive : plan.draft

    for (const change of removals) {
      const current = existingBySourcePath.get(change.sourcePath)

      if (!current) {
        continue
      }

      await payload.update({
        id: current.id,
        collection: collectionSlug,
        data: buildArchiveData({
          docsEnableDrafts,
          draftMissing: deleteBehavior === 'draft',
          now,
          releasedRoute: toReleasedRoute(current.id, current.route),
          syncRunId,
        }),
        ...mainWriteOption,
        overrideAccess: true,
        req,
      })

      if (deleteBehavior === 'archive') {
        writes.archive += 1
      } else {
        writes.draft += 1
      }
    }
  }

  for (const release of releases) {
    if (typeof payload.db?.updateOne === 'function') {
      // Route-only main-table write: no new version, no publish side effects.
      await payload.db.updateOne({
        id: release.id,
        collection: collectionSlug,
        data: {
          route: release.route,
        },
        req,
      })
    } else {
      await payload.update({
        id: release.id,
        collection: collectionSlug,
        data: {
          route: release.route,
        },
        overrideAccess: true,
        req,
      })
    }

    writes.release += 1
  }

  const writeDesired = async (change: DocsSyncPlan['update'][number]): Promise<boolean> => {
    if (!change.desired) {
      return false
    }

    const current = existingBySourcePath.get(change.sourcePath)

    if (!current) {
      return false
    }

    await payload.update({
      id: current.id,
      collection: collectionSlug,
      data: buildDocsData({
        desired: change.desired,
        docsEnableDrafts,
        docsSetId,
        manifest,
        markdownFieldName,
        now,
        publish,
        syncRunId,
      }),
      ...writeDraftOption,
      overrideAccess: true,
      req,
    })

    return true
  }

  for (const change of plan.update) {
    if (await writeDesired(change)) {
      writes.update += 1
    }
  }

  for (const change of reactivations) {
    if (await writeDesired(change)) {
      writes.reactivate += 1
    }
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
        publish,
        syncRunId,
      }),
      ...writeDraftOption,
      overrideAccess: true,
      req,
    })
    writes.create += 1
  }

  return {
    ok: true,
    writes,
  }
}
