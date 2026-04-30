import type {
  ValidatedDocsManifest,
  ValidatedDocsManifestFile,
} from '../sync/index.js'

import { MANAGED_BY } from '../constants.js'

export type BuildDocsDataInput = {
  desired: ValidatedDocsManifestFile
  manifest: ValidatedDocsManifest
  markdownFieldName: string
  now: Date
  syncRunId?: string
}

export const getDocsDepth = (sourcePath: string): number =>
  sourcePath === 'index.md' ? 0 : Math.max(0, sourcePath.split('/').length - 1)

export const buildDocsData = ({
  desired,
  manifest,
  markdownFieldName,
  now,
  syncRunId,
}: BuildDocsDataInput): Record<string, unknown> => ({
  depth: getDocsDepth(desired.path),
  description: desired.frontmatter.description,
  [markdownFieldName]: desired.content,
  navTitle: desired.frontmatter.navTitle,
  order: desired.frontmatter.order ?? 0,
  route: desired.route,
  sourceHash: desired.sha256,
  sourcePath: desired.path,
  sync: {
    archived: false,
    archivedAt: null,
    lastSyncedAt: now.toISOString(),
    lastSyncRunId: syncRunId,
    managedBy: MANAGED_BY,
    sourceHashAtLastSync: desired.sha256,
    sourceId: manifest.source.id,
    sourcePath: desired.path,
  },
  title: desired.title,
})

export const buildArchiveData = ({
  now,
  syncRunId,
}: {
  now: Date
  syncRunId?: string
}): Record<string, unknown> => ({
  sync: {
    archived: true,
    archivedAt: now.toISOString(),
    lastSyncedAt: now.toISOString(),
    lastSyncRunId: syncRunId,
    managedBy: MANAGED_BY,
  },
})

