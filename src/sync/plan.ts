import type {
  DocsDeleteBehavior,
  ValidatedDocsManifest,
  ValidatedDocsManifestAsset,
  ValidatedDocsManifestFile,
} from './manifest.js'
import type { DocsValidationIssue } from './validate.js'

export type ExistingDocsRecord = {
  archived?: boolean
  route: string
  sourceHash?: string
  sourcePath: string
  status?: 'draft' | 'published'
  title?: string
}

export type PlannedDocChange = {
  current?: ExistingDocsRecord
  desired?: ValidatedDocsManifestFile
  reason: string
  sourcePath: string
}

export type DocsSyncPlan = {
  archive: PlannedDocChange[]
  create: PlannedDocChange[]
  delete: PlannedDocChange[]
  draft: PlannedDocChange[]
  unchanged: PlannedDocChange[]
  update: PlannedDocChange[]
  warnings: DocsValidationIssue[]
}

export type ExistingAssetRecord = {
  archived?: boolean
  contentType: string
  kind: string
  route?: string
  sourceHash?: string
  sourcePath: string
}

export type PlannedAssetChange = {
  current?: ExistingAssetRecord
  desired?: ValidatedDocsManifestAsset
  reason: string
  sourcePath: string
}

export type DocsAssetsSyncPlan = {
  archive: PlannedAssetChange[]
  create: PlannedAssetChange[]
  delete: PlannedAssetChange[]
  unchanged: PlannedAssetChange[]
  update: PlannedAssetChange[]
  warnings: DocsValidationIssue[]
}

const createEmptyPlan = (): DocsSyncPlan => ({
  archive: [],
  create: [],
  delete: [],
  draft: [],
  unchanged: [],
  update: [],
  warnings: [],
})

const createEmptyAssetPlan = (): DocsAssetsSyncPlan => ({
  archive: [],
  create: [],
  delete: [],
  unchanged: [],
  update: [],
  warnings: [],
})

export const planDocsSync = ({
  deleteBehavior,
  desired,
  existing,
}: {
  deleteBehavior?: DocsDeleteBehavior
  desired: ValidatedDocsManifest
  existing: ExistingDocsRecord[]
}): DocsSyncPlan => {
  const plan = createEmptyPlan()
  const effectiveDeleteBehavior = deleteBehavior ?? desired.deleteBehavior ?? 'archive'
  const existingBySourcePath = new Map<string, ExistingDocsRecord>()

  for (const existingRecord of existing) {
    if (existingBySourcePath.has(existingRecord.sourcePath)) {
      plan.warnings.push({
        code: 'duplicate_existing_path',
        message: `Existing docs contain duplicate sourcePath "${existingRecord.sourcePath}".`,
        path: existingRecord.sourcePath,
      })
      continue
    }

    existingBySourcePath.set(existingRecord.sourcePath, existingRecord)
  }

  const desiredSourcePaths = new Set(desired.files.map((file) => file.path))

  for (const desiredFile of desired.files) {
    const current = existingBySourcePath.get(desiredFile.path)

    if (!current) {
      plan.create.push({
        desired: desiredFile,
        reason: 'No existing doc has this sourcePath.',
        sourcePath: desiredFile.path,
      })
      continue
    }

    const desiredStatus = desired.publish ? 'published' : 'draft'
    const hasStatusMismatch = current.status !== undefined && current.status !== desiredStatus
    const hasSourceHashMismatch = current.sourceHash !== desiredFile.sha256
    const hasRouteMismatch = current.route !== desiredFile.route

    if (!hasSourceHashMismatch && !hasStatusMismatch && !hasRouteMismatch) {
      plan.unchanged.push({
        current,
        desired: desiredFile,
        reason: 'Existing source hash matches desired source hash.',
        sourcePath: desiredFile.path,
      })
      continue
    }

    plan.update.push({
      current,
      desired: desiredFile,
      reason: hasStatusMismatch
        ? 'Existing draft status differs from desired publish state.'
        : hasSourceHashMismatch
          ? 'Existing source hash differs from desired source hash.'
          : 'Existing route differs from desired route.',
      sourcePath: desiredFile.path,
    })
  }

  for (const current of existingBySourcePath.values()) {
    if (desiredSourcePaths.has(current.sourcePath)) {
      continue
    }

    const change = {
      current,
      reason: 'Existing doc is missing from desired manifest.',
      sourcePath: current.sourcePath,
    }

    if (effectiveDeleteBehavior === 'archive') {
      plan.archive.push(change)
    } else if (effectiveDeleteBehavior === 'delete') {
      plan.delete.push(change)
    } else if (effectiveDeleteBehavior === 'draft') {
      plan.draft.push(change)
    }
  }

  return plan
}

export const planDocsAssetsSync = ({
  deleteBehavior,
  desired,
  existing,
}: {
  deleteBehavior?: DocsDeleteBehavior
  desired: ValidatedDocsManifest
  existing: ExistingAssetRecord[]
}): DocsAssetsSyncPlan => {
  const plan = createEmptyAssetPlan()
  const effectiveDeleteBehavior = deleteBehavior ?? desired.deleteBehavior ?? 'archive'
  const existingBySourcePath = new Map<string, ExistingAssetRecord>()

  for (const existingRecord of existing) {
    if (existingBySourcePath.has(existingRecord.sourcePath)) {
      plan.warnings.push({
        code: 'duplicate_existing_path',
        message: `Existing assets contain duplicate sourcePath "${existingRecord.sourcePath}".`,
        path: existingRecord.sourcePath,
      })
      continue
    }

    existingBySourcePath.set(existingRecord.sourcePath, existingRecord)
  }

  const desiredSourcePaths = new Set(desired.assets.map((asset) => asset.path))

  for (const desiredAsset of desired.assets) {
    const current = existingBySourcePath.get(desiredAsset.path)

    if (!current) {
      plan.create.push({
        desired: desiredAsset,
        reason: 'No existing asset has this sourcePath.',
        sourcePath: desiredAsset.path,
      })
      continue
    }

    const hasSourceHashMismatch = current.sourceHash !== desiredAsset.sha256
    const hasRouteMismatch = current.route !== desiredAsset.route
    const hasContentTypeMismatch = current.contentType !== desiredAsset.contentType
    const hasKindMismatch = current.kind !== desiredAsset.kind

    if (
      !hasSourceHashMismatch &&
      !hasRouteMismatch &&
      !hasContentTypeMismatch &&
      !hasKindMismatch &&
      current.archived !== true
    ) {
      plan.unchanged.push({
        current,
        desired: desiredAsset,
        reason: 'Existing source hash matches desired source hash.',
        sourcePath: desiredAsset.path,
      })
      continue
    }

    plan.update.push({
      current,
      desired: desiredAsset,
      reason: current.archived
        ? 'Existing asset is archived and should be reactivated.'
        : hasSourceHashMismatch
          ? 'Existing source hash differs from desired source hash.'
          : hasRouteMismatch
            ? 'Existing route differs from desired route.'
            : hasContentTypeMismatch
              ? 'Existing content type differs from desired content type.'
              : 'Existing asset kind differs from desired kind.',
      sourcePath: desiredAsset.path,
    })
  }

  for (const current of existingBySourcePath.values()) {
    if (desiredSourcePaths.has(current.sourcePath)) {
      continue
    }

    const change = {
      current,
      reason: 'Existing asset is missing from desired manifest.',
      sourcePath: current.sourcePath,
    }

    if (effectiveDeleteBehavior === 'archive' || effectiveDeleteBehavior === 'draft') {
      plan.archive.push(change)
    } else if (effectiveDeleteBehavior === 'delete') {
      plan.delete.push(change)
    }
  }

  return plan
}
