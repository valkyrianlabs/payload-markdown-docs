import type { PlannedDocChange } from '../sync/index.js'
import type { ExistingPayloadDocsRecord } from './existingDocs.js'

import { MANAGED_BY } from '../constants.js'
import { sha256Hex } from '../sync/index.js'
import { computeDocsFieldsHash } from './docsData.js'

export type DocsSyncConflictReason =
  | 'current_content_hash_mismatch'
  | 'current_fields_hash_mismatch'
  | 'missing_current_record'
  | 'unmanaged_record'

export type DocsSyncConflict = {
  reason: DocsSyncConflictReason
  route?: string
  sourcePath: string
}

export const findDocsSyncConflicts = ({
  existingBySourcePath,
  plannedChanges,
}: {
  existingBySourcePath: Map<string, ExistingPayloadDocsRecord>
  plannedChanges: PlannedDocChange[]
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
    const expectedContentHash = current.sync?.contentHashAtLastSync

    if (currentContentHash !== expectedContentHash) {
      conflicts.push({
        reason: 'current_content_hash_mismatch',
        route: current.route,
        sourcePath: current.sourcePath,
      })
      continue
    }

    // Records synced before field tracking existed have no fields hash: content only.
    const expectedFieldsHash = current.sync?.fieldsHashAtLastSync

    if (
      expectedFieldsHash &&
      current.archived !== true &&
      computeDocsFieldsHash({
        description: current.description,
        navTitle: current.navTitle,
        order: current.order,
        title: current.title,
      }) !== expectedFieldsHash
    ) {
      conflicts.push({
        reason: 'current_fields_hash_mismatch',
        route: current.route,
        sourcePath: current.sourcePath,
      })
    }
  }

  return conflicts
}
