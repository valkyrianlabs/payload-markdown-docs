/**
 * The single owner of record visibility for every reader of plugin collections: the
 * public surfaces (route adapter, sidebar, nav, sitemap, llms.txt / llms-full.txt,
 * asset and skill endpoints, marketing skill CTAs), the sync-side route checks, and the
 * admin docs-set manager.
 *
 * Payload 3 semantics this encodes: `find({ draft: false })` on a drafts-enabled
 * collection still returns documents that have never been published (they come back
 * from the main table with `_status: 'draft'`). Public readers must therefore check
 * `_status` themselves. Collections without drafts have no `_status`, which counts as
 * published. Archived (`sync.archived: true`) generated docs and assets are never
 * served.
 */

import { isRecord } from '../shared/records.js'

export type PayloadDraftStatus = 'draft' | 'published'

/** `_status` when it is a known draft status. */
export const getPayloadDraftStatus = (doc: unknown): PayloadDraftStatus | undefined =>
  isRecord(doc) && (doc._status === 'draft' || doc._status === 'published')
    ? doc._status
    : undefined

/** True unless the record is an explicit draft (`_status: 'draft'`). */
export const isPublishedPayloadRecord = (doc: unknown): boolean =>
  isRecord(doc) && doc._status !== 'draft'

/** True when the record carries `sync.archived: true`. */
export const isArchivedPayloadRecord = (doc: unknown): boolean =>
  isRecord(doc) && isRecord(doc.sync) && doc.sync.archived === true

/** Public visibility for generated docs records: published and not archived. */
export const isPublicDocsRecord = (doc: unknown): boolean =>
  isPublishedPayloadRecord(doc) && !isArchivedPayloadRecord(doc)

/** Public visibility for docs sets: published. */
export const isPublicDocsSetRecord = (doc: unknown): boolean => isPublishedPayloadRecord(doc)

/** Public visibility for docs assets: not archived. */
export const isPublicDocsAssetRecord = (doc: unknown): boolean =>
  isRecord(doc) && !isArchivedPayloadRecord(doc)

/**
 * Visibility of an already-resolved record for a reader: archived records are never
 * visible; drafts are visible only to draft-aware readers (`includeDrafts`).
 */
export const isVisibleToReader = ({
  archived = false,
  includeDrafts = false,
  status,
}: {
  archived?: boolean
  includeDrafts?: boolean
  status?: PayloadDraftStatus
}): boolean => !archived && (includeDrafts || status !== 'draft')

/** Admin lifecycle label for a generated doc: archived, draft, published, or synced. */
export const getDocsRecordLifecycleStatus = (
  doc: unknown,
): 'archived' | 'draft' | 'published' | 'synced' =>
  isArchivedPayloadRecord(doc) ? 'archived' : (getPayloadDraftStatus(doc) ?? 'synced')

/** `where` constraint that excludes archived generated docs and assets. */
export const notArchivedWhere = (): { 'sync.archived': { not_equals: true } } => ({
  'sync.archived': {
    not_equals: true,
  },
})

/** `where` constraint that keeps published records only. */
export const publishedWhere = (): { _status: { equals: 'published' } } => ({
  _status: {
    equals: 'published',
  },
})
