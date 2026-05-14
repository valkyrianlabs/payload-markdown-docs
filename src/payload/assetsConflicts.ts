import type { PlannedAssetChange } from '../sync/index.js'
import type { DocsSyncConflict } from './docsConflicts.js'
import type { ExistingPayloadDocsAssetRecord } from './existingAssets.js'

import { MANAGED_BY } from '../constants.js'
import { sha256Hex } from '../sync/index.js'

export const findDocsAssetsSyncConflicts = ({
  existingBySourcePath,
  plannedChanges,
}: {
  existingBySourcePath: Map<string, ExistingPayloadDocsAssetRecord>
  plannedChanges: PlannedAssetChange[]
}): DocsSyncConflict[] => {
  const conflicts: DocsSyncConflict[] = []

  for (const change of plannedChanges) {
    const current = existingBySourcePath.get(change.sourcePath)

    if (!current) {
      conflicts.push({
        reason: 'missing_current_record',
        sourcePath: change.sourcePath,
      })
      continue
    }

    if (current.sync?.managedBy !== MANAGED_BY) {
      conflicts.push({
        reason: 'unmanaged_record',
        route: current.route,
        sourcePath: current.sourcePath,
      })
      continue
    }

    const currentContentHash = sha256Hex(current.content ?? '')
    const expectedContentHash = current.sync.contentHashAtLastSync

    if (expectedContentHash) {
      if (currentContentHash !== expectedContentHash) {
        conflicts.push({
          reason: 'current_content_hash_mismatch',
          route: current.route,
          sourcePath: current.sourcePath,
        })
      }

      continue
    }

    if (
      currentContentHash !== current.sync.sourceHashAtLastSync &&
      current.sourceHash !== current.sync.sourceHashAtLastSync
    ) {
      conflicts.push({
        reason: 'current_content_hash_mismatch',
        route: current.route,
        sourcePath: current.sourcePath,
      })
    }
  }

  return conflicts
}
