import type { DocsDeleteBehavior, DocsSyncMode } from '../sync/index.js'

export type SyncRunStatus = 'failed' | 'pending' | 'success'

export type SyncRunSummary = {
  archive: number
  assetArchive?: number
  assetCreate?: number
  assetDelete?: number
  assetUnchanged?: number
  assetUpdate?: number
  create: number
  delete: number
  draft: number
  unchanged: number
  update: number
  warnings: number
}

export type PayloadRecordId = number | string

/** Issue row stored on a sync run. Codes may be validation codes or endpoint codes. */
export type SyncRunIssue = {
  code: string
  message: string
  path?: string
}

export type SyncRunsPayloadOperations = {
  create: (args: {
    collection: string
    data: Record<string, unknown>
    overrideAccess?: boolean
  }) => Promise<Record<string, unknown>>
  update?: (args: {
    collection: string
    data: Record<string, unknown>
    id: PayloadRecordId
    overrideAccess?: boolean
  }) => Promise<Record<string, unknown>>
}

export type CreateSyncRunAuditInput = {
  actor?: string
  bodyHash: string
  branch?: string
  collectionSlug: string
  commit?: string
  completedAt: Date
  deleteBehavior: DocsDeleteBehavior
  errors: SyncRunIssue[]
  fileCount: number
  keyId: string
  mode: DocsSyncMode
  payload: SyncRunsPayloadOperations
  publishRequested: boolean
  repository?: string
  sourceId: string
  startedAt: Date
  status: SyncRunStatus
  summary: SyncRunSummary
  totalBytes: number
  warnings: SyncRunIssue[]
}

const issueToArrayRow = (issue: SyncRunIssue): { message: string } => ({
  message: issue.path ? `${issue.path}: ${issue.message}` : issue.message,
})

export const createSyncRunAudit = async ({
  actor,
  bodyHash,
  branch,
  collectionSlug,
  commit,
  completedAt,
  deleteBehavior,
  errors,
  fileCount,
  keyId,
  mode,
  payload,
  publishRequested,
  repository,
  sourceId,
  startedAt,
  status,
  summary,
  totalBytes,
  warnings,
}: CreateSyncRunAuditInput): Promise<Record<string, unknown>> =>
  payload.create({
    collection: collectionSlug,
    data: {
      actor,
      bodyHash,
      branch,
      commit,
      completedAt: completedAt.toISOString(),
      deleteBehavior,
      errors: errors.map(issueToArrayRow),
      fileCount,
      keyId,
      mode,
      publishRequested,
      repository,
      sourceId,
      startedAt: startedAt.toISOString(),
      status,
      summary,
      totalBytes,
      warnings: warnings.map(issueToArrayRow),
    },
    overrideAccess: true,
  })

export const updateSyncRunAudit = async ({
  collectionSlug,
  completedAt,
  errors,
  payload,
  status,
  summary,
  syncRunId,
  warnings,
}: {
  collectionSlug: string
  completedAt: Date
  errors?: SyncRunIssue[]
  payload: SyncRunsPayloadOperations
  status: SyncRunStatus
  summary?: SyncRunSummary
  syncRunId: PayloadRecordId
  warnings?: SyncRunIssue[]
}): Promise<Record<string, unknown> | undefined> => {
  if (!payload.update) {
    return undefined
  }

  return payload.update({
    id: syncRunId,
    collection: collectionSlug,
    data: {
      completedAt: completedAt.toISOString(),
      errors: errors?.map(issueToArrayRow),
      status,
      summary,
      warnings: warnings?.map(issueToArrayRow),
    },
    overrideAccess: true,
  })
}
