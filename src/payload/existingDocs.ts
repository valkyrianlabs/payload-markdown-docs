import type { ExistingDocsRecord } from '../sync/index.js'

export type ExistingDocsPayloadOperations = {
  find: (args: {
    collection: string
    depth?: number
    draft?: boolean
    limit?: number
    overrideAccess?: boolean
    where?: unknown
  }) => Promise<{
    docs: unknown[]
  }>
}

export type ExistingPayloadDocsRecord = {
  content?: string
  docsSetId?: number | string
  id: string
  status?: 'draft' | 'published'
  sync?: {
    archived?: boolean
    archivedAt?: null | string
    contentHashAtLastSync?: string
    lastSyncedAt?: string
    lastSyncRunId?: string
    managedBy?: string
    sourceHashAtLastSync?: string
    sourceId?: string
    sourcePath?: string
  }
} & ExistingDocsRecord

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getRecordId = (doc: Record<string, unknown>): string | undefined => {
  if (typeof doc.id === 'string' || typeof doc.id === 'number') {
    return String(doc.id)
  }

  return undefined
}

const getRelationshipId = (value: unknown): string | undefined => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  if (isRecord(value)) {
    return getRecordId(value)
  }

  return undefined
}

const toExistingPayloadDocsRecord = ({
  doc,
  markdownFieldName,
}: {
  doc: unknown
  markdownFieldName: string
}): ExistingPayloadDocsRecord | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  const id = getRecordId(doc)

  if (!id || typeof doc.route !== 'string' || typeof doc.sourcePath !== 'string') {
    return undefined
  }

  const sync = isRecord(doc.sync) ? doc.sync : undefined
  const status = doc._status === 'draft' || doc._status === 'published' ? doc._status : undefined

  return {
    id,
    archived: typeof sync?.archived === 'boolean' ? sync.archived : undefined,
    content: typeof doc[markdownFieldName] === 'string' ? doc[markdownFieldName] : undefined,
    docsSetId: getRelationshipId(doc.docsSet),
    route: doc.route,
    sourceHash: typeof doc.sourceHash === 'string' ? doc.sourceHash : undefined,
    sourcePath: doc.sourcePath,
    status,
    sync: sync
      ? {
          archived: typeof sync.archived === 'boolean' ? sync.archived : undefined,
          archivedAt:
            typeof sync.archivedAt === 'string' || sync.archivedAt === null
              ? sync.archivedAt
              : undefined,
          contentHashAtLastSync:
            typeof sync.contentHashAtLastSync === 'string' ? sync.contentHashAtLastSync : undefined,
          lastSyncedAt: typeof sync.lastSyncedAt === 'string' ? sync.lastSyncedAt : undefined,
          lastSyncRunId: typeof sync.lastSyncRunId === 'string' ? sync.lastSyncRunId : undefined,
          managedBy: typeof sync.managedBy === 'string' ? sync.managedBy : undefined,
          sourceHashAtLastSync:
            typeof sync.sourceHashAtLastSync === 'string' ? sync.sourceHashAtLastSync : undefined,
          sourceId: typeof sync.sourceId === 'string' ? sync.sourceId : undefined,
          sourcePath: typeof sync.sourcePath === 'string' ? sync.sourcePath : undefined,
        }
      : undefined,
    title: typeof doc.title === 'string' ? doc.title : undefined,
  }
}

export const toExistingDocsRecord = (doc: ExistingPayloadDocsRecord): ExistingDocsRecord => ({
  archived: doc.archived,
  route: doc.route,
  sourceHash: doc.sourceHash,
  sourcePath: doc.sourcePath,
  status: doc.status,
  title: doc.title,
})

export const findExistingPayloadDocsRecords = async ({
  collectionSlug,
  docsSetId,
  draft,
  markdownFieldName,
  payload,
  sourceId,
}: {
  collectionSlug: string
  docsSetId?: number | string
  draft?: boolean
  markdownFieldName: string
  payload: ExistingDocsPayloadOperations
  sourceId: string
}): Promise<ExistingPayloadDocsRecord[]> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    draft,
    limit: 1000,
    overrideAccess: true,
    where: docsSetId
      ? {
          or: [
            {
              docsSet: {
                equals: docsSetId,
              },
            },
            {
              'sync.sourceId': {
                equals: sourceId,
              },
            },
          ],
        }
      : {
          'sync.sourceId': {
            equals: sourceId,
          },
        },
  })

  return result.docs
    .map((doc) =>
      toExistingPayloadDocsRecord({
        doc,
        markdownFieldName,
      }),
    )
    .filter((doc): doc is ExistingPayloadDocsRecord => doc !== undefined)
}

export const findExistingDocsRecords = async ({
  collectionSlug,
  docsSetId,
  draft,
  markdownFieldName,
  payload,
  sourceId,
}: {
  collectionSlug: string
  docsSetId?: number | string
  draft?: boolean
  markdownFieldName: string
  payload: ExistingDocsPayloadOperations
  sourceId: string
}): Promise<ExistingDocsRecord[]> => {
  const docs = await findExistingPayloadDocsRecords({
    collectionSlug,
    docsSetId,
    draft,
    markdownFieldName,
    payload,
    sourceId,
  })

  return docs.map(toExistingDocsRecord)
}
