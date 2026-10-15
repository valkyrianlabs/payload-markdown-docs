import type { PayloadRequest, Where } from 'payload'

import type { DocsAgentAccessMode } from './access.js'

import { isRecord } from '../shared/records.js'
import { assertDocsAgentAccess } from './access.js'
import {
  adminUrl,
  clampLimit,
  combineWhere,
  loadRecord,
  localApi,
  requireDocsCollection,
} from './collections.js'

type Doc = Record<string, unknown>

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined

const messages = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((row) => (isRecord(row) && typeof row.message === 'string' ? [row.message] : []))
    : []

export type SyncRunSummary = {
  actor?: string
  adminUrl: string
  branch?: string
  commit?: string
  completedAt?: string
  deleteBehavior?: string
  errorCount: number
  /** With `id` only. */
  errors?: string[]
  fileCount?: number
  id: number | string
  keyId?: string
  /** `dry-run` or `sync`. */
  mode?: string
  publishRequested?: boolean
  repository?: string
  sourceId?: string
  startedAt?: string
  /** `pending`, `success` or `failed`. */
  status?: string
  /** With `id` only: the sync plan and write counts. */
  summary?: unknown
  totalBytes?: number
  warningCount: number
  /** With `id` only. */
  warnings?: string[]
}

const summarize = (req: PayloadRequest, slug: string, doc: Doc, detailed: boolean): SyncRunSummary => {
  const warnings = messages(doc.warnings)
  const errors = messages(doc.errors)

  return {
    id: doc.id as number | string,
    ...(text(doc.actor) ? { actor: text(doc.actor) } : {}),
    adminUrl: adminUrl(req, slug, doc.id as number | string),
    ...(text(doc.branch) ? { branch: text(doc.branch) } : {}),
    ...(text(doc.commit) ? { commit: text(doc.commit) } : {}),
    ...(text(doc.completedAt) ? { completedAt: text(doc.completedAt) } : {}),
    ...(text(doc.deleteBehavior) ? { deleteBehavior: text(doc.deleteBehavior) } : {}),
    errorCount: errors.length,
    ...(detailed ? { errors } : {}),
    ...(typeof doc.fileCount === 'number' ? { fileCount: doc.fileCount } : {}),
    ...(text(doc.keyId) ? { keyId: text(doc.keyId) } : {}),
    ...(text(doc.mode) ? { mode: text(doc.mode) } : {}),
    ...(typeof doc.publishRequested === 'boolean' ? { publishRequested: doc.publishRequested } : {}),
    ...(text(doc.repository) ? { repository: text(doc.repository) } : {}),
    ...(text(doc.sourceId) ? { sourceId: text(doc.sourceId) } : {}),
    ...(text(doc.startedAt) ? { startedAt: text(doc.startedAt) } : {}),
    ...(text(doc.status) ? { status: text(doc.status) } : {}),
    ...(detailed && doc.summary !== undefined && doc.summary !== null ? { summary: doc.summary } : {}),
    ...(typeof doc.totalBytes === 'number' ? { totalBytes: doc.totalBytes } : {}),
    warningCount: warnings.length,
    ...(detailed ? { warnings } : {}),
  }
}

export type FindSyncRunsOptions = {
  access?: DocsAgentAccessMode
  /** One run with its plan summary, warnings and errors. */
  id?: number | string
  limit?: number
  mode?: 'dry-run' | 'sync'
  req: PayloadRequest
  /** Docs set slug (the Git `--source` id). */
  sourceId?: string
  status?: 'failed' | 'pending' | 'success'
}

/** The sync audit log, newest first. Read-only: runs are written by the sync endpoint. */
export const findSyncRuns = async (
  options: FindSyncRunsOptions,
): Promise<{ runs: SyncRunSummary[]; totalDocs: number }> => {
  const { access = 'user', req } = options
  const collection = requireDocsCollection(req, 'syncRuns')

  assertDocsAgentAccess(req, collection.slug, 'find', access)

  if (options.id !== undefined) {
    const doc = await loadRecord({ id: options.id, collection, req })

    return { runs: [summarize(req, collection.slug, doc, true)], totalDocs: 1 }
  }

  const clauses: Where[] = [
    ...(options.sourceId ? [{ sourceId: { equals: options.sourceId } }] : []),
    ...(options.status ? [{ status: { equals: options.status } }] : []),
    ...(options.mode ? [{ mode: { equals: options.mode } }] : []),
  ]
  const result = await localApi(req.payload).find({
    collection: collection.slug,
    depth: 0,
    limit: clampLimit(options.limit, 10, 50),
    overrideAccess: false,
    req,
    sort: '-startedAt',
    where: combineWhere(clauses),
  })

  return {
    runs: result.docs.map((doc) => summarize(req, collection.slug, doc, false)),
    totalDocs: result.totalDocs,
  }
}
