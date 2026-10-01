/**
 * Shared public-visibility rules for raw Payload records read by public surfaces
 * (llms.txt, llms-full.txt, sitemap, docs-set lookups for public routes).
 *
 * Payload 3 semantics this encodes: `find({ draft: false })` on a drafts-enabled
 * collection still returns documents that have never been published (they come back
 * from the main table with `_status: 'draft'`). Public readers must therefore check
 * `_status` themselves. Collections without drafts have no `_status`, which counts as
 * published.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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
