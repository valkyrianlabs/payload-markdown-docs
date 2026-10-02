/**
 * Planning: loads the docs set's current docs and assets, runs the shared protocol
 * planners, applies the asset-deferral policy, collects warnings and the summary, and
 * (for applied syncs) rejects changes to records edited outside the sync workflow.
 */
import type {
  ExistingPayloadDocsAssetRecord,
  ExistingPayloadDocsRecord,
} from '../../payload/index.js'
import type {
  DocsAssetsSyncPlan,
  DocsSyncPlan,
  PlannedAssetChange,
  PlannedDocChange,
} from '../../sync/index.js'
import type { SyncContext } from './context.js'
import type { SyncSummary, SyncWarning } from './respond.js'

import { DEFAULT_DOCS_ASSETS_COLLECTION_SLUG } from '../../constants.js'
import {
  findDocsAssetsSyncConflicts,
  findDocsSyncConflicts,
  findExistingPayloadDocsAssetRecords,
  findExistingPayloadDocsRecords,
  toExistingAssetRecord,
  toExistingDocsRecord,
} from '../../payload/index.js'
import { findManifestRouteCollisions, planDocsAssetsSync, planDocsSync } from '../../sync/index.js'
import { isDocsAssetsStorageUnavailableError } from '../assetsStorage.js'
import { assetsStorageUnavailableError, rejectSync } from './respond.js'

export type SyncPlan = {
  /** Planned asset changes after deferral (what is applied and reported). */
  assetPlan: DocsAssetsSyncPlan
  /** Assets collection the sync writes to. */
  docsAssetsCollectionSlug: string
  existingAssets: ExistingPayloadDocsAssetRecord[]
  existingDocs: ExistingPayloadDocsRecord[]
  plan: DocsSyncPlan
  /** Assets are synced (enabled, and the manifest or the docs set has assets). */
  shouldSyncAssets: boolean
  summary: SyncSummary
  warnings: SyncWarning[]
}

const loadExistingAssets = async ({
  docsAssetsCollectionSlug,
  manifest,
  options,
  payload,
  source,
}: { docsAssetsCollectionSlug: string } & SyncContext): Promise<
  ExistingPayloadDocsAssetRecord[]
> => {
  // Existing assets are always loaded when assets are enabled, so a manifest that
  // drops every asset (`assets: []`) archives them instead of leaving them live (DOCS-9).
  if (options.docsAssetsEnabled !== true) {
    return []
  }

  try {
    return await findExistingPayloadDocsAssetRecords({
      collectionSlug: docsAssetsCollectionSlug,
      docsSetId: source.docsSet?.id,
      payload,
      sourceId: manifest.source.id,
    })
  } catch (error) {
    if (!isDocsAssetsStorageUnavailableError(error)) {
      throw error
    }

    // Docs-only manifests do not require the assets table to exist yet.
    if (manifest.assets.length > 0) {
      throw assetsStorageUnavailableError()
    }

    return []
  }
}

const summarizePlan = (plan: DocsSyncPlan) => ({
  archive: plan.archive.length,
  create: plan.create.length,
  delete: plan.delete.length,
  draft: plan.draft.length,
  unchanged: plan.unchanged.length,
  update: plan.update.length,
  warnings: plan.warnings.length,
})

const summarizeAssetPlan = (plan: DocsAssetsSyncPlan) => ({
  assetArchive: plan.archive.length,
  assetCreate: plan.create.length,
  assetDelete: plan.delete.length,
  assetUnchanged: plan.unchanged.length,
  assetUpdate: plan.update.length,
})

export const planSync = async (context: SyncContext): Promise<SyncPlan> => {
  const { manifest, manifestWarnings, options, payload, policy, source } = context
  const existingDocs = options.docsEnabled
    ? await findExistingPayloadDocsRecords({
        collectionSlug: options.docsCollectionSlug,
        docsSetId: source.docsSet?.id,
        draft: options.docsEnableDrafts,
        markdownFieldName: options.markdownFieldName,
        payload,
        sourceId: manifest.source.id,
      })
    : []
  const plan = planDocsSync({
    deleteBehavior: policy.deleteBehavior,
    desired: manifest,
    existing: existingDocs.map(toExistingDocsRecord),
  })
  const docsAssetsCollectionSlug =
    options.docsAssetsCollectionSlug ?? DEFAULT_DOCS_ASSETS_COLLECTION_SLUG
  const existingAssets = await loadExistingAssets({ ...context, docsAssetsCollectionSlug })
  const shouldSyncAssets =
    options.docsAssetsEnabled === true &&
    (manifest.assets.length > 0 || existingAssets.length > 0)
  const plannedAssets = planDocsAssetsSync({
    deleteBehavior: policy.deleteBehavior,
    desired: manifest,
    existing: existingAssets.map(toExistingAssetRecord),
  })
  const deferredAssetCount = policy.deferAssetWrites
    ? plannedAssets.create.length + plannedAssets.update.length
    : 0
  const assetPlan =
    deferredAssetCount > 0 ? { ...plannedAssets, create: [], update: [] } : plannedAssets
  const warnings: SyncWarning[] = [
    ...manifestWarnings,
    // Accepted, but they collide on case-insensitive filesystems, CDNs and caches.
    ...findManifestRouteCollisions(manifest)
      .filter((collision) => collision.reason === 'case_insensitive_route_collision')
      .map((collision) => ({
        code: collision.reason,
        message: `Routes ${collision.routes.join(', ')} differ only in letter case (${collision.paths.join(', ')}).`,
        path: collision.paths[0],
      })),
    ...plan.warnings,
    ...assetPlan.warnings,
    ...(deferredAssetCount > 0
      ? [
          {
            code: 'assets_deferred_until_publish',
            message: `${deferredAssetCount} asset change(s) are not applied by a non-publish sync; they are applied by the next --publish sync.`,
          },
        ]
      : []),
  ]
  // Key order is part of the response body: doc counts (including the `warnings` key,
  // overwritten below with the total), then asset counts.
  const summary: SyncSummary = {
    ...summarizePlan(plan),
    ...summarizeAssetPlan(assetPlan),
    warnings: warnings.length,
  }

  return {
    assetPlan,
    docsAssetsCollectionSlug,
    existingAssets,
    existingDocs,
    plan,
    shouldSyncAssets,
    summary,
    warnings,
  }
}

const getPlannedConflictChanges = ({
  existing,
  plan,
}: {
  existing: ExistingPayloadDocsRecord[]
  plan: DocsSyncPlan
}): PlannedDocChange[] => {
  const existingBySourcePath = new Map(existing.map((record) => [record.sourcePath, record]))
  const archivedUnchanged = plan.unchanged.filter((change) => {
    const current = existingBySourcePath.get(change.sourcePath)

    return current?.archived === true
  })

  return [...plan.update, ...plan.archive, ...plan.draft, ...plan.delete, ...archivedUnchanged]
}

const getPlannedAssetConflictChanges = (plan: DocsAssetsSyncPlan): PlannedAssetChange[] => [
  ...plan.update,
  ...plan.archive,
  ...plan.delete,
]

/** Applied syncs never overwrite docs or assets edited outside the sync workflow. */
export const assertNoManualEditConflicts = ({
  policy,
  syncPlan: { assetPlan, existingAssets, existingDocs, plan },
}: {
  policy: SyncContext['policy']
  syncPlan: SyncPlan
}): void => {
  if (!policy.apply) {
    return
  }

  const conflicts = findDocsSyncConflicts({
    existingBySourcePath: new Map(existingDocs.map((record) => [record.sourcePath, record])),
    plannedChanges: getPlannedConflictChanges({
      existing: existingDocs,
      plan,
    }),
  })

  if (conflicts.length > 0) {
    rejectSync(
      'manual_edit_conflict',
      'One or more docs were modified outside the docs sync workflow.',
      409,
      {
        conflicts,
      },
    )
  }

  const assetConflicts = findDocsAssetsSyncConflicts({
    existingBySourcePath: new Map(existingAssets.map((record) => [record.sourcePath, record])),
    plannedChanges: getPlannedAssetConflictChanges(assetPlan),
  })

  if (assetConflicts.length > 0) {
    rejectSync(
      'manual_edit_conflict',
      'One or more docs assets were modified outside the docs sync workflow.',
      409,
      {
        conflicts: assetConflicts,
      },
    )
  }
}
