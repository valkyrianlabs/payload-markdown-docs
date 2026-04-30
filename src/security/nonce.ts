export type NoncePayloadOperations = {
  create: (args: {
    collection: string
    data: Record<string, unknown>
    overrideAccess?: boolean
  }) => Promise<Record<string, unknown>>
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
            greater_than: now.toISOString(),
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

