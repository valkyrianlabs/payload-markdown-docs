import type { GitHubOidcTrustedSource } from '../security/index.js'

export type DocsAccessPayloadOperations = {
  find: (args: {
    collection: string
    depth?: number
    limit?: number
    overrideAccess?: boolean
    pagination?: boolean
    where?: unknown
  }) => Promise<{
    docs: unknown[]
  }>
}

export type DocsAccessType = 'ed25519' | 'githubOidc'

export type ResolvedDocsKey = {
  /** Docs set ids this key may sync; empty = every docs set (deprecated). */
  docsSetIds: string[]
  id: string
  publicKey: string
}

export type ScopedGitHubOidcTrustedSource = {
  /** Docs set ids this owner/repository record may sync; empty = every docs set. */
  docsSetIds: string[]
} & GitHubOidcTrustedSource

const getRelationshipIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (typeof item === 'string' || typeof item === 'number') {
      return [String(item)]
    }

    if (isRecord(item)) {
      const nested = isRecord(item.value) ? item.value.id : (item.value ?? item.id)

      return typeof nested === 'string' || typeof nested === 'number' ? [String(nested)] : []
    }

    return []
  })
}

/** True when a credential scoped to `docsSetIds` may sync `docsSetId`. */
export const isDocsSetInScope = (docsSetIds: string[], docsSetId: number | string): boolean =>
  docsSetIds.length === 0 || docsSetIds.includes(String(docsSetId))

const docsAccessTypes = new Set<DocsAccessType>(['ed25519', 'githubOidc'])

export const isDocsAccessType = (value: string): value is DocsAccessType =>
  docsAccessTypes.has(value as DocsAccessType)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

const getStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (typeof item === 'string' && item.trim() !== '') {
      return [item.trim()]
    }

    if (isRecord(item)) {
      const nestedValue = getString(item.value)

      return nestedValue ? [nestedValue] : []
    }

    return []
  })
}

export const buildDocsAccessIdentityKey = ({
  accessType,
  keyId,
  owner,
}: {
  accessType: DocsAccessType
  keyId?: string
  owner?: string
}): string | undefined => {
  if (accessType === 'ed25519') {
    const trimmedKeyId = keyId?.trim()

    return trimmedKeyId ? `ed25519:${trimmedKeyId}` : undefined
  }

  const trimmedOwner = owner?.trim().toLowerCase()

  return trimmedOwner ? `githubOidc:${trimmedOwner}` : undefined
}

const toResolvedDocsKey = (doc: unknown): ResolvedDocsKey | undefined => {
  if (!isRecord(doc) || doc.accessType !== 'ed25519') {
    return undefined
  }

  const id = getString(doc.keyId)
  const publicKey = getString(doc.publicKey)

  return id && publicKey
    ? {
        id,
        docsSetIds: getRelationshipIds(doc.docsSets),
        publicKey,
      }
    : undefined
}

const toTrustedSource = (doc: unknown): ScopedGitHubOidcTrustedSource | undefined => {
  if (!isRecord(doc) || doc.accessType !== 'githubOidc') {
    return undefined
  }

  const owner = getString(doc.owner)

  if (!owner) {
    return undefined
  }

  const limitRepos = doc.limitRepos === true

  return {
    docsSetIds: getRelationshipIds(doc.docsSets),
    limitRepos,
    owner,
    ...(limitRepos
      ? {
          repositories: getStringArray(doc.repositories),
        }
      : {}),
  }
}

export const findDocsKeyById = async ({
  collectionSlug,
  keyId,
  payload,
}: {
  collectionSlug: string
  keyId: string
  payload: DocsAccessPayloadOperations
}): Promise<ResolvedDocsKey | undefined> => {
  const identityKey = buildDocsAccessIdentityKey({
    accessType: 'ed25519',
    keyId,
  })

  if (!identityKey) {
    return undefined
  }

  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      identityKey: {
        equals: identityKey,
      },
    },
  })

  return toResolvedDocsKey(result.docs[0])
}

export const findTrustedGitHubSources = async ({
  collectionSlug,
  payload,
}: {
  collectionSlug: string
  payload: DocsAccessPayloadOperations
}): Promise<ScopedGitHubOidcTrustedSource[]> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    overrideAccess: true,
    pagination: false,
    where: {
      accessType: {
        equals: 'githubOidc',
      },
    },
  })

  return result.docs
    .map(toTrustedSource)
    .filter((source): source is ScopedGitHubOidcTrustedSource => source !== undefined)
}
