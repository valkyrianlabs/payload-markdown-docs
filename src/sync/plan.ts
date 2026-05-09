import type {
  DocsDeleteBehavior,
  ValidatedDocsManifest,
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

const createEmptyPlan = (): DocsSyncPlan => ({
  archive: [],
  create: [],
  delete: [],
  draft: [],
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

    if (current.sourceHash === desiredFile.sha256 && !hasStatusMismatch) {
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
        : 'Existing source hash differs from desired source hash.',
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
