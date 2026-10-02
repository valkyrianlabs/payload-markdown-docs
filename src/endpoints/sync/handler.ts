/**
 * The sync endpoint pipeline. Each stage lives in its own module and rejects a request
 * by throwing a `SyncRequestError`; the boundary in respond.ts turns it into the error
 * response. Stage order is part of the contract (it decides which error a request
 * gets) and must not change:
 *
 *   request -> authenticate -> resolve docs set -> credential scope -> validate manifest
 *   -> lifecycle policy -> route collisions -> apply policy -> plan -> edit conflicts
 *   -> route claims -> audit start -> [apply -> audit result -> revalidate] -> respond
 */
import type { PayloadRequest } from 'payload'

import type { NoncePayloadOperations } from '../../security/index.js'
import type { CreateSyncEndpointOptions, SyncContext, SyncPayload, SyncRequestContext } from './context.js'

import { DEFAULT_MAX_BODY_BYTES } from '../../constants.js'
import { pruneExpiredNonces } from '../../security/index.js'
import { applySync } from './apply.js'
import { authenticateSyncRequest } from './authenticate.js'
import { assertNoManualEditConflicts, planSync } from './plan.js'
import {
  assertApplyPolicy,
  assertCredentialScope,
  assertLifecyclePolicy,
  createSyncPolicy,
} from './policy.js'
import { recordSyncRunFailure, recordSyncRunStart, recordSyncRunSuccess } from './record.js'
import { readSyncRequest } from './request.js'
import {
  classifySyncApplyFailure,
  logSyncFailure,
  syncSuccessResponse,
  withSyncErrorBoundary,
} from './respond.js'
import { revalidateDocsSyncCache } from './revalidate.js'
import {
  assertNoRouteCollisions,
  resolveSyncRouteClaims,
  resolveSyncSource,
  validateSyncManifest,
} from './validate.js'

const runSyncPipeline = async (
  options: CreateSyncEndpointOptions,
  req: PayloadRequest,
): Promise<Response> => {
  const startedAt = options.getNow?.() ?? new Date()
  const requestContext: SyncRequestContext = {
    maxBodyBytes: options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    now: () => options.getNow?.() ?? new Date(),
    options,
    payload: req.payload as unknown as SyncPayload,
    req,
    startedAt,
  }
  const body = await readSyncRequest(req, requestContext.maxBodyBytes)
  // Authenticate before looking up the docs set, so unauthenticated callers cannot
  // probe which docs sets exist (DOCS-15).
  const identity = await authenticateSyncRequest({
    context: requestContext,
    rawBody: body.rawBody,
    sourceId: body.sourceId,
  })

  void pruneExpiredNonces({
    collectionSlug: options.noncesCollectionSlug,
    now: startedAt,
    payload: req.payload as unknown as NoncePayloadOperations,
  })

  const source = await resolveSyncSource(requestContext, body.sourceId)

  assertCredentialScope({
    docsSet: source.docsSet,
    identity,
    req,
  })

  const validated = validateSyncManifest({
    context: requestContext,
    manifest: body.manifest,
    source,
  })
  const context: SyncContext = {
    ...requestContext,
    identity,
    manifest: validated.manifest,
    manifestWarnings: validated.warnings,
    policy: createSyncPolicy({ manifest: validated.manifest, options }),
    source,
  }

  assertLifecyclePolicy(context)
  await assertNoRouteCollisions(context)
  assertApplyPolicy(context)

  const syncPlan = await planSync(context)

  assertNoManualEditConflicts({ policy: context.policy, syncPlan })

  const releases = await resolveSyncRouteClaims({
    context,
    existing: syncPlan.existingDocs,
    plan: syncPlan.plan,
  })
  const syncRunId = await recordSyncRunStart(context, syncPlan)

  if (context.policy.apply && syncRunId !== undefined) {
    try {
      await applySync({
        context,
        releases,
        syncPlan,
        syncRunId,
      })
    } catch (error) {
      const failure = classifySyncApplyFailure(error)

      logSyncFailure(req, error, 'Docs sync apply failed and was rolled back.')
      await recordSyncRunFailure(context, syncPlan, syncRunId, failure)

      throw failure
    }

    await recordSyncRunSuccess(context, syncPlan, syncRunId)
    await revalidateDocsSyncCache({
      assetPlan: syncPlan.assetPlan,
      docsSet: source.docsSet,
      manifest: context.manifest,
      options,
      plan: syncPlan.plan,
    })
  }

  return syncSuccessResponse({
    assetPlan: syncPlan.assetPlan,
    deleteBehavior: context.policy.deleteBehavior,
    dryRun: !context.policy.apply,
    plan: syncPlan.plan,
    publishRequested: context.policy.publish,
    summary: syncPlan.summary,
    syncRunId,
    warnings: syncPlan.warnings,
  })
}

/** Builds the sync endpoint handler: the stage pipeline behind the error boundary. */
export const createSyncEndpointHandler = (
  options: CreateSyncEndpointOptions,
): ((req: PayloadRequest) => Promise<Response>) =>
  withSyncErrorBoundary((req) => runSyncPipeline(options, req))
