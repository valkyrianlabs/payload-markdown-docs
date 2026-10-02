/**
 * Sync-run audit records: one per applied sync (created `pending`, then marked
 * `success` or `failed`) and, unless disabled, one per dry run (created `success`).
 */
import type { SyncContext } from './context.js'
import type { SyncPlan } from './plan.js'
import type { SyncRequestError } from './respond.js'

import { createSyncRunAudit, updateSyncRunAudit } from '../../payload/index.js'
import { getRawRecordId } from '../../shared/records.js'
import { logSyncFailure, rejectSync } from './respond.js'

const getTotalManifestBytes = ({ manifest }: SyncContext): number =>
  [...manifest.files, ...manifest.assets].reduce(
    (total, file) => total + Buffer.byteLength(file.content, 'utf8'),
    0,
  )

/**
 * Creates the audit record when the policy asks for one. Applied syncs cannot proceed
 * without it.
 */
export const recordSyncRunStart = async (
  context: SyncContext,
  { summary, warnings }: Pick<SyncPlan, 'summary' | 'warnings'>,
): Promise<number | string | undefined> => {
  const { identity, manifest, now, options, payload, policy, startedAt } = context
  let syncRunId: number | string | undefined

  if (policy.recordAudit) {
    const syncRun = await createSyncRunAudit({
      actor: identity.actor,
      bodyHash: identity.bodyHash,
      branch: identity.branch ?? manifest.source.branch,
      collectionSlug: options.syncRunsCollectionSlug,
      commit: identity.commit ?? manifest.source.commit,
      completedAt: policy.apply ? startedAt : now(),
      deleteBehavior: policy.deleteBehavior,
      errors: [],
      fileCount: manifest.files.length + manifest.assets.length,
      keyId: identity.keyId,
      mode: policy.apply ? 'sync' : 'dry-run',
      payload,
      publishRequested: policy.publish,
      repository: identity.repository ?? manifest.source.repository,
      sourceId: manifest.source.id,
      startedAt,
      status: policy.apply ? 'pending' : 'success',
      summary,
      totalBytes: getTotalManifestBytes(context),
      warnings,
    })

    syncRunId = getRawRecordId(syncRun)
  }

  if (policy.apply && !syncRunId) {
    rejectSync('audit_unavailable', 'Applied sync could not create a sync-run audit record.', 500)
  }

  return syncRunId
}

export const recordSyncRunSuccess = async (
  { now, options, payload }: SyncContext,
  { summary, warnings }: Pick<SyncPlan, 'summary' | 'warnings'>,
  syncRunId: number | string,
): Promise<void> => {
  await updateSyncRunAudit({
    collectionSlug: options.syncRunsCollectionSlug,
    completedAt: now(),
    payload,
    status: 'success',
    summary,
    syncRunId,
    warnings,
  })
}

/** Best effort: a failed audit update is logged and never replaces the sync error. */
export const recordSyncRunFailure = async (
  { now, options, payload, req }: SyncContext,
  { summary, warnings }: Pick<SyncPlan, 'summary' | 'warnings'>,
  syncRunId: number | string,
  failure: SyncRequestError,
): Promise<void> => {
  await updateSyncRunAudit({
    collectionSlug: options.syncRunsCollectionSlug,
    completedAt: now(),
    errors: [
      {
        code: failure.code,
        message: failure.message,
      },
    ],
    payload,
    status: 'failed',
    summary,
    syncRunId,
    warnings,
  }).catch((auditError: unknown) => {
    logSyncFailure(req, auditError, 'Could not mark docs sync run as failed.')
  })
}
