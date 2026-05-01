export type DocsSetPayloadOperations = {
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

export type ResolvedDocsSet = {
  id: string
  routeBase: string
  sourceId: string
  sourceRoot?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getRecordId = (doc: Record<string, unknown>): string | undefined => {
  if (typeof doc.id === 'string' || typeof doc.id === 'number') {
    return String(doc.id)
  }

  return undefined
}

const toResolvedDocsSet = (doc: unknown): ResolvedDocsSet | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  const id = getRecordId(doc)

  if (
    !id ||
    typeof doc.sourceId !== 'string' ||
    typeof doc.routeBase !== 'string'
  ) {
    return undefined
  }

  return {
    id,
    routeBase: doc.routeBase,
    sourceId: doc.sourceId,
    sourceRoot: typeof doc.sourceRoot === 'string' ? doc.sourceRoot : undefined,
  }
}

export const findDocsSetBySourceId = async ({
  collectionSlug,
  payload,
  sourceId,
}: {
  collectionSlug: string
  payload: DocsSetPayloadOperations
  sourceId: string
}): Promise<ResolvedDocsSet | undefined> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      sourceId: {
        equals: sourceId,
      },
    },
  })

  return toResolvedDocsSet(result.docs[0])
}
