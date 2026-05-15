import type { Payload } from 'payload'

import { sha256Hex } from '../src/sync/hash'
import { devUser } from './helpers/credentials'
import {
  buildDevDocsGroupSeedData,
  buildDevDocsSetSeedData,
  devDocsGroupSlug,
  devDocsSetSlug,
  devDocsSourceId,
  getPayloadRecordId,
} from './helpers/docsSeedData'

const assetsCollectionSlug = 'payload-markdown-docs-assets'
const docsSetAssets = [
  {
    content: `# Valkyrian Labs Documentation

Root AI discovery file for the dev docs site.
`,
    contentType: 'text/plain; charset=utf-8',
    kind: 'llms',
    route: '/llms.txt',
    sourcePath: 'llms.txt',
  },
  {
    content: `# Valkyrian Labs Documentation Full Index

Expanded AI discovery file for the dev docs site.
`,
    contentType: 'text/plain; charset=utf-8',
    kind: 'llms-full',
    route: '/llms-full.txt',
    sourcePath: 'llms-full.txt',
  },
  {
    content: '# Codex Skill\n\nUse this Codex skill for Payload Markdown Docs.\n',
    contentType: 'text/markdown; charset=utf-8',
    kind: 'skill',
    route: '/plugins/payload-markdown-docs/skills/codex/SKILL.md',
    sourcePath: 'skills/payload-markdown-docs/codex/SKILL.md',
  },
  {
    content: '# Codex Workflow\n\nReference workflow content.\n',
    contentType: 'text/markdown; charset=utf-8',
    kind: 'skill',
    route: '/plugins/payload-markdown-docs/skills/codex/reference/workflow.md',
    sourcePath: 'skills/payload-markdown-docs/codex/reference/workflow.md',
  },
  {
    content: '# Claude Skill\n\nUse this Claude skill for Payload Markdown Docs.\n',
    contentType: 'text/markdown; charset=utf-8',
    kind: 'skill',
    route: '/plugins/payload-markdown-docs/skills/claude/SKILL.md',
    sourcePath: 'skills/payload-markdown-docs/claude/SKILL.md',
  },
]

const upsertByEquals = async ({
  collection,
  data,
  field,
  payload,
  value,
}: {
  collection: string
  data: Record<string, unknown>
  field: string
  payload: Payload
  value: string
}) => {
  const existing = await payload.find({
    collection,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      [field]: {
        equals: value,
      },
    },
  })
  const id = getPayloadRecordId(existing.docs[0])

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

const seedDocsAssets = async (payload: Payload) => {
  const group = await upsertByEquals({
    collection: devDocsGroupSlug,
    data: buildDevDocsGroupSeedData(),
    field: 'slug',
    payload,
    value: 'plugins',
  })
  const groupId = getPayloadRecordId(group)
  const docsSet = await upsertByEquals({
    collection: devDocsSetSlug,
    data: buildDevDocsSetSeedData({
      groupId,
    }),
    field: 'slug',
    payload,
    value: devDocsSourceId,
  })
  const docsSetId = getPayloadRecordId(docsSet)
  const now = new Date().toISOString()

  for (const asset of docsSetAssets) {
    const sourceHash = sha256Hex(asset.content)

    await upsertByEquals({
      collection: assetsCollectionSlug,
      data: {
        ...asset,
        docsSet: docsSetId,
        sourceHash,
        sourceId: devDocsSourceId,
        sync: {
          archived: false,
          archivedAt: null,
          contentHashAtLastSync: sourceHash,
          lastSyncedAt: now,
          managedBy: 'payload-markdown-docs',
          sourceHashAtLastSync: sourceHash,
          sourceId: devDocsSourceId,
          sourcePath: asset.sourcePath,
        },
      },
      field: 'sourcePath',
      payload,
      value: asset.sourcePath,
    })
  }
}

export const seed = async (payload: Payload) => {
  try {
    const { totalDocs } = await payload.count({
      collection: 'users',
      where: {
        email: {
          equals: devUser.email,
        },
      },
    })

    if (!totalDocs) {
      await payload.create({
        collection: 'users',
        data: devUser,
      })
    }
  } catch {
    // The dev harness may run without an auth collection.
  }

  await seedDocsAssets(payload)
}
