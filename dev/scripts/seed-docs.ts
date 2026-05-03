import type { Payload } from 'payload'

import { getPayload } from 'payload'

import {
  buildDevDocsGroupSeedData,
  buildDevDocsSetSeedData,
  devDocsGroupSlug,
  devDocsSetSlug,
  devDocsSourceId,
  getPayloadRecordId,
} from '../helpers/docsSeedData.js'
import config from '../payload.config.js'

const findFirst = async ({
  collection,
  payload,
  where,
}: {
  collection: string
  payload: Payload
  where: Record<string, unknown>
}): Promise<unknown> => {
  const result = await payload.find({
    collection,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where,
  })

  return result.docs[0]
}

const upsert = async ({
  collection,
  data,
  payload,
  where,
}: {
  collection: string
  data: Record<string, unknown>
  payload: Payload
  where: Record<string, unknown>
}): Promise<unknown> => {
  const existing = await findFirst({
    collection,
    payload,
    where,
  })
  const id = getPayloadRecordId(existing)

  if (id) {
    return payload.update({
      id,
      collection,
      data,
      overrideAccess: true,
    })
  }

  return payload.create({
    collection,
    data,
    overrideAccess: true,
  })
}

const run = async () => {
  const payload = await getPayload({ config })

  try {
    const group = await upsert({
      collection: devDocsGroupSlug,
      data: buildDevDocsGroupSeedData(),
      payload,
      where: {
        slug: {
          equals: 'plugins',
        },
      },
    })
    const groupId = getPayloadRecordId(group)

    const docsSet = await upsert({
      collection: devDocsSetSlug,
      data: buildDevDocsSetSeedData({
        groupId,
      }),
      payload,
      where: {
        sourceId: {
          equals: devDocsSourceId,
        },
      },
    })

    process.stdout.write(`Seeded docs group: ${groupId ?? 'created'}\n`)
    process.stdout.write(`Seeded docs set: ${getPayloadRecordId(docsSet) ?? 'created'}\n`)
  } finally {
    await payload.destroy()
  }
}

await run()
