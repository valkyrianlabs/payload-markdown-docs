import type { ValidatedDocsManifest, ValidatedDocsManifestAsset } from '../sync/index.js'

import { MANAGED_BY } from '../constants.js'
import { sha256Hex } from '../sync/index.js'

export const buildAssetData = ({
  desired,
  docsSetId,
  manifest,
  now,
  syncRunId,
}: {
  desired: ValidatedDocsManifestAsset
  docsSetId?: number | string
  manifest: ValidatedDocsManifest
  now: Date
  syncRunId?: number | string
}): Record<string, unknown> => ({
  content: desired.content,
  contentType: desired.contentType,
  ...(docsSetId ? { docsSet: docsSetId } : {}),
  kind: desired.kind,
  route: desired.route,
  sourceHash: desired.sha256,
  sourceId: manifest.source.id,
  sourcePath: desired.path,
  sync: {
    archived: false,
    archivedAt: null,
    contentHashAtLastSync: sha256Hex(desired.content),
    lastSyncedAt: now.toISOString(),
    lastSyncRunId: syncRunId,
    managedBy: MANAGED_BY,
    sourceHashAtLastSync: desired.sha256,
    sourceId: manifest.source.id,
    sourcePath: desired.path,
  },
})

export const buildAssetArchiveData = ({
  now,
  syncRunId,
}: {
  now: Date
  syncRunId?: number | string
}): Record<string, unknown> => ({
  sync: {
    archived: true,
    archivedAt: now.toISOString(),
    lastSyncedAt: now.toISOString(),
    lastSyncRunId: syncRunId,
    managedBy: MANAGED_BY,
  },
})
