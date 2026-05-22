export const devDocsSourceId = 'payload-markdown-docs'
export const devDocsAccessSlug = 'docs-access'
export const devDocsGroupSlug = 'docs-groups'
export const devDocsSetSlug = 'docs-sets'

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

export const buildDevDocsEd25519AccessSeedData = ({
  keyId = 'dev-local',
  publicKey,
}: {
  keyId?: string
  publicKey: string
}) => ({
  accessType: 'ed25519',
  identityKey: `ed25519:${keyId.trim()}`,
  keyId,
  publicKey,
  title: 'Dev Local',
})

export const buildDevDocsGitHubOidcAccessSeedData = () => ({
  accessType: 'githubOidc',
  identityKey: 'githubOidc:valkyrianlabs',
  limitRepos: false,
  owner: 'valkyrianlabs',
  title: 'Valkyrian Labs',
})
