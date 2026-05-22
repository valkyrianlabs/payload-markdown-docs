import type { ExistingAssetRecord } from '../sync/index.js'

export type ExistingAssetsPayloadOperations = {
  find: (args: {
    collection: string
    depth?: number
    limit?: number
    overrideAccess?: boolean
    select?: Record<string, boolean>
    where?: unknown
  }) => Promise<{
    docs: unknown[]
  }>
}

export type ExistingPayloadDocsAssetRecord = {
  content?: string
  docsSetId?: number | string
  id: string
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
} & ExistingAssetRecord

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

const toExistingPayloadDocsAssetRecord = (
  doc: unknown,
): ExistingPayloadDocsAssetRecord | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  const id = getRecordId(doc)

  if (
    !id ||
    typeof doc.sourcePath !== 'string' ||
    typeof doc.kind !== 'string' ||
    typeof doc.contentType !== 'string'
  ) {
    return undefined
  }

  const sync = isRecord(doc.sync) ? doc.sync : undefined

  return {
    id,
    archived: typeof sync?.archived === 'boolean' ? sync.archived : undefined,
    content: typeof doc.content === 'string' ? doc.content : undefined,
    contentType: doc.contentType,
    docsSetId: getRelationshipId(doc.docsSet),
    kind: doc.kind,
    route: typeof doc.route === 'string' ? doc.route : undefined,
    sourceHash: typeof doc.sourceHash === 'string' ? doc.sourceHash : undefined,
    sourcePath: doc.sourcePath,
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
  }
}

export const toExistingAssetRecord = (
  asset: ExistingPayloadDocsAssetRecord,
): ExistingAssetRecord => ({
  archived: asset.archived,
  contentType: asset.contentType,
  kind: asset.kind,
  route: asset.route,
  sourceHash: asset.sourceHash,
  sourcePath: asset.sourcePath,
})

export const findExistingPayloadDocsAssetRecords = async ({
  collectionSlug,
  docsSetId,
  payload,
  sourceId,
}: {
  collectionSlug: string
  docsSetId?: number | string
  payload: ExistingAssetsPayloadOperations
  sourceId: string
}): Promise<ExistingPayloadDocsAssetRecord[]> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
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
    .map(toExistingPayloadDocsAssetRecord)
    .filter((doc): doc is ExistingPayloadDocsAssetRecord => doc !== undefined)
}
