import type { PayloadMarkdownDocsDocsSetAuthConfig } from '../types.js'

export type DocsSetPayloadOperations = {
  find: (args: {
    collection: string
    depth?: number
    limit?: number
    overrideAccess?: boolean
    where?: unknown
  }) => Promise<{
    docs: unknown[]
  }>
  update?: (args: {
    collection: string
    data: Record<string, unknown>
    id: string
    overrideAccess?: boolean
  }) => Promise<Record<string, unknown>>
}

export type PayloadRecordId = number | string

export type ResolvedDocsSet = {
  auth?: PayloadMarkdownDocsDocsSetAuthConfig
  id: PayloadRecordId
  routeBase: string
  sourceId: string
  sourceRoot?: string
}

export const updateDocsSetAfterSync = async ({
  aiExport,
  collectionSlug,
  docsCount,
  docsSetId,
  now,
  payload,
  syncRunId,
}: {
  aiExport?: unknown
  collectionSlug: string
  docsCount: number
  docsSetId: PayloadRecordId
  now: Date
  payload: DocsSetPayloadOperations
  syncRunId?: PayloadRecordId
}): Promise<void> => {
  if (!payload.update) {
    return
  }

  await payload.update({
    id: String(docsSetId),
    collection: collectionSlug,
    data: {
      aiExport: aiExport ?? null,
      sync: {
        docsCount,
        lastStatus: 'success',
        lastSyncedAt: now.toISOString(),
        lastSyncRunId: syncRunId,
      },
    },
    overrideAccess: true,
  })
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getRecordId = (doc: Record<string, unknown>): PayloadRecordId | undefined => {
  if (typeof doc.id === 'string' || typeof doc.id === 'number') {
    return doc.id
  }

  return undefined
}

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

const getNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const getStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined
  }

  const values = value.flatMap((item) => {
    if (typeof item === 'string' && item.trim() !== '') {
      return [item.trim()]
    }

    if (isRecord(item)) {
      const nestedValue = getString(item.value)

      return nestedValue ? [nestedValue] : []
    }

    return []
  })

  return values.length > 0 ? values : undefined
}

const getRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined

const toResolvedDocsSetAuth = (
  value: unknown,
): PayloadMarkdownDocsDocsSetAuthConfig | undefined => {
  const auth = getRecord(value)

  if (!auth) {
    return undefined
  }

  const ed25519 = getRecord(auth.ed25519)
  const keys = Array.isArray(ed25519?.keys)
    ? ed25519.keys.flatMap((key) => {
        if (!isRecord(key)) {
          return []
        }

        const id = getString(key.keyId) ?? getString(key.id)
        const publicKey = getString(key.publicKey)

        return id && publicKey
          ? [
              {
                id,
                publicKey,
              },
            ]
          : []
      })
    : []
  const githubOidc = getRecord(auth.githubOidc)
  const resolvedGithubOidc =
    githubOidc && githubOidc.enabled !== false
      ? {
          allowedEnvironments: getStringArray(githubOidc.allowedEnvironments),
          allowedRefs: getStringArray(githubOidc.allowedRefs),
          allowedRepositories: getStringArray(githubOidc.allowedRepositories),
          allowedRepositoryOwners: getStringArray(githubOidc.allowedRepositoryOwners),
          allowedWorkflowRefs: getStringArray(githubOidc.allowedWorkflowRefs),
          allowedWorkflows: getStringArray(githubOidc.allowedWorkflows),
          allowPullRequests:
            typeof githubOidc.allowPullRequests === 'boolean'
              ? githubOidc.allowPullRequests
              : undefined,
          audience: getString(githubOidc.audience),
          enabled: githubOidc.enabled === true,
          issuer: getString(githubOidc.issuer),
          jwksUrl: getString(githubOidc.jwksUrl),
          maxSkewSeconds: getNumber(githubOidc.maxSkewSeconds),
        }
      : undefined
  const hasGithubOidcPolicy = Boolean(
    resolvedGithubOidc &&
    (resolvedGithubOidc.enabled ||
      resolvedGithubOidc.audience ||
      resolvedGithubOidc.allowedEnvironments ||
      resolvedGithubOidc.allowedRefs ||
      resolvedGithubOidc.allowedRepositories ||
      resolvedGithubOidc.allowedRepositoryOwners ||
      resolvedGithubOidc.allowedWorkflowRefs ||
      resolvedGithubOidc.allowedWorkflows ||
      resolvedGithubOidc.allowPullRequests !== undefined ||
      resolvedGithubOidc.issuer ||
      resolvedGithubOidc.jwksUrl ||
      resolvedGithubOidc.maxSkewSeconds !== undefined),
  )
  const resolvedAuth: PayloadMarkdownDocsDocsSetAuthConfig = {
    ...(keys.length > 0
      ? {
          ed25519: {
            keys,
            maxSkewSeconds: getNumber(ed25519?.maxSkewSeconds),
            nonceTtlSeconds: getNumber(ed25519?.nonceTtlSeconds),
          },
        }
      : {}),
    ...(hasGithubOidcPolicy && resolvedGithubOidc
      ? {
          githubOidc: resolvedGithubOidc,
        }
      : {}),
  }

  return resolvedAuth.ed25519 || resolvedAuth.githubOidc ? resolvedAuth : undefined
}

const toResolvedDocsSet = (doc: unknown): ResolvedDocsSet | undefined => {
  if (!isRecord(doc)) {
    return undefined
  }

  const id = getRecordId(doc)

  if (!id || typeof doc.sourceId !== 'string' || typeof doc.routeBase !== 'string') {
    return undefined
  }

  return {
    id,
    auth: toResolvedDocsSetAuth(doc.auth),
    routeBase: doc.routeBase,
    sourceId: doc.sourceId,
    sourceRoot: typeof doc.sourceRoot === 'string' ? doc.sourceRoot : undefined,
  }
}

export const findDocsSetBySourceId = async ({
  collectionSlug,
  payload,
  sourceId,
}: {
  collectionSlug: string
  payload: DocsSetPayloadOperations
  sourceId: string
}): Promise<ResolvedDocsSet | undefined> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      sourceId: {
        equals: sourceId,
      },
    },
  })

  return toResolvedDocsSet(result.docs[0])
}
