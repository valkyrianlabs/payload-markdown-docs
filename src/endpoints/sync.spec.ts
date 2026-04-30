import type { Config, PayloadRequest } from 'payload'

import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_DOCS_SYNC_ENDPOINT_PATH } from '../constants.js'
import { payloadMarkdownDocs } from '../plugin.js'
import {
  buildCanonicalSigningString,
  getCanonicalPathFromRequestUrl,
} from '../security/index.js'
import {
  buildDocsManifest,
  sha256Hex,
} from '../sync/index.js'
import { createSyncEndpoint } from './index.js'

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

type MockPayload = {
  create: ReturnType<typeof vi.fn>
  find: ReturnType<typeof vi.fn>
}

const createMockPayload = ({
  existingDocs = [],
  replayNonce = false,
}: {
  existingDocs?: unknown[]
  replayNonce?: boolean
} = {}): MockPayload => ({
  create: vi.fn(({ collection }) =>
    Promise.resolve({
      id: `${collection}-id`,
    }),
  ),
  find: vi.fn(({ collection }) => {
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

    return Promise.resolve({
      docs: [],
    })
  }),
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
    root: 'docs',
    sourceId: 'main-docs',
  }),
  ...overrides,
})

const signBody = ({
  body,
  keyId = 'test-key',
  nonce = 'nonce-1',
  path = '/api/payload-markdown-docs/sync',
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
  const signature = sign(null, Buffer.from(canonicalString), privateKey).toString(
    'base64',
  )

  return new Headers({
    'X-VL-MD-DOCS-Body-SHA256': bodySha256,
    'X-VL-MD-DOCS-Key-Id': keyId,
    'X-VL-MD-DOCS-Nonce': nonce,
    'X-VL-MD-DOCS-Signature': signature,
    'X-VL-MD-DOCS-Timestamp': timestamp,
  })
}

const createRequest = ({
  body,
  headers,
  method = 'POST',
  payload = createMockPayload(),
  url = 'https://example.test/api/payload-markdown-docs/sync',
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
  publicKey,
}: {
  publicKey: string
}) =>
  createSyncEndpoint({
    auth: {
      keys: [
        {
          id: 'test-key',
          publicKey,
        },
      ],
      maxSkewSeconds: 300,
      mode: 'ed25519',
      nonceTtlSeconds: 600,
    },
    docsCollectionSlug: 'docs',
    docsEnabled: true,
    endpointPath: DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
    getNow: () => now,
    noncesCollectionSlug: 'docs-sync-nonces',
    noncesEnabled: true,
    sources: [
      {
        id: 'main-docs',
        root: 'docs',
        routeBase: '/docs',
      },
    ],
    syncRunsCollectionSlug: 'docs-sync-runs',
    syncRunsEnabled: true,
  })

const callEndpoint = async ({
  body = JSON.stringify(createManifest()),
  headers,
  payload,
  publicKey,
}: {
  body?: string
  headers?: Headers
  payload?: MockPayload
  publicKey: string
}) => {
  const endpoint = createEndpointForTests({
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

describe('sync endpoint registration', () => {
  it('does not register the endpoint when the plugin is disabled', () => {
    const incomingConfig = {
      collections: [],
    } as unknown as Config
    const transformedConfig = payloadMarkdownDocs({ enabled: false })(
      incomingConfig,
    ) as Config

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
      docsCollectionSlug: 'docs',
      docsEnabled: true,
      endpointPath: DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
      getNow: () => now,
      noncesCollectionSlug: 'docs-sync-nonces',
      noncesEnabled: true,
      syncRunsCollectionSlug: 'docs-sync-runs',
      syncRunsEnabled: true,
    })
    const response = await endpoint.handler(createRequest({ body: '{}' }))
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

  it('rejects sync mode in Phase 5', async () => {
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

    expect(response.status).toBe(400)
    expect(json.error).toMatchObject({
      code: 'sync_mode_not_implemented',
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

  it('reads existing docs and includes them in the dry-run plan', async () => {
    const { privateKey, publicKey } = keyPair()
    const manifest = createManifest()
    const body = JSON.stringify(manifest)
    const payload = createMockPayload({
      existingDocs: [
        {
          route: '/docs',
          sourceHash: sha256Hex('# Home\n'),
          sourcePath: 'index.md',
          sync: {
            archived: false,
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

  it('uses the actual request path in canonical signing', () => {
    expect(
      getCanonicalPathFromRequestUrl({
        endpointPath: DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
        url: 'https://example.test/api/payload-markdown-docs/sync',
      }),
    ).toBe('/api/payload-markdown-docs/sync')
  })
})
