import type { CollectionSlug, Payload, Where } from 'payload'

import { getPayload } from 'payload'

import {
  buildDevDocsEd25519AccessSeedData,
  buildDevDocsGitHubOidcAccessSeedData,
  buildDevDocsGroupSeedData,
  buildDevDocsSetSeedData,
  devDocsAccessSlug,
  devDocsGroupSlug,
  devDocsSetSlug,
  devDocsSourceId,
  getPayloadRecordId,
} from '../helpers/docsSeedData'
import { docsSyncKeyId, readDocsSyncPublicKey } from '../helpers/docsSyncKeys'
import config from '../payload.config'

const findFirst = async ({
  collection,
  payload,
  where,
}: {
  collection: CollectionSlug
  payload: Payload
  where: Where
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
  collection: CollectionSlug
  data: Record<string, unknown>
  payload: Payload
  where: Where
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
  const docsSyncPublicKey = readDocsSyncPublicKey()

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
        slug: {
          equals: devDocsSourceId,
        },
      },
    })
    const docsKeyAccess = docsSyncPublicKey
      ? await upsert({
          collection: devDocsAccessSlug,
          data: buildDevDocsEd25519AccessSeedData({
            keyId: docsSyncKeyId,
            publicKey: docsSyncPublicKey,
          }),
          payload,
          where: {
            identityKey: {
              equals: `ed25519:${docsSyncKeyId}`,
            },
          },
        })
      : undefined
    const githubAccess = await upsert({
      collection: devDocsAccessSlug,
      data: buildDevDocsGitHubOidcAccessSeedData(),
      payload,
      where: {
        identityKey: {
          equals: 'githubOidc:valkyrianlabs',
        },
      },
    })

    process.stdout.write(`Seeded docs group: ${groupId ?? 'created'}\n`)
    process.stdout.write(`Seeded docs set: ${getPayloadRecordId(docsSet) ?? 'created'}\n`)
    process.stdout.write(
      `Seeded docs GitHub OIDC access: ${getPayloadRecordId(githubAccess) ?? 'created'}\n`,
    )
    if (!docsSyncPublicKey) {
      process.stdout.write('Docs sync public key not found; Ed25519 access was not updated.\n')
    } else {
      process.stdout.write(
        `Seeded docs Ed25519 access: ${getPayloadRecordId(docsKeyAccess) ?? 'created'}\n`,
      )
    }
  } finally {
    await payload.destroy()
  }
}

await run()
