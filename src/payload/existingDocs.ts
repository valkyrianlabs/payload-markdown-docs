import type { ExistingDocsRecord } from '../sync/index.js'

export type ExistingDocsPayloadOperations = {
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toExistingDocsRecord = (doc: unknown): ExistingDocsRecord | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  if (typeof doc.route !== 'string' || typeof doc.sourcePath !== 'string') {
    return undefined
  }

  const sync = isRecord(doc.sync) ? doc.sync : undefined

  return {
    archived: typeof sync?.archived === 'boolean' ? sync.archived : undefined,
    route: doc.route,
    sourceHash: typeof doc.sourceHash === 'string' ? doc.sourceHash : undefined,
    sourcePath: doc.sourcePath,
    title: typeof doc.title === 'string' ? doc.title : undefined,
  }
}

export const findExistingDocsRecords = async ({
  collectionSlug,
  payload,
  sourceId,
}: {
  collectionSlug: string
  payload: ExistingDocsPayloadOperations
  sourceId: string
}): Promise<ExistingDocsRecord[]> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    where: {
      'sync.sourceId': {
        equals: sourceId,
      },
    },
  })

  return result.docs
    .map((doc) => toExistingDocsRecord(doc))
    .filter((doc): doc is ExistingDocsRecord => doc !== undefined)
}

