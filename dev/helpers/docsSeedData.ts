export const devDocsSourceId = 'payload-markdown-docs'
export const devDocsGroupSlug = 'docs-groups'
export const devDocsKeySlug = 'docs-keys'
export const devDocsSetSlug = 'docs-sets'
export const devDocsTrustedSlug = 'docs-trusted'

export type PayloadRecordId = number | string

export const getPayloadRecordId = (record: unknown): PayloadRecordId | undefined => {
  if (!record || typeof record !== 'object' || !('id' in record)) {
    return undefined
  }

  const id = (record as { id?: PayloadRecordId }).id

  return id === undefined ? undefined : id
}

export const buildDevDocsGroupSeedData = () => ({
  slug: 'plugins',
  description: 'Dev docs namespace for plugin documentation.',
  navTitle: 'Plugins',
  order: 0,
  title: 'Plugins',
})

export const buildDevDocsSetSeedData = ({
  groupId,
}: {
  groupId?: PayloadRecordId
} = {}) => ({
  branch: 'main',
  description: 'Local dev docs set for end-to-end dedicated docs testing.',
  ...(groupId !== undefined ? { group: groupId } : {}),
  slug: 'payload-markdown-docs',
  title: 'Payload Markdown Docs',
})

export const buildDevDocsKeySeedData = ({
  keyId = 'dev-local',
  publicKey,
}: {
  keyId?: string
  publicKey: string
}) => ({
  keyId,
  publicKey,
  title: 'Dev Local',
})

export const buildDevDocsTrustedSeedData = () => ({
  limitRepos: false,
  owner: 'valkyrianlabs',
  title: 'Valkyrian Labs',
})
