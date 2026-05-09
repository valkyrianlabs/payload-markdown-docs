export type PublishGeneratedDocsPayloadOperations = {
  find: (args: {
    collection: string
    depth?: number
    limit?: number
    overrideAccess?: boolean
    where?: unknown
  }) => Promise<{
    docs: unknown[]
  }>
  update: (args: {
    collection: string
    data: Record<string, unknown>
    id: number | string
    overrideAccess?: boolean
  }) => Promise<unknown>
}

export type PublishGeneratedDocsResult = {
  archived: number
  drafts: number
  published: number
  total: number
  updated: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getRecordId = (doc: Record<string, unknown>): number | string | undefined => {
  if (typeof doc.id === 'string' || typeof doc.id === 'number') {
    return doc.id
  }

  return undefined
}

const getRelationshipId = (value: unknown): string | undefined => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  if (isRecord(value)) {
    const id = getRecordId(value)

    return id === undefined ? undefined : String(id)
  }

  return undefined
}

const isArchived = (doc: Record<string, unknown>): boolean => {
  const sync = isRecord(doc.sync) ? doc.sync : undefined

  return sync?.archived === true
}

export const publishGeneratedDocsForSet = async ({
  docsCollectionSlug,
  docsSetId,
  payload,
}: {
  docsCollectionSlug: string
  docsSetId: number | string
  payload: PublishGeneratedDocsPayloadOperations
}): Promise<PublishGeneratedDocsResult> => {
  const result = await payload.find({
    collection: docsCollectionSlug,
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    where: {
      docsSet: {
        equals: docsSetId,
      },
    },
  })

  const summary: PublishGeneratedDocsResult = {
    archived: 0,
    drafts: 0,
    published: 0,
    total: 0,
    updated: 0,
  }

  for (const rawDoc of result.docs) {
    if (!isRecord(rawDoc)) {
      continue
    }

    if (getRelationshipId(rawDoc.docsSet) !== String(docsSetId)) {
      continue
    }

    summary.total += 1

    if (isArchived(rawDoc)) {
      summary.archived += 1
      continue
    }

    if (rawDoc._status === 'published') {
      summary.published += 1
      continue
    }

    if (rawDoc._status === 'draft') {
      summary.drafts += 1
    }

    const id = getRecordId(rawDoc)

    if (id === undefined) {
      continue
    }

    await payload.update({
      id,
      collection: docsCollectionSlug,
      data: {
        _status: 'published',
      },
      overrideAccess: true,
    })
    summary.updated += 1
    summary.published += 1
  }

  return summary
}
