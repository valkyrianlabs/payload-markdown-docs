import type {
  ValidatedDocsManifest,
  ValidatedDocsManifestFile,
} from '../sync/index.js'
import type { ExistingPayloadDocsRecord } from './existingDocs.js'

import { MANAGED_BY } from '../constants.js'

export type BuildDocsDataInput = {
  current?: ExistingPayloadDocsRecord
  desired: ValidatedDocsManifestFile
  docsEnableDrafts: boolean
  docsSetId?: string
  manifest: ValidatedDocsManifest
  markdownFieldName: string
  now: Date
  publishMode: DocsPublishMode
  syncRunId?: string
}

export type DocsDraftStatus = 'draft' | 'published'

export type DocsPublishMode = 'draft' | 'preserve' | 'published'

export const getDocsDepth = (sourcePath: string): number =>
  sourcePath === 'index.md' ? 0 : Math.max(0, sourcePath.split('/').length - 1)

const getDraftStatusForDocsData = ({
  current,
  docsEnableDrafts,
  publishMode,
}: {
  current?: ExistingPayloadDocsRecord
  docsEnableDrafts: boolean
  publishMode: DocsPublishMode
}): DocsDraftStatus | undefined => {
  if (!docsEnableDrafts) {
    return undefined
  }

  if (publishMode === 'draft' || publishMode === 'published') {
    return publishMode
  }

  return current ? current.status : 'draft'
}

export const buildDocsData = ({
  current,
  desired,
  docsEnableDrafts,
  docsSetId,
  manifest,
  markdownFieldName,
  now,
  publishMode,
  syncRunId,
}: BuildDocsDataInput): Record<string, unknown> => {
  const draftStatus = getDraftStatusForDocsData({
    current,
    docsEnableDrafts,
    publishMode,
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
  syncRunId?: string
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
