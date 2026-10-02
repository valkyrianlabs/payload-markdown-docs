export type NoncePayloadOperations = {
  create: (args: {
    collection: string
    data: Record<string, unknown>
    overrideAccess?: boolean
  }) => Promise<Record<string, unknown>>
  db?: {
    deleteMany?: (args: { collection: string; where: unknown }) => Promise<unknown>
  }
  delete?: (args: {
    collection: string
    overrideAccess?: boolean
    where: unknown
  }) => Promise<unknown>
  find: (args: {
    collection: string
    depth?: number
    limit?: number
    overrideAccess?: boolean
    where?: unknown
  }) => Promise<{
    docs: unknown[]
  }>
}

export const assertNonceNotReplayed = async ({
  collectionSlug,
  keyId,
  nonce,
  now,
  payload,
}: {
  collectionSlug: string
  keyId: string
  nonce: string
  now: Date
  payload: NoncePayloadOperations
}): Promise<boolean> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [
        {
          keyId: {
            equals: keyId,
          },
        },
        {
          nonce: {
            equals: nonce,
          },
        },
        {
          expiresAt: {
            greater_than_equal: now.toISOString(),
          },
        },
      ],
    },
  })

  return result.docs.length === 0
}

export const storeAcceptedNonce = async ({
  bodyHash,
  collectionSlug,
  expiresAt,
  keyId,
  nonce,
  payload,
  sourceId,
  syncRunId,
  usedAt,
}: {
  bodyHash: string
  collectionSlug: string
  expiresAt: Date
  keyId: string
  nonce: string
  payload: NoncePayloadOperations
  sourceId: string
  syncRunId?: string
  usedAt: Date
}): Promise<Record<string, unknown>> =>
  payload.create({
    collection: collectionSlug,
    data: {
      bodyHash,
      expiresAt: expiresAt.toISOString(),
      keyId,
      nonce,
      sourceId,
      syncRunId,
      usedAt: usedAt.toISOString(),
    },
    overrideAccess: true,
  })


const findNonceRows = async ({
  collectionSlug,
  keyId,
  nonce,
  payload,
}: {
  collectionSlug: string
  keyId: string
  nonce: string
  payload: NoncePayloadOperations
}): Promise<Record<string, unknown>[]> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 10,
    overrideAccess: true,
    where: {
      and: [
        {
          keyId: {
            equals: keyId,
          },
        },
        {
          nonce: {
            equals: nonce,
          },
        },
      ],
    },
  })

  return result.docs.filter(
    (doc): doc is Record<string, unknown> => typeof doc === 'object' && doc !== null,
  )
}

const isUnexpired = (doc: Record<string, unknown>, now: Date): boolean => {
  const expiresAt = typeof doc.expiresAt === 'string' ? Date.parse(doc.expiresAt) : Number.NaN

  // Unparseable expiry counts as live: fail closed.
  return Number.isNaN(expiresAt) || expiresAt >= now.getTime()
}

/**
 * Insert-first replay protection (DOCS-8).
 *
 * The nonce row is inserted before any further work; the collection's unique
 * (keyId, nonce) index makes concurrent duplicates fail, and a failed insert whose row
 * already exists (and has not expired) is a replay. This replaces check-then-insert,
 * which accepted every concurrent duplicate, and records the nonce even when the
 * request is rejected later (route collision, invalid manifest, policy errors).
 *
 * Returns false for a replay. Rethrows errors that are not explained by an existing row.
 */
export const consumeNonce = async ({
  bodyHash,
  collectionSlug,
  expiresAt,
  keyId,
  nonce,
  now,
  payload,
  sourceId,
}: {
  bodyHash: string
  collectionSlug: string
  expiresAt: Date
  keyId: string
  nonce: string
  now: Date
  payload: NoncePayloadOperations
  sourceId?: string
}): Promise<boolean> => {
  const insert = () =>
    storeAcceptedNonce({
      bodyHash,
      collectionSlug,
      expiresAt,
      keyId,
      nonce,
      payload,
      sourceId: sourceId ?? '',
      usedAt: now,
    })

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let inserted: Record<string, unknown>

    try {
      inserted = await insert()
    } catch (error) {
      const existing = await findNonceRows({
        collectionSlug,
        keyId,
        nonce,
        payload,
      })

      if (existing.length === 0) {
        throw error
      }

      if (existing.some((doc) => isUnexpired(doc, now)) || attempt > 0) {
        return false
      }

      // Only expired rows block the insert: their validity window has passed, so the
      // nonce may be recorded again.
      await deleteNonces({
        collectionSlug,
        payload,
        where: {
          and: [
            { keyId: { equals: keyId } },
            { nonce: { equals: nonce } },
            { expiresAt: { less_than: now.toISOString() } },
          ],
        },
      })

      continue
    }

    // The unique index can be missing (a MongoDB index build that failed on old duplicate
    // rows, or a migration that never ran), so the insert alone does not prove the nonce
    // is new. Another live row for the pair is a replay; concurrent requests then all fail
    // closed instead of all passing.
    const others = await findNonceRows({ collectionSlug, keyId, nonce, payload })

    return !others.some((doc) => doc.id !== inserted.id && isUnexpired(doc, now))
  }

  return false
}

const deleteNonces = async ({
  collectionSlug,
  payload,
  where,
}: {
  collectionSlug: string
  payload: NoncePayloadOperations
  where: unknown
}): Promise<void> => {
  if (typeof payload.db?.deleteMany === 'function') {
    await payload.db.deleteMany({
      collection: collectionSlug,
      where,
    })

    return
  }

  await payload.delete?.({
    collection: collectionSlug,
    overrideAccess: true,
    where,
  })
}

const lastNonceCleanupByCollection = new Map<string, number>()
const NONCE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000

/**
 * Best-effort removal of expired nonces (DOCS-20). Runs at most once per collection
 * every ten minutes per process. Expired rows are no longer needed for replay
 * protection because their timestamps/tokens are outside the accepted window.
 */
export const pruneExpiredNonces = async ({
  collectionSlug,
  now,
  payload,
}: {
  collectionSlug: string
  now: Date
  payload: NoncePayloadOperations
}): Promise<void> => {
  const lastCleanup = lastNonceCleanupByCollection.get(collectionSlug) ?? 0

  if (now.getTime() - lastCleanup < NONCE_CLEANUP_INTERVAL_MS) {
    return
  }

  lastNonceCleanupByCollection.set(collectionSlug, now.getTime())

  try {
    await deleteNonces({
      collectionSlug,
      payload,
      where: {
        expiresAt: {
          less_than: now.toISOString(),
        },
      },
    })
  } catch {
    // Cleanup is best effort and must never fail a sync.
  }
}
