import type { Config, PayloadRequest } from 'payload'

import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_DOCS_ACCESS_COLLECTION_SLUG,
  DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
  DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
  MANAGED_BY,
} from '../constants.js'
import { payloadMarkdownDocs } from '../plugin.js'
import {
  buildCanonicalSigningString,
  getCanonicalPathFromRequestUrl,
  toBase64Url,
} from '../security/index.js'
import { buildDocsManifest, sha256Hex } from '../sync/index.js'
import { createSyncEndpoint } from './index.js'

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstableCache: vi.fn((callback: (...args: unknown[]) => Promise<unknown>) => callback),
}))

vi.mock('next/cache', () => ({
  revalidatePath: cacheMocks.revalidatePath,
  revalidateTag: cacheMocks.revalidateTag,
  unstable_cache: cacheMocks.unstableCache,
}))

const now = new Date('2026-01-01T00:00:00.000Z')

const keyPair = () =>
  generateKeyPairSync('ed25519', {
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
  })

const rsaKeyPair = () =>
  generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })

type MockPayload = {
  create: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  find: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

let currentPublicKey = ''

beforeEach(() => {
  cacheMocks.revalidatePath.mockClear()
  cacheMocks.revalidateTag.mockClear()
  cacheMocks.unstableCache.mockClear()
})

const getEqualsConstraint = (where: unknown, field: string): string | undefined => {
  if (typeof where !== 'object' || where === null || Array.isArray(where)) {
    return undefined
  }

  const fieldConstraint = (where as Record<string, unknown>)[field]

  if (
    typeof fieldConstraint !== 'object' ||
    fieldConstraint === null ||
    Array.isArray(fieldConstraint)
  ) {
    return undefined
  }

  const value = (fieldConstraint as Record<string, unknown>).equals

  return typeof value === 'string' ? value : undefined
}

const filterDocsByEquals = (docs: unknown[], where: unknown, field: string): unknown[] => {
  const expected = getEqualsConstraint(where, field)

  if (!expected) {
    return docs
  }

  return docs.filter((doc) => {
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
      return false
    }

    return (doc as Record<string, unknown>)[field] === expected
  })
}

const filterDocsByWhereEquals = (docs: unknown[], where: unknown): unknown[] => {
  if (typeof where !== 'object' || where === null || Array.isArray(where)) {
    return docs
  }

  const constraints = Object.entries(where as Record<string, unknown>).flatMap(
    ([field, constraint]) => {
      if (typeof constraint !== 'object' || constraint === null || Array.isArray(constraint)) {
        return []
      }

      const expected = (constraint as Record<string, unknown>).equals

      return expected === undefined ? [] : [{ expected, field }]
    },
  )

  if (constraints.length === 0) {
    return docs
  }

  return docs.filter((doc) => {
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
      return false
    }

    const record = doc as Record<string, unknown>

    return constraints.every(({ expected, field }) => record[field] === expected)
  })
}

const createMockPayload = ({
  assetsFindError,
  docsAccess,
  docsGroups = [],
  docsSets = [],
  existingAssets = [],
  existingDocs = [],
  pages = [],
  replayNonce = false,
}: {
  assetsFindError?: Error
  docsAccess?: unknown[]
  docsGroups?: unknown[]
  docsSets?: unknown[]
  existingAssets?: unknown[]
  existingDocs?: unknown[]
  pages?: unknown[]
  replayNonce?: boolean
} = {}): MockPayload => ({
  create: vi.fn(({ collection }) =>
    Promise.resolve({
      id: `${collection}-id`,
    }),
  ),
  delete: vi.fn(({ id }) =>
    Promise.resolve({
      id,
    }),
  ),
  find: vi.fn((args) => {
    const { collection } = args

    if (collection === 'docs-sync-nonces') {
      return Promise.resolve({
        docs: replayNonce ? [{ id: 'nonce-id' }] : [],
      })
    }

    if (collection === 'docs') {
      return Promise.resolve({
        docs: existingDocs,
      })
    }

    if (collection === DEFAULT_DOCS_ASSETS_COLLECTION_SLUG) {
      if (assetsFindError) {
        return Promise.reject(assetsFindError)
      }

      return Promise.resolve({
        docs: existingAssets,
      })
    }

    if (collection === DEFAULT_DOCS_GROUPS_COLLECTION_SLUG) {
      return Promise.resolve({
        docs: docsGroups,
      })
    }

    if (collection === DEFAULT_DOCS_SETS_COLLECTION_SLUG) {
      const resolvedDocsSets =
        docsSets.length > 0
          ? docsSets
          : [
              {
                id: 'docs-set-id',
                slug: 'main-docs',
                branch: 'main',
                title: 'Main Docs',
              },
            ]

      return Promise.resolve({
        docs: filterDocsByEquals(resolvedDocsSets, args.where, 'slug'),
      })
    }

    if (collection === DEFAULT_DOCS_ACCESS_COLLECTION_SLUG) {
      const resolvedDocsAccess = docsAccess ?? [
        {
          id: 'access-key-id',
          accessType: 'ed25519',
          identityKey: 'ed25519:test-key',
          keyId: 'test-key',
          publicKey: currentPublicKey,
          title: 'Test Key',
        },
        {
          id: 'access-github-id',
          accessType: 'githubOidc',
          identityKey: 'githubOidc:valkyrianlabs',
          limitRepos: false,
          owner: 'valkyrianlabs',
          title: 'Valkyrian Labs',
        },
      ]

      return Promise.resolve({
        docs: filterDocsByWhereEquals(resolvedDocsAccess, args.where),
      })
    }

    if (collection === 'pages') {
      return Promise.resolve({
        docs: pages,
      })
    }

    return Promise.resolve({
      docs: [],
    })
  }),
  update: vi.fn(({ id, collection }) =>
    Promise.resolve({
      id,
      collection,
    }),
  ),
})

const createManifest = (overrides: Record<string, unknown> = {}) => ({
  ...buildDocsManifest({
    files: [
      {
        content: '# Home\n',
        path: 'index.md',
      },
    ],
    repository: 'valkyrianlabs/payload-markdown',
    sourceId: 'main-docs',
  }),
  ...overrides,
})

const signBody = ({
  body,
  keyId = 'test-key',
  nonce = 'nonce-1',
  path = '/api/documentation/sync',
  privateKey,
  timestamp = now.toISOString(),
}: {
  body: string
  keyId?: string
  nonce?: string
  path?: string
  privateKey: Buffer | string
  timestamp?: string
}): Headers => {
  const bodySha256 = sha256Hex(body)
  const canonicalString = buildCanonicalSigningString({
    bodySha256,
    method: 'POST',
    nonce,
    path,
    timestamp,
  })
  const signature = sign(null, Buffer.from(canonicalString), privateKey).toString('base64')

  return new Headers({
    'X-VL-MD-DOCS-Body-SHA256': bodySha256,
    'X-VL-MD-DOCS-Key-Id': keyId,
    'X-VL-MD-DOCS-Nonce': nonce,
    'X-VL-MD-DOCS-Signature': signature,
    'X-VL-MD-DOCS-Timestamp': timestamp,
  })
}

const createOidcTokenFixture = (payloadOverrides: Record<string, unknown> = {}) => {
  const { privateKey, publicKey } = rsaKeyPair()
  const kid = `kid-${randomUUID()}`
  const header = {
    alg: 'RS256',
    kid,
    typ: 'JWT',
  }
  const payload = {
    actor: 'octocat',
    aud: 'main-docs',
    event_name: 'push',
    exp: Math.floor(now.getTime() / 1000) + 600,
    iat: Math.floor(now.getTime() / 1000),
    iss: 'https://token.actions.githubusercontent.com',
    jti: `jti-${randomUUID()}`,
    ref: 'refs/heads/main',
    repository: 'valkyrianlabs/payload-markdown-docs',
    repository_owner: 'valkyrianlabs',
    sha: 'abc123',
    sub: 'repo:valkyrianlabs/payload-markdown-docs:ref:refs/heads/main',
    ...payloadOverrides,
  }
  const encodedHeader = toBase64Url(JSON.stringify(header))
  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    privateKey,
  )
  const jwk = {
    ...publicKey.export({
      format: 'jwk',
    }),
    kid,
  } as Record<string, unknown>
  const jwksUrl = `https://example.test/${kid}/jwks`

  return {
    fetchJson: vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith('/.well-known/openid-configuration')
          ? {
              jwks_uri: jwksUrl,
            }
          : {
              keys: [jwk],
            },
      ),
    ),
    token: `${encodedHeader}.${encodedPayload}.${toBase64Url(signature)}`,
  }
}

const oidcHeaders = ({ body, token }: { body: string; token: string }): Headers =>
  new Headers({
    Authorization: `Bearer ${token}`,
    'X-VL-MD-DOCS-Body-SHA256': sha256Hex(body),
  })

const createRequest = ({
  body,
  headers,
  method = 'POST',
  payload = createMockPayload(),
  url = 'https://example.test/api/documentation/sync',
}: {
  body?: string
  headers?: Headers
  method?: string
  payload?: MockPayload
  url?: string
}): PayloadRequest =>
  Object.assign(
    new Request(url, {
      body,
      headers,
      method,
    }),
    {
      payload,
    },
  ) as unknown as PayloadRequest

const createEndpointForTests = ({
  allowHardDelete = false,
  allowPublish = false,
  allowWrites = false,
  deleteBehavior,
  docsEnableDrafts = false,
  docsSetsEnabled = true,
  publicKey,
  routingPagesEnabled = false,
  syncRunsEnabled = true,
}: {
  allowHardDelete?: boolean
  allowPublish?: boolean
  allowWrites?: boolean
  deleteBehavior?: 'archive' | 'delete' | 'draft' | 'ignore'
  docsEnableDrafts?: boolean
  docsSetsEnabled?: boolean
  publicKey: string
  routingPagesEnabled?: boolean
  syncRunsEnabled?: boolean
}) => {
  currentPublicKey = publicKey

  return createSyncEndpoint({
    allowHardDelete,
    allowPublish,
    allowWrites,
    auth: {
      ed25519: true,
    },
    deleteBehavior,
    docsAccessCollectionSlug: DEFAULT_DOCS_ACCESS_COLLECTION_SLUG,
    docsAccessEnabled: true,
    docsAssetsCollectionSlug: DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
    docsAssetsEnabled: true,
    docsCollectionSlug: 'docs',
    docsEnabled: true,
    docsEnableDrafts,
    docsGroupsCollectionSlug: DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
    docsSetsCollectionSlug: DEFAULT_DOCS_SETS_COLLECTION_SLUG,
    docsSetsEnabled,
    endpointPath: DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
    getNow: () => now,
    markdownFieldName: 'content',
    noncesCollectionSlug: 'docs-sync-nonces',
    noncesEnabled: true,
    routing: {
      pages: {
        allowBridgePages: true,
        bridgeField: 'docsBridge',
        collection: 'pages',
        enabled: routingPagesEnabled,
        routeField: 'slug',
      },
    },
    syncRunsCollectionSlug: 'docs-sync-runs',
    syncRunsEnabled,
  })
}

const callEndpoint = async ({
  body = JSON.stringify(createManifest()),
  endpointOptions = {},
  headers,
  payload,
  publicKey,
}: {
  body?: string
  endpointOptions?: {
    allowHardDelete?: boolean
    allowPublish?: boolean
    allowWrites?: boolean
    deleteBehavior?: 'archive' | 'delete' | 'draft' | 'ignore'
    docsEnableDrafts?: boolean
    docsSetsEnabled?: boolean
    routingPagesEnabled?: boolean
    syncRunsEnabled?: boolean
  }
  headers?: Headers
  payload?: MockPayload
  publicKey: string
}) => {
  const endpoint = createEndpointForTests({
    ...endpointOptions,
    publicKey,
  })
  const response = await endpoint.handler(
    createRequest({
      body,
      headers,
      payload,
    }),
  )

  return {
    json: (await response.json()) as Record<string, unknown>,
    response,
  }
}

const createOidcEndpointForTests = ({
  allowPublish = false,
  allowWrites = false,
  fetchJson,
}: {
  allowPublish?: boolean
  allowWrites?: boolean
  fetchJson: NonNullable<Parameters<typeof createSyncEndpoint>[0]['oidcFetchJson']>
}) =>
  createSyncEndpoint({
    allowPublish,
    allowWrites,
    auth: {
      githubOidc: true,
    },
    docsAccessCollectionSlug: DEFAULT_DOCS_ACCESS_COLLECTION_SLUG,
    docsAccessEnabled: true,
    docsCollectionSlug: 'docs',
    docsEnabled: true,
    docsEnableDrafts: true,
    docsGroupsCollectionSlug: DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
    docsSetsCollectionSlug: DEFAULT_DOCS_SETS_COLLECTION_SLUG,
    docsSetsEnabled: true,
    endpointPath: DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
    getNow: () => now,
    markdownFieldName: 'content',
    noncesCollectionSlug: 'docs-sync-nonces',
    noncesEnabled: true,
    oidcFetchJson: fetchJson,
    syncRunsCollectionSlug: 'docs-sync-runs',
    syncRunsEnabled: true,
  })

const createMultiAuthEndpointForTests = ({
  fetchJson,
  publicKey,
}: {
  fetchJson: NonNullable<Parameters<typeof createSyncEndpoint>[0]['oidcFetchJson']>
  publicKey: string
}) => {
  currentPublicKey = publicKey

  return createSyncEndpoint({
    auth: {
      ed25519: true,
      githubOidc: true,
    },
    docsAccessCollectionSlug: DEFAULT_DOCS_ACCESS_COLLECTION_SLUG,
    docsAccessEnabled: true,
    docsCollectionSlug: 'docs',
    docsEnabled: true,
    docsEnableDrafts: true,
    docsGroupsCollectionSlug: DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
    docsSetsCollectionSlug: DEFAULT_DOCS_SETS_COLLECTION_SLUG,
    docsSetsEnabled: true,
    endpointPath: DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
    getNow: () => now,
    markdownFieldName: 'content',
    noncesCollectionSlug: 'docs-sync-nonces',
    noncesEnabled: true,
    oidcFetchJson: fetchJson,
    syncRunsCollectionSlug: 'docs-sync-runs',
    syncRunsEnabled: true,
  })
}

const createCmsManagedEndpointForTests = ({
  allowPublish = false,
  allowWrites = false,
  auth,
  fetchJson,
  syncRunsEnabled = true,
}: {
  allowPublish?: boolean
  allowWrites?: boolean
  auth?: Parameters<typeof createSyncEndpoint>[0]['auth']
  fetchJson?: NonNullable<Parameters<typeof createSyncEndpoint>[0]['oidcFetchJson']>
  syncRunsEnabled?: boolean
} = {}) =>
  createSyncEndpoint({
    allowPublish,
    allowWrites,
    auth,
    docsAccessCollectionSlug: DEFAULT_DOCS_ACCESS_COLLECTION_SLUG,
    docsAccessEnabled: true,
    docsCollectionSlug: 'docs',
    docsEnabled: true,
    docsEnableDrafts: true,
    docsGroupsCollectionSlug: DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
    docsSetsCollectionSlug: DEFAULT_DOCS_SETS_COLLECTION_SLUG,
    docsSetsEnabled: true,
    endpointPath: DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
    getNow: () => now,
    markdownFieldName: 'content',
    noncesCollectionSlug: 'docs-sync-nonces',
    noncesEnabled: true,
    oidcFetchJson: fetchJson,
    syncRunsCollectionSlug: 'docs-sync-runs',
    syncRunsEnabled,
  })

const callOidcEndpoint = async ({
  body = JSON.stringify(createManifest()),
  endpointOptions = {},
  headers,
  payload = createMockPayload(),
  tokenFixture = createOidcTokenFixture(),
}: {
  body?: string
  endpointOptions?: {
    allowPublish?: boolean
    allowWrites?: boolean
  }
  headers?: Headers
  payload?: MockPayload
  tokenFixture?: ReturnType<typeof createOidcTokenFixture>
}) => {
  const endpoint = createOidcEndpointForTests({
    ...endpointOptions,
    fetchJson: tokenFixture.fetchJson,
  })
  const response = await endpoint.handler(
    createRequest({
      body,
      headers:
        headers ??
        oidcHeaders({
          body,
          token: tokenFixture.token,
        }),
      payload,
    }),
  )

  return {
    json: (await response.json()) as Record<string, unknown>,
    payload,
    response,
  }
}

describe('sync endpoint registration', () => {
  it('does not register the endpoint when the plugin is disabled', () => {
    const incomingConfig = {
      collections: [],
    } as unknown as Config
    const transformedConfig = payloadMarkdownDocs({ enabled: false })(incomingConfig) as Config

    expect(transformedConfig.endpoints).toBeUndefined()
  })

  it('registers the sync endpoint when the plugin is enabled', () => {
    const config = payloadMarkdownDocs({ enabled: true })({
      collections: [],
    } as unknown as Config) as Config

    expect(config.endpoints).toContainEqual(
      expect.objectContaining({
        method: 'post',
        path: DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
      }),
    )
  })
})

describe('sync endpoint dry-run handling', () => {
  it('rejects requests when auth is not configured', async () => {
    const endpoint = createSyncEndpoint({
      docsAccessCollectionSlug: DEFAULT_DOCS_ACCESS_COLLECTION_SLUG,
      docsAccessEnabled: true,
      docsCollectionSlug: 'docs',
      docsEnabled: true,
      docsEnableDrafts: false,
      docsGroupsCollectionSlug: DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
      docsSetsCollectionSlug: DEFAULT_DOCS_SETS_COLLECTION_SLUG,
      docsSetsEnabled: true,
      endpointPath: DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
      getNow: () => now,
      markdownFieldName: 'content',
      noncesCollectionSlug: 'docs-sync-nonces',
      noncesEnabled: true,
      syncRunsCollectionSlug: 'docs-sync-runs',
      syncRunsEnabled: true,
    })
    const response = await endpoint.handler(
      createRequest({
        body: JSON.stringify(createManifest()),
      }),
    )
    const body = (await response.json()) as { error?: { code?: string } }

    expect(response.status).toBe(401)
    expect(body.error?.code).toBe('auth_disabled')
  })

  it('rejects missing signed headers', async () => {
    const { publicKey } = keyPair()
    const { json, response } = await callEndpoint({
      body: JSON.stringify(createManifest()),
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(401)
    expect(json).toMatchObject({
      error: {
        code: 'missing_header',
      },
      ok: false,
    })
  })

  it('rejects unknown key ids', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest())
    const { json, response } = await callEndpoint({
      body,
      headers: signBody({
        body,
        keyId: 'unknown',
        privateKey,
      }),
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(401)
    expect(json.error).toMatchObject({
      code: 'unknown_key',
    })
  })

  it('rejects body hash mismatches', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest())
    const headers = signBody({
      body,
      privateKey,
    })
    headers.set('X-VL-MD-DOCS-Body-SHA256', '0'.repeat(64))

    const { json, response } = await callEndpoint({
      body,
      headers,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(401)
    expect(json.error).toMatchObject({
      code: 'body_hash_mismatch',
    })
  })

  it('rejects invalid signatures', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest())
    const headers = signBody({
      body,
      privateKey,
    })
    headers.set('X-VL-MD-DOCS-Signature', 'invalid')

    const { json, response } = await callEndpoint({
      body,
      headers,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(401)
    expect(json.error).toMatchObject({
      code: 'invalid_signature',
    })
  })

  it('rejects timestamps outside the allowed skew', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest())
    const headers = signBody({
      body,
      privateKey,
      timestamp: '2025-01-01T00:00:00.000Z',
    })

    const { json, response } = await callEndpoint({
      body,
      headers,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(401)
    expect(json.error).toMatchObject({
      code: 'invalid_timestamp',
    })
  })

  it('rejects nonce replays', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest())
    const { json, response } = await callEndpoint({
      body,
      headers: signBody({
        body,
        privateKey,
      }),
      payload: createMockPayload({
        replayNonce: true,
      }),
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(409)
    expect(json.error).toMatchObject({
      code: 'nonce_replay',
    })
  })

  it('rejects invalid manifests', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ files: [] }))
    const { json, response } = await callEndpoint({
      body,
      headers: signBody({
        body,
        privateKey,
      }),
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(400)
    expect(json.error).toMatchObject({
      code: 'invalid_manifest',
    })
  })

  it('rejects unknown sources when no docs set or configured source matches', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(
      createManifest({
        source: {
          id: 'unknown-docs',
          root: 'docs',
        },
      }),
    )
    const { json, response } = await callEndpoint({
      body,
      headers: signBody({
        body,
        privateKey,
      }),
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(400)
    expect(json.error).toMatchObject({ code: 'source_not_allowed' })
  })

  it('returns structured errors for unexpected endpoint failures', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest())
    const payload = createMockPayload()
    payload.find.mockRejectedValueOnce(new Error('database unavailable'))

    const { json, response } = await callEndpoint({
      body,
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(500)
    expect(json.error).toMatchObject({
      code: 'sync_endpoint_failed',
      message: 'Sync endpoint failed: database unavailable',
    })
  })

  it('does not require docs asset storage for docs-only manifests', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest())
    const payload = createMockPayload({
      assetsFindError: new Error(
        'Failed query: relation "payload_markdown_docs_assets" does not exist',
      ),
    })

    const { json, response } = await callEndpoint({
      body,
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      ok: true,
    })
    expect(payload.find).not.toHaveBeenCalledWith(
      expect.objectContaining({
        collection: DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
      }),
    )
  })

  it('returns a migration hint when docs asset storage is missing for asset manifests', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(
      buildDocsManifest({
        assets: [
          {
            content: '# Main Docs\n',
            contentType: 'text/plain; charset=utf-8',
            kind: 'llms',
            path: 'llms.txt',
            route: '/llms.txt',
          },
        ],
        files: [
          {
            content: '# Home\n',
            path: 'index.md',
          },
        ],
        repository: 'valkyrianlabs/payload-markdown',
        sourceId: 'main-docs',
      }),
    )
    const payload = createMockPayload({
      assetsFindError: new Error(
        'Failed query: select count(*) from "payload_markdown_docs_assets"',
      ),
    })

    const { json, response } = await callEndpoint({
      body,
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(500)
    expect(json.error).toMatchObject({
      code: 'assets_storage_unavailable',
    })
    expect(JSON.stringify(json.error)).toContain('Run Payload locally')
    expect(JSON.stringify(json.error)).toContain(DEFAULT_DOCS_ASSETS_COLLECTION_SLUG)
  })

  it('rejects sync mode when writes are not enabled', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const { json, response } = await callEndpoint({
      body,
      headers: signBody({
        body,
        privateKey,
      }),
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(403)
    expect(json.error).toMatchObject({
      code: 'sync_writes_disabled',
    })
  })

  it('accepts valid signed dry-run requests and writes only audit/nonce records', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest())
    const payload = createMockPayload()
    const { json, response } = await callEndpoint({
      body,
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      dryRun: true,
      ok: true,
      summary: {
        create: 1,
        update: 0,
      },
      syncRunId: 'docs-sync-runs-id',
    })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs-sync-runs',
      }),
    )
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs-sync-nonces',
      }),
    )
    expect(payload.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
      }),
    )
  })

  it('rejects OIDC requests without Authorization in github-oidc mode', async () => {
    const body = JSON.stringify(createManifest())
    const { json, response } = await callOidcEndpoint({
      body,
      headers: new Headers({
        'X-VL-MD-DOCS-Body-SHA256': sha256Hex(body),
      }),
    })

    expect(response.status).toBe(401)
    expect(json.error).toMatchObject({
      code: 'missing_header',
    })
  })

  it('accepts valid GitHub OIDC dry-run requests without Ed25519 headers', async () => {
    const body = JSON.stringify(createManifest())
    const payload = createMockPayload()
    const { json, response } = await callOidcEndpoint({
      body,
      payload,
    })

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      dryRun: true,
      ok: true,
      summary: {
        create: 1,
      },
    })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs-sync-nonces',
        data: expect.objectContaining({
          keyId: 'github-oidc:valkyrianlabs/payload-markdown-docs',
        }),
      }),
    )
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs-sync-runs',
        data: expect.objectContaining({
          actor: 'octocat',
          branch: 'refs/heads/main',
          commit: 'abc123',
          keyId: 'github-oidc:valkyrianlabs/payload-markdown-docs',
          repository: 'valkyrianlabs/payload-markdown-docs',
        }),
      }),
    )
  })

  it('accepts Ed25519 and GitHub OIDC requests on one endpoint', async () => {
    const { privateKey, publicKey } = keyPair()
    const tokenFixture = createOidcTokenFixture()
    const endpoint = createMultiAuthEndpointForTests({
      fetchJson: tokenFixture.fetchJson,
      publicKey: publicKey.toString(),
    })
    const body = JSON.stringify(createManifest())

    const signedResponse = await endpoint.handler(
      createRequest({
        body,
        headers: signBody({
          body,
          nonce: 'ed25519-nonce',
          privateKey,
        }),
      }),
    )
    const signedBody = (await signedResponse.json()) as Record<string, unknown>

    expect(signedResponse.status).toBe(200)
    expect(signedBody).toMatchObject({
      ok: true,
      syncRunId: 'docs-sync-runs-id',
    })

    const oidcResponse = await endpoint.handler(
      createRequest({
        body,
        headers: oidcHeaders({
          body,
          token: tokenFixture.token,
        }),
      }),
    )
    const oidcBody = (await oidcResponse.json()) as Record<string, unknown>

    expect(oidcResponse.status).toBe(200)
    expect(oidcBody).toMatchObject({
      ok: true,
      syncRunId: 'docs-sync-runs-id',
    })
  })

  it('accepts signed requests using Access Ed25519 keys and docs set slugs', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const payload = createMockPayload({
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'main-docs',
          branch: 'main',
        },
      ],
    })
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      ok: true,
      summary: {
        create: 1,
      },
    })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
        data: expect.objectContaining({
          docsSet: 'docs-set-1',
          route: '/main-docs',
        }),
      }),
    )
  })

  it('accepts GitHub OIDC using Access records with repo limiting', async () => {
    const tokenFixture = createOidcTokenFixture()
    const body = JSON.stringify(createManifest())
    const payload = createMockPayload({
      docsAccess: [
        {
          id: 'access-github-id',
          accessType: 'githubOidc',
          identityKey: 'githubOidc:valkyrianlabs',
          limitRepos: true,
          owner: 'valkyrianlabs',
          repositories: [
            {
              value: 'payload-markdown-docs',
            },
          ],
          title: 'Valkyrian Labs',
        },
      ],
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'main-docs',
          branch: 'main',
        },
      ],
    })
    const { json, response } = await callOidcEndpoint({
      body,
      payload,
      tokenFixture,
    })

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      ok: true,
      summary: {
        create: 1,
      },
    })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs-sync-runs',
        data: expect.objectContaining({
          repository: 'valkyrianlabs/payload-markdown-docs',
          sourceId: 'main-docs',
        }),
      }),
    )
  })

  it('accepts GitHub OIDC tag refs when advanced workflow security is disabled', async () => {
    const tokenFixture = createOidcTokenFixture({
      ref: 'refs/tags/v0.6.0',
      sub: 'repo:valkyrianlabs/payload-markdown-docs:ref:refs/tags/v0.6.0',
      workflow_ref:
        'valkyrianlabs/payload-markdown-docs/.github/workflows/release.yml@refs/tags/v0.6.0',
    })
    const body = JSON.stringify(createManifest())
    const payload = createMockPayload({
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'main-docs',
          advancedSecurity: {
            allowedWorkflowRefs: [
              {
                value:
                  'valkyrianlabs/payload-markdown-docs/.github/workflows/publish-docs.yml@refs/heads/main',
              },
            ],
            enabled: false,
          },
          branch: 'main',
        },
      ],
    })
    const { json, response } = await callOidcEndpoint({
      body,
      payload,
      tokenFixture,
    })

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      ok: true,
      summary: {
        create: 1,
      },
    })
  })

  it('rejects unknown docs set sources before auth when no fallback source is configured', async () => {
    const endpoint = createCmsManagedEndpointForTests({
      auth: {
        ed25519: true,
      },
    })
    const body = JSON.stringify(
      createManifest({
        source: {
          id: 'unknown-docs',
        },
      }),
    )
    const response = await endpoint.handler(
      createRequest({
        body,
        payload: createMockPayload(),
      }),
    )
    const json = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(400)
    expect(json).toMatchObject({
      error: {
        code: 'source_not_allowed',
        message:
          'No docs set exists for source "unknown-docs". Create a docs set with slug "unknown-docs" in Payload Admin before syncing this source.',
      },
      ok: false,
    })
  })

  it('rejects repeated GitHub OIDC jti values as replay', async () => {
    const { json, response } = await callOidcEndpoint({
      payload: createMockPayload({
        replayNonce: true,
      }),
    })

    expect(response.status).toBe(409)
    expect(json.error).toMatchObject({
      code: 'oidc_replay',
    })
  })

  it('applies sync mode with valid GitHub OIDC when writes are enabled', async () => {
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const payload = createMockPayload()
    const { json, response } = await callOidcEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
      },
      payload,
    })

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      dryRun: false,
      ok: true,
      summary: {
        create: 1,
      },
    })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
      }),
    )
  })

  it('reads existing docs and includes them in the dry-run plan', async () => {
    const { privateKey, publicKey } = keyPair()
    const manifest = createManifest()
    const body = JSON.stringify(manifest)
    const payload = createMockPayload({
      existingDocs: [
        {
          id: 'doc-1',
          content: '# Home\n',
          route: '/main-docs',
          sourceHash: sha256Hex('# Home\n'),
          sourcePath: 'index.md',
          sync: {
            archived: false,
            managedBy: 'payload-markdown-docs',
            sourceHashAtLastSync: sha256Hex('# Home\n'),
            sourceId: 'main-docs',
          },
          title: 'Home',
        },
      ],
    })
    const { json, response } = await callEndpoint({
      body,
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json.summary).toMatchObject({
      create: 0,
      unchanged: 1,
    })
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
      }),
    )
  })

  it('rejects sync mode when audit collection is disabled', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
        syncRunsEnabled: false,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(500)
    expect(json.error).toMatchObject({ code: 'audit_unavailable' })
  })

  it('rejects publish requests when publishing is disabled', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync', publish: true }))
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
        docsEnableDrafts: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(403)
    expect(json.error).toMatchObject({ code: 'publish_disabled' })
  })

  it('accepts publish requests when publishing and drafts are enabled', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync', publish: true }))
    const payload = createMockPayload()
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowPublish: true,
        allowWrites: true,
        docsEnableDrafts: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      publishRequested: true,
    })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
        data: expect.objectContaining({
          _status: 'published',
        }),
        draft: false,
      }),
    )
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: DEFAULT_DOCS_SETS_COLLECTION_SLUG,
        data: expect.objectContaining({
          _status: 'published',
        }),
        draft: false,
      }),
    )
  })

  it('publishes unchanged draft docs when publish is requested', async () => {
    const { privateKey, publicKey } = keyPair()
    const manifest = createManifest({ mode: 'sync', publish: true })
    const body = JSON.stringify(manifest)
    const payload = createMockPayload({
      existingDocs: [
        {
          id: 'doc-1',
          _status: 'draft',
          content: '# Home\n',
          route: '/main-docs',
          sourceHash: manifest.files[0]?.sha256,
          sourcePath: 'index.md',
          sync: {
            contentHashAtLastSync: sha256Hex('# Home\n'),
            managedBy: MANAGED_BY,
            sourceHashAtLastSync: manifest.files[0]?.sha256,
            sourceId: 'main-docs',
            sourcePath: 'index.md',
          },
        },
      ],
    })
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowPublish: true,
        allowWrites: true,
        docsEnableDrafts: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json.summary).toMatchObject({ update: 1 })
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'doc-1',
        collection: 'docs',
        data: expect.objectContaining({
          _status: 'published',
        }),
        draft: false,
      }),
    )
  })

  it('creates draft docs when publish is not requested and drafts are enabled', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const payload = createMockPayload()
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
        docsEnableDrafts: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json.publishRequested).toBe(false)
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          _status: 'draft',
        }),
        draft: true,
      }),
    )
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: DEFAULT_DOCS_SETS_COLLECTION_SLUG,
        data: expect.objectContaining({
          _status: 'draft',
        }),
        draft: true,
      }),
    )
  })

  it('rejects publish requests when drafts are not enabled', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync', publish: true }))
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowPublish: true,
        allowWrites: true,
        docsEnableDrafts: false,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(400)
    expect(json.error).toMatchObject({ code: 'publish_not_available' })
  })

  it('rejects draft delete behavior when drafts are unavailable', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
        deleteBehavior: 'draft',
      },
      headers: signBody({
        body,
        privateKey,
      }),
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(400)
    expect(json.error).toMatchObject({ code: 'draft_behavior_not_available' })
  })

  it('rejects hard delete unless explicitly enabled', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
        deleteBehavior: 'delete',
      },
      headers: signBody({
        body,
        privateKey,
      }),
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(403)
    expect(json.error).toMatchObject({ code: 'hard_delete_disabled' })
  })

  it('applies valid sync mode by creating docs and updating audit', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const payload = createMockPayload()
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      dryRun: false,
      ok: true,
      summary: {
        create: 1,
      },
    })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
        data: expect.objectContaining({
          content: '# Home\n',
        }),
      }),
    )
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs-sync-runs',
        data: expect.objectContaining({
          deleteBehavior: 'archive',
          publishRequested: false,
        }),
      }),
    )
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs-sync-runs',
        data: expect.objectContaining({
          status: 'success',
        }),
      }),
    )
    expect(JSON.stringify(json)).not.toContain('# Home')
  })

  it('revalidates auto-generated group index pages when syncing a docs set', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const payload = createMockPayload({
      docsGroups: [
        {
          id: 'docs-group-1',
          slug: 'plugins',
          pageMode: 'auto',
        },
      ],
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'main-docs',
          branch: 'main',
          group: 'docs-group-1',
        },
      ],
    })
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
        docsSetsEnabled: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json).toMatchObject({ ok: true })
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith('/plugins')
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith('/plugins/main-docs')
  })

  it('applies sync mode by creating llms and skill asset records', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(
      buildDocsManifest({
        assets: [
          {
            content: '# Main Docs\n',
            contentType: 'text/plain; charset=utf-8',
            kind: 'llms',
            path: 'llms.txt',
            route: '/llms.txt',
          },
          {
            content: '# Codex Skill\n',
            contentType: 'text/markdown; charset=utf-8',
            kind: 'skill',
            path: 'skills/main-docs/codex/SKILL.md',
          },
        ],
        files: [
          {
            content: '# Home\n',
            path: 'index.md',
          },
        ],
        mode: 'sync',
        sourceId: 'main-docs',
      }),
    )
    const payload = createMockPayload()
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json.summary).toMatchObject({
      assetCreate: 2,
    })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
        data: expect.objectContaining({
          kind: 'llms',
          route: '/llms.txt',
          sourcePath: 'llms.txt',
        }),
      }),
    )
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
        data: expect.objectContaining({
          kind: 'skill',
          route: '/main-docs/skills/codex/SKILL.md',
          sourcePath: 'skills/main-docs/codex/SKILL.md',
        }),
      }),
    )
  })

  it('resolves docs sets by slug and derives the docs set route base', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const payload = createMockPayload({
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'main-docs',
          branch: 'main',
        },
      ],
    })
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
        docsSetsEnabled: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json.summary).toMatchObject({ create: 1 })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
        data: expect.objectContaining({
          docsSet: 'docs-set-1',
          route: '/main-docs',
        }),
      }),
    )
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
        where: {
          or: [
            {
              docsSet: {
                equals: 'docs-set-1',
              },
            },
            {
              'sync.sourceId': {
                equals: 'main-docs',
              },
            },
          ],
        },
      }),
    )
  })

  it('derives product-nested docs routes below the docs segment', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const payload = createMockPayload({
      docsGroups: [
        {
          id: 'docs-group-1',
          slug: 'plugins',
        },
      ],
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'main-docs',
          branch: 'main',
          group: 'docs-group-1',
          routeMode: 'product-nested',
        },
      ],
    })
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
        docsSetsEnabled: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json.summary).toMatchObject({ create: 1 })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
        data: expect.objectContaining({
          docsSet: 'docs-set-1',
          route: '/plugins/main-docs/docs',
        }),
      }),
    )
  })

  it('keeps product-nested skill assets beside docs instead of under the docs segment', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(
      buildDocsManifest({
        assets: [
          {
            content: '# Codex Skill\n',
            contentType: 'text/markdown; charset=utf-8',
            kind: 'skill',
            path: 'skills/main-docs/codex/SKILL.md',
          },
        ],
        files: [
          {
            content: '# Home\n',
            path: 'index.md',
          },
        ],
        mode: 'sync',
        sourceId: 'main-docs',
      }),
    )
    const payload = createMockPayload({
      docsGroups: [
        {
          id: 'docs-group-1',
          slug: 'plugins',
        },
      ],
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'main-docs',
          branch: 'main',
          group: 'docs-group-1',
          routeMode: 'product-nested',
        },
      ],
    })
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
        docsSetsEnabled: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json.summary).toMatchObject({
      assetCreate: 1,
      create: 1,
    })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
        data: expect.objectContaining({
          route: '/plugins/main-docs/docs',
        }),
      }),
    )
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
        data: expect.objectContaining({
          kind: 'skill',
          route: '/plugins/main-docs/skills/codex/SKILL.md',
        }),
      }),
    )
  })

  it('rejects duplicate routes outside the resolved docs set', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const payload = createMockPayload({
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'main-docs',
          branch: 'main',
        },
      ],
      existingDocs: [
        {
          id: 'doc-from-other-set',
          docsSet: 'other-docs-set',
          route: '/main-docs',
          sourcePath: 'index.md',
          sync: {
            sourceId: 'other-docs',
          },
        },
      ],
    })
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
        docsSetsEnabled: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(409)
    expect(json.error).toMatchObject({ code: 'route_collision' })
    expect(JSON.stringify(json)).toContain('existing_doc_route_collision')
    expect(payload.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
      }),
    )
  })

  it('rejects Pages routes inside a docs set namespace when Pages checks are enabled', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest())
    const payload = createMockPayload({
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'main-docs',
          branch: 'main',
        },
      ],
      pages: [
        {
          id: 'page-1',
          slug: '/main-docs/configuration',
        },
      ],
    })
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        docsSetsEnabled: true,
        routingPagesEnabled: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(409)
    expect(json.error).toMatchObject({ code: 'route_collision' })
    expect(JSON.stringify(json)).toContain('descendant_route_collision')
  })

  it('allows Pages at product routes for product-nested docs sets', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const payload = createMockPayload({
      docsGroups: [
        {
          id: 'docs-group-1',
          slug: 'plugins',
        },
      ],
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'main-docs',
          branch: 'main',
          group: 'docs-group-1',
          routeMode: 'product-nested',
        },
      ],
      pages: [
        {
          id: 'page-1',
          slug: '/plugins/main-docs',
        },
      ],
    })
    const { response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
        docsSetsEnabled: true,
        routingPagesEnabled: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
  })

  it('rejects Pages inside product-nested docs namespaces', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest())
    const payload = createMockPayload({
      docsGroups: [
        {
          id: 'docs-group-1',
          slug: 'plugins',
        },
      ],
      docsSets: [
        {
          id: 'docs-set-1',
          slug: 'main-docs',
          branch: 'main',
          group: 'docs-group-1',
          routeMode: 'product-nested',
        },
      ],
      pages: [
        {
          id: 'page-1',
          slug: '/plugins/main-docs/docs',
        },
      ],
    })
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        docsSetsEnabled: true,
        routingPagesEnabled: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(409)
    expect(json.error).toMatchObject({ code: 'route_collision' })
    expect(JSON.stringify(json)).toContain('exact_route_collision')
  })

  it('updates changed docs in sync mode', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const payload = createMockPayload({
      existingDocs: [
        {
          id: 'doc-1',
          content: '# Old\n',
          route: '/docs',
          sourceHash: sha256Hex('# Old\n'),
          sourcePath: 'index.md',
          sync: {
            archived: false,
            contentHashAtLastSync: sha256Hex('# Old\n'),
            managedBy: 'payload-markdown-docs',
            sourceHashAtLastSync: sha256Hex('# Old\n'),
            sourceId: 'main-docs',
          },
          title: 'Home',
        },
      ],
    })

    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json.summary).toMatchObject({ update: 1 })
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'doc-1',
        collection: 'docs',
      }),
    )
  })

  it('rejects records missing content hash tracking without docs writes', async () => {
    const { privateKey, publicKey } = keyPair()
    const previousManifest = buildDocsManifest({
      files: [
        {
          content: '---\ntitle: Home\n---\n# Old\n',
          path: 'index.md',
        },
      ],
      sourceId: 'main-docs',
    })
    const manifest = buildDocsManifest({
      files: [
        {
          content: '---\ntitle: Home\n---\n# New\n',
          path: 'index.md',
        },
      ],
      mode: 'sync',
      repository: 'valkyrianlabs/payload-markdown',
      sourceId: 'main-docs',
    })
    const body = JSON.stringify(manifest)
    const payload = createMockPayload({
      existingDocs: [
        {
          id: 'doc-1',
          content: '# Old\n',
          route: '/docs',
          sourceHash: previousManifest.files[0]?.sha256,
          sourcePath: 'index.md',
          sync: {
            archived: false,
            managedBy: 'payload-markdown-docs',
            sourceHashAtLastSync: previousManifest.files[0]?.sha256,
            sourceId: 'main-docs',
          },
          title: 'Home',
        },
      ],
    })

    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(409)
    expect(json.error).toMatchObject({ code: 'manual_edit_conflict' })
    expect(payload.update).not.toHaveBeenCalledWith(expect.objectContaining({ collection: 'docs' }))
  })

  it('archives missing docs in sync mode', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify({
      ...createManifest({ mode: 'sync' }),
      files: [
        {
          content: '# New\n',
          path: 'new.md',
          sha256: sha256Hex('# New\n'),
        },
      ],
    })
    const payload = createMockPayload({
      existingDocs: [
        {
          id: 'doc-1',
          content: '# Old\n',
          route: '/docs/old',
          sourceHash: sha256Hex('# Old\n'),
          sourcePath: 'old.md',
          sync: {
            archived: false,
            contentHashAtLastSync: sha256Hex('# Old\n'),
            managedBy: 'payload-markdown-docs',
            sourceHashAtLastSync: sha256Hex('# Old\n'),
            sourceId: 'main-docs',
          },
          title: 'Old',
        },
      ],
    })

    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json.summary).toMatchObject({ archive: 1, create: 1 })
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'doc-1',
        collection: 'docs',
        data: expect.objectContaining({
          sync: expect.objectContaining({
            archived: true,
          }),
        }),
      }),
    )
  })

  it('ignores missing docs in sync mode when server delete behavior is ignore', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify({
      ...createManifest({ mode: 'sync' }),
      files: [
        {
          content: '# New\n',
          path: 'new.md',
          sha256: sha256Hex('# New\n'),
        },
      ],
    })
    const payload = createMockPayload({
      existingDocs: [
        {
          id: 'doc-1',
          content: '# Old\n',
          route: '/docs/old',
          sourceHash: sha256Hex('# Old\n'),
          sourcePath: 'old.md',
          sync: {
            archived: false,
            contentHashAtLastSync: sha256Hex('# Old\n'),
            managedBy: 'payload-markdown-docs',
            sourceHashAtLastSync: sha256Hex('# Old\n'),
            sourceId: 'main-docs',
          },
          title: 'Old',
        },
      ],
    })

    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
        deleteBehavior: 'ignore',
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json.summary).toMatchObject({ archive: 0, create: 1 })
    expect(payload.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'doc-1',
        collection: 'docs',
      }),
    )
  })

  it('drafts and archives missing docs in sync mode when delete behavior is draft', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify({
      ...createManifest({ mode: 'sync' }),
      files: [
        {
          content: '# New\n',
          path: 'new.md',
          sha256: sha256Hex('# New\n'),
        },
      ],
    })
    const payload = createMockPayload({
      existingDocs: [
        {
          id: 'doc-1',
          _status: 'published',
          content: '# Old\n',
          route: '/docs/old',
          sourceHash: sha256Hex('# Old\n'),
          sourcePath: 'old.md',
          sync: {
            archived: false,
            contentHashAtLastSync: sha256Hex('# Old\n'),
            managedBy: 'payload-markdown-docs',
            sourceHashAtLastSync: sha256Hex('# Old\n'),
            sourceId: 'main-docs',
          },
          title: 'Old',
        },
      ],
    })

    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
        deleteBehavior: 'draft',
        docsEnableDrafts: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json.summary).toMatchObject({ create: 1, draft: 1 })
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'doc-1',
        collection: 'docs',
        data: expect.objectContaining({
          _status: 'draft',
          sync: expect.objectContaining({
            archived: true,
          }),
        }),
      }),
    )
  })

  it('hard deletes missing docs only when explicitly enabled', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify({
      ...createManifest({ mode: 'sync' }),
      files: [
        {
          content: '# New\n',
          path: 'new.md',
          sha256: sha256Hex('# New\n'),
        },
      ],
    })
    const payload = createMockPayload({
      existingDocs: [
        {
          id: 'doc-1',
          content: '# Old\n',
          route: '/docs/old',
          sourceHash: sha256Hex('# Old\n'),
          sourcePath: 'old.md',
          sync: {
            archived: false,
            contentHashAtLastSync: sha256Hex('# Old\n'),
            managedBy: 'payload-markdown-docs',
            sourceHashAtLastSync: sha256Hex('# Old\n'),
            sourceId: 'main-docs',
          },
          title: 'Old',
        },
      ],
    })

    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowHardDelete: true,
        allowWrites: true,
        deleteBehavior: 'delete',
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(json.summary).toMatchObject({ create: 1, delete: 1 })
    expect(payload.delete).toHaveBeenCalledWith({
      id: 'doc-1',
      collection: 'docs',
      overrideAccess: true,
    })
  })

  it('sets existing docs to draft when publish is not requested', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const payload = createMockPayload({
      existingDocs: [
        {
          id: 'doc-1',
          _status: 'published',
          content: '# Old\n',
          route: '/docs',
          sourceHash: sha256Hex('# Old\n'),
          sourcePath: 'index.md',
          sync: {
            archived: false,
            contentHashAtLastSync: sha256Hex('# Old\n'),
            managedBy: 'payload-markdown-docs',
            sourceHashAtLastSync: sha256Hex('# Old\n'),
            sourceId: 'main-docs',
          },
          title: 'Home',
        },
      ],
    })

    const { response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
        docsEnableDrafts: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(200)
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'doc-1',
        data: expect.objectContaining({
          _status: 'draft',
        }),
      }),
    )
  })

  it('rejects sync mode on manual conflicts without docs writes', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const payload = createMockPayload({
      existingDocs: [
        {
          id: 'doc-1',
          content: '# Manual edit\n',
          route: '/docs',
          sourceHash: sha256Hex('# Old\n'),
          sourcePath: 'index.md',
          sync: {
            archived: false,
            contentHashAtLastSync: sha256Hex('# Old\n'),
            managedBy: 'payload-markdown-docs',
            sourceHashAtLastSync: sha256Hex('# Old\n'),
            sourceId: 'main-docs',
          },
          title: 'Home',
        },
      ],
    })

    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
      },
      headers: signBody({
        body,
        privateKey,
      }),
      payload,
      publicKey: publicKey.toString(),
    })

    expect(response.status).toBe(409)
    expect(json.error).toMatchObject({ code: 'manual_edit_conflict' })
    expect(payload.create).not.toHaveBeenCalledWith(expect.objectContaining({ collection: 'docs' }))
    expect(payload.update).not.toHaveBeenCalledWith(expect.objectContaining({ collection: 'docs' }))
  })

  it('uses the actual request path in canonical signing', () => {
    expect(
      getCanonicalPathFromRequestUrl({
        endpointPath: DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
        url: 'https://example.test/api/documentation/sync',
      }),
    ).toBe('/api/documentation/sync')
  })
})
