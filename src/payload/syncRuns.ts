import type {
  DocsDeleteBehavior,
  DocsSyncMode,
  DocsValidationIssue,
} from '../sync/index.js'

export type SyncRunStatus = 'failed' | 'pending' | 'success'

export type SyncRunSummary = {
  archive: number
  create: number
  delete: number
  draft: number
  unchanged: number
  update: number
  warnings: number
}

export type SyncRunsPayloadOperations = {
  create: (args: {
    collection: string
    data: Record<string, unknown>
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
  effectivePublishMode?: 'draft' | 'preserve' | 'published'
  errors: DocsValidationIssue[]
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
  warnings: DocsValidationIssue[]
}

const issueToArrayRow = (issue: DocsValidationIssue): { message: string } => ({
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
  effectivePublishMode,
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
      effectivePublishMode,
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

export const getRecordId = (record: Record<string, unknown>): string | undefined => {
  if (typeof record.id === 'string' || typeof record.id === 'number') {
    return String(record.id)
  }

  return undefined
}

