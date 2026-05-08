import type { GitHubOidcTrustedSource } from '../security/index.js'

export type DocsTrustedPayloadOperations = {
  find: (args: {
    collection: string
    depth?: number
    limit?: number
    overrideAccess?: boolean
    where?: unknown
  }) => Promise<{
    docs: unknown[]
  }>
}

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

const toTrustedSource = (doc: unknown): GitHubOidcTrustedSource | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  const owner = getString(doc.owner)

  if (!owner) {
    return undefined
  }

  const limitRepos = doc.limitRepos === true

  return {
    limitRepos,
    owner,
    ...(limitRepos
      ? {
          repositories: getStringArray(doc.repositories),
        }
      : {}),
  }
}

export const findTrustedGitHubSources = async ({
  collectionSlug,
  payload,
}: {
  collectionSlug: string
  payload: DocsTrustedPayloadOperations
}): Promise<GitHubOidcTrustedSource[]> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1000,
    overrideAccess: true,
  })

  return result.docs
    .map(toTrustedSource)
    .filter((source): source is GitHubOidcTrustedSource => source !== undefined)
}
