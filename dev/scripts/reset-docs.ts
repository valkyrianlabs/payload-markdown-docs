import type { CollectionSlug, Payload, Where } from 'payload'

import { getPayload } from 'payload'

import {
  devDocsGroupSlug,
  devDocsSetSlug,
  devDocsSourceId,
  getPayloadRecordId,
} from '../helpers/docsSeedData'
import config from '../payload.config'

const findAll = async ({
  collection,
  payload,
  where,
}: {
  collection: CollectionSlug
  payload: Payload
  where?: Where
}): Promise<unknown[]> => {
  const result = await payload.find({
    collection,
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    where,
  })

  return result.docs
}

const deleteRecords = async ({
  collection,
  payload,
  where,
}: {
  collection: CollectionSlug
  payload: Payload
  where?: Where
}): Promise<number> => {
  const records = await findAll({
    collection,
    payload,
    where,
  })
  let deleted = 0

  for (const record of records) {
    const id = getPayloadRecordId(record)

    if (!id) {
      continue
    }

    await payload.delete({
      id,
      collection,
      overrideAccess: true,
    })
    deleted += 1
  }

  return deleted
}

const run = async () => {
  const payload = await getPayload({ config })

  try {
    const docsSets = await findAll({
      collection: devDocsSetSlug,
      payload,
      where: {
        slug: {
          equals: devDocsSourceId,
        },
      },
    })
    const docsSetId = getPayloadRecordId(docsSets[0])
    const docsWhere: Where = docsSetId
      ? {
          or: [
            {
              docsSet: {
                equals: docsSetId,
              },
            },
            {
              'sync.sourceId': {
                equals: devDocsSourceId,
              },
            },
          ],
        }
      : {
          'sync.sourceId': {
            equals: devDocsSourceId,
          },
        }

    const deletedDocs = await deleteRecords({
      collection: 'docs',
      payload,
      where: docsWhere,
    })
    const deletedRuns = await deleteRecords({
      collection: 'docs-sync-runs',
      payload,
      where: {
        sourceId: {
          equals: devDocsSourceId,
        },
      },
    })
    const deletedNonces = await deleteRecords({
      collection: 'docs-sync-nonces',
      payload,
      where: {
        sourceId: {
          equals: devDocsSourceId,
        },
      },
    })

    for (const docsSet of docsSets) {
      const id = getPayloadRecordId(docsSet)

      if (id) {
        await payload.delete({
          id,
          collection: devDocsSetSlug,
          overrideAccess: true,
        })
      }
    }

    const groups = await findAll({
      collection: devDocsGroupSlug,
      payload,
      where: {
        slug: {
          equals: 'plugins',
        },
      },
    })

    for (const group of groups) {
      const groupId = getPayloadRecordId(group)

      if (!groupId) {
        continue
      }

      const remainingDocsSets = await findAll({
        collection: devDocsSetSlug,
        payload,
        where: {
          group: {
            equals: groupId,
          },
        },
      })

      if (remainingDocsSets.length === 0) {
        await payload.delete({
          id: groupId,
          collection: devDocsGroupSlug,
          overrideAccess: true,
        })
      }
    }

    process.stdout.write(`Deleted generated docs: ${deletedDocs}\n`)
    process.stdout.write(`Deleted sync runs: ${deletedRuns}\n`)
    process.stdout.write(`Deleted nonces: ${deletedNonces}\n`)
    process.stdout.write(`Deleted docs sets: ${docsSets.length}\n`)
  } finally {
    await payload.destroy()
  }
}

await run()
