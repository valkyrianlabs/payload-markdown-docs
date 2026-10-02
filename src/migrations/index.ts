import type { CollectionSlug, Payload, PayloadRequest, Where } from 'payload'

import { DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG } from '../constants.js'

export type PrepareDocsSyncMigrationArgs = {
  /** The nonces collection slug, when it was changed with `collections.nonces.slug`. */
  noncesCollectionSlug?: CollectionSlug
  payload: Payload
  /** The migration's `req`, so the cleanup runs in the migration's transaction. */
  req?: Partial<PayloadRequest>
}

export type PrepareDocsSyncMigrationResult = {
  duplicateNoncesRemoved: number
  expiredNoncesRemoved: number
}

/**
 * Prepares existing data for the 1.1 schema, where `(keyId, nonce)` in the sync
 * nonces collection becomes a unique index (replay protection). Creating that
 * index fails if duplicate pairs exist, so call this at the top of the generated
 * migration's `up`, before the SQL runs:
 *
 * ```ts
 * import { prepareDocsSyncMigration } from '@valkyrianlabs/payload-markdown-docs/migrations'
 *
 * export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
 *   await prepareDocsSyncMigration({ payload, req })
 *   await db.execute(sql`...`)
 * }
 * ```
 *
 * It deletes expired nonces (no longer needed for replay protection), then
 * keeps the oldest row of any remaining duplicate pair. Safe to run more than
 * once, and a no-op when the nonces collection is disabled.
 */
export async function prepareDocsSyncMigration({
  noncesCollectionSlug = DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG,
  payload,
  req,
}: PrepareDocsSyncMigrationArgs): Promise<PrepareDocsSyncMigrationResult> {
  const result: PrepareDocsSyncMigrationResult = { duplicateNoncesRemoved: 0, expiredNoncesRemoved: 0 }

  const collection = noncesCollectionSlug

  if (!payload.collections[collection]) {
    return result
  }

  const expired: Where = { expiresAt: { less_than: new Date().toISOString() } }

  result.expiredNoncesRemoved = (await payload.count({ collection, overrideAccess: true, req, where: expired }))
    .totalDocs
  if (result.expiredNoncesRemoved > 0) {
    await payload.db.deleteMany({ collection, req, where: expired })
  }

  const { docs } = await payload.find({
    collection,
    depth: 0,
    overrideAccess: true,
    pagination: false,
    req,
    select: { keyId: true, nonce: true },
    sort: 'createdAt',
  })

  const seen = new Set<string>()
  const duplicateIds: Array<number | string> = []

  for (const doc of docs as Array<{ id: number | string; keyId?: unknown; nonce?: unknown }>) {
    const key = JSON.stringify([doc.keyId, doc.nonce])

    if (seen.has(key)) {
      duplicateIds.push(doc.id)
    } else {
      seen.add(key)
    }
  }

  if (duplicateIds.length > 0) {
    await payload.db.deleteMany({ collection, req, where: { id: { in: duplicateIds } } })
    result.duplicateNoncesRemoved = duplicateIds.length
  }

  return result
}
