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

/**
 * Hash of the synced metadata fields a CMS editor can change (DOCS-21). Compared on the
 * next sync together with the content hash so admin edits to title, description,
 * navTitle, or order are reported as `manual_edit_conflict` instead of being
 * overwritten. Route is excluded: the server itself rewrites it when archiving.
 */
export const computeDocsFieldsHash = (fields: {
  description?: null | string
  navTitle?: null | string
  order?: null | number
  title?: null | string
}): string =>
  sha256Hex(
    JSON.stringify([
      fields.title ?? '',
      fields.description ?? '',
      fields.navTitle ?? '',
      fields.order ?? 0,
    ]),
  )

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
    dependencies: desired.frontmatter.dependencies ?? [],
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
      fieldsHashAtLastSync: computeDocsFieldsHash({
        description: desired.frontmatter.description,
        navTitle: desired.frontmatter.navTitle,
        order: desired.frontmatter.order ?? 0,
        title: desired.title,
      }),
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
  releasedRoute,
  syncRunId,
}: {
  docsEnableDrafts?: boolean
  draftMissing?: boolean
  now: Date
  /** Released tombstone route so archived docs never keep a live unique route. */
  releasedRoute?: string
  syncRunId?: number | string
}): Record<string, unknown> => ({
  ...(draftMissing && docsEnableDrafts ? { _status: 'draft' } : {}),
  ...(releasedRoute ? { route: releasedRoute } : {}),
  sync: {
    archived: true,
    archivedAt: now.toISOString(),
    lastSyncedAt: now.toISOString(),
    lastSyncRunId: syncRunId,
    managedBy: MANAGED_BY,
  },
})
