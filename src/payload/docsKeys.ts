export type DocsKeyPayloadOperations = {
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

export type ResolvedDocsKey = {
  id: string
  publicKey: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

const toResolvedDocsKey = (doc: unknown): ResolvedDocsKey | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  const id = getString(doc.keyId)
  const publicKey = getString(doc.publicKey)

  return id && publicKey
    ? {
        id,
        publicKey,
      }
    : undefined
}

export const findDocsKeyById = async ({
  collectionSlug,
  keyId,
  payload,
}: {
  collectionSlug: string
  keyId: string
  payload: DocsKeyPayloadOperations
}): Promise<ResolvedDocsKey | undefined> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      keyId: {
        equals: keyId,
      },
    },
  })

  return toResolvedDocsKey(result.docs[0])
}
