/**
 * Apply: writes docs, assets, and docs-set bookkeeping in one database transaction, so
 * a failure leaves nothing half-applied (DOCS-3). Conflicts discovered while writing
 * abort the transaction as `SyncApplyConflictError`.
 */
import type { DocsRouteRelease } from '../../payload/routeClaims.js'
import type { SyncContext } from './context.js'
import type { SyncPlan } from './plan.js'

import { applyDocsAssetsSync, applyDocsSync, updateDocsSetAfterSync } from '../../payload/index.js'
import { runInSyncTransaction } from '../../payload/transaction.js'
import { SyncApplyConflictError } from './respond.js'

export const applySync = async ({
  context,
  releases,
  syncPlan,
  syncRunId,
}: {
  context: SyncContext
  releases: DocsRouteRelease[]
  syncPlan: SyncPlan
  syncRunId: number | string
}): Promise<void> => {
  const { manifest, now, options, payload, policy, source } = context
  const { assetPlan, docsAssetsCollectionSlug, existingAssets, existingDocs, plan } = syncPlan

  await runInSyncTransaction({
    payload,
    work: async (transactionReq) => {
      const applyResult = await applyDocsSync({
        collectionSlug: options.docsCollectionSlug,
        deleteBehavior: policy.deleteBehavior,
        docsEnableDrafts: policy.draftsEnabled,
        docsSetId: source.docsSet?.id,
        existing: existingDocs,
        manifest,
        markdownFieldName: options.markdownFieldName,
        now: now(),
        payload,
        plan,
        publish: policy.publish,
        releases,
        req: transactionReq,
        syncRunId,
      })

      if (!applyResult.ok) {
        throw new SyncApplyConflictError(applyResult.conflicts)
      }

      if (syncPlan.shouldSyncAssets) {
        const applyAssetsResult = await applyDocsAssetsSync({
          collectionSlug: docsAssetsCollectionSlug,
          deleteBehavior: policy.deleteBehavior,
          docsSetId: source.docsSet?.id,
          existing: existingAssets,
          manifest,
          now: now(),
          payload,
          plan: assetPlan,
          req: transactionReq,
          syncRunId,
        })

        if (!applyAssetsResult.ok) {
          throw new SyncApplyConflictError(applyAssetsResult.conflicts)
        }
      }

      if (source.docsSet) {
        await updateDocsSetAfterSync({
          collectionSlug: options.docsSetsCollectionSlug,
          docsSetId: source.docsSet.id,
          now: now(),
          payload,
          publish: policy.publish,
          req: transactionReq,
        })
      }
    },
  })
}
