import type { ValidatedDocsManifest, ValidatedDocsManifestFile } from '../sync/index.js'

import { MANAGED_BY } from '../constants.js'
import { sha256Hex } from '../sync/index.js'

export type BuildDocsDataInput = {
  desired: ValidatedDocsManifestFile
  docsEnableDrafts: boolean
  docsSetId?: number | string
  manifest: ValidatedDocsManifest
  markdownFieldName: string
  now: Date
  publish: boolean
  syncRunId?: number | string
}

export type DocsDraftStatus = 'draft' | 'published'

export const getDocsDepth = (sourcePath: string): number =>
  sourcePath === 'index.md' ? 0 : Math.max(0, sourcePath.split('/').length - 1)

const getDraftStatusForDocsData = ({
  docsEnableDrafts,
  publish,
}: {
  docsEnableDrafts: boolean
  publish: boolean
}): DocsDraftStatus | undefined => {
  if (!docsEnableDrafts) {
    return undefined
  }

  return publish ? 'published' : 'draft'
}

export const buildDocsData = ({
  desired,
  docsEnableDrafts,
  docsSetId,
  manifest,
  markdownFieldName,
  now,
  publish,
  syncRunId,
}: BuildDocsDataInput): Record<string, unknown> => {
  const draftStatus = getDraftStatusForDocsData({
    docsEnableDrafts,
    publish,
  })

  return {
    ...(draftStatus ? { _status: draftStatus } : {}),
    depth: getDocsDepth(desired.path),
    description: desired.frontmatter.description,
    ...(docsSetId ? { docsSet: docsSetId } : {}),
    [markdownFieldName]: desired.content,
    navTitle: desired.frontmatter.navTitle,
    order: desired.frontmatter.order ?? 0,
    route: desired.route,
    sourceHash: desired.sha256,
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
    title: desired.title,
  }
}

export const buildArchiveData = ({
  docsEnableDrafts = false,
  draftMissing = false,
  now,
  syncRunId,
}: {
  docsEnableDrafts?: boolean
  draftMissing?: boolean
  now: Date
  syncRunId?: number | string
}): Record<string, unknown> => ({
  ...(draftMissing && docsEnableDrafts ? { _status: 'draft' } : {}),
  sync: {
    archived: true,
    archivedAt: now.toISOString(),
    lastSyncedAt: now.toISOString(),
    lastSyncRunId: syncRunId,
    managedBy: MANAGED_BY,
  },
})
