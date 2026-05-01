import type { Config, PayloadRequest } from 'payload'

import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
  DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
} from '../constants.js'
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
  delete: ReturnType<typeof vi.fn>
  find: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

const createMockPayload = ({
  docsSets = [],
  existingDocs = [],
  pages = [],
  replayNonce = false,
}: {
  docsSets?: unknown[]
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

    if (collection === DEFAULT_DOCS_SETS_COLLECTION_SLUG) {
      return Promise.resolve({
        docs: docsSets,
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
  allowHardDelete = false,
  allowPublish = false,
  allowWrites = false,
  defaultPublishMode,
  deleteBehavior,
  docsEnableDrafts = false,
  docsSetsEnabled = false,
  publicKey,
  routingPagesEnabled = false,
  syncRunsEnabled = true,
}: {
  allowHardDelete?: boolean
  allowPublish?: boolean
  allowWrites?: boolean
  defaultPublishMode?: 'draft' | 'preserve' | 'published'
  deleteBehavior?: 'archive' | 'delete' | 'draft' | 'ignore'
  docsEnableDrafts?: boolean
  docsSetsEnabled?: boolean
  publicKey: string
  routingPagesEnabled?: boolean
  syncRunsEnabled?: boolean
}) =>
  createSyncEndpoint({
    allowHardDelete,
    allowPublish,
    allowWrites,
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
    defaultPublishMode,
    deleteBehavior,
    docsCollectionSlug: 'docs',
    docsEnabled: true,
    docsEnableDrafts,
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
    sources: [
      {
        id: 'main-docs',
        root: 'docs',
        routeBase: '/docs',
      },
    ],
    syncRunsCollectionSlug: 'docs-sync-runs',
    syncRunsEnabled,
  })

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
    defaultPublishMode?: 'draft' | 'preserve' | 'published'
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
      docsEnableDrafts: false,
      docsSetsCollectionSlug: DEFAULT_DOCS_SETS_COLLECTION_SLUG,
      docsSetsEnabled: false,
      endpointPath: DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
      getNow: () => now,
      markdownFieldName: 'content',
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

  it('rejects unknown sources when no docs set or configured source matches', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({
      source: {
        id: 'unknown-docs',
        root: 'docs',
      },
    }))
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

  it('reads existing docs and includes them in the dry-run plan', async () => {
    const { privateKey, publicKey } = keyPair()
    const manifest = createManifest()
    const body = JSON.stringify(manifest)
    const payload = createMockPayload({
      existingDocs: [
        {
          id: 'doc-1',
          content: '# Home\n',
          route: '/docs',
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
      effectivePublishMode: 'published',
      publishRequested: true,
    })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'docs',
        data: expect.objectContaining({
          _status: 'published',
        }),
      }),
    )
  })

  it('applies default draft publish mode when drafts are enabled', async () => {
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
    expect(json.effectivePublishMode).toBe('draft')
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          _status: 'draft',
        }),
      }),
    )
  })

  it('rejects default published mode unless publishing is allowed', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const { json, response } = await callEndpoint({
      body,
      endpointOptions: {
        allowWrites: true,
        defaultPublishMode: 'published',
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
          effectivePublishMode: 'preserve',
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

  it('resolves docs sets by source id and uses the docs set route base', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const payload = createMockPayload({
      docsSets: [
        {
          id: 'docs-set-1',
          routeBase: '/plugins/payload-markdown',
          sourceId: 'main-docs',
          sourceRoot: 'docs',
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
          route: '/plugins/payload-markdown',
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

  it('rejects duplicate routes outside the resolved docs set', async () => {
    const { privateKey, publicKey } = keyPair()
    const body = JSON.stringify(createManifest({ mode: 'sync' }))
    const payload = createMockPayload({
      docsSets: [
        {
          id: 'docs-set-1',
          routeBase: '/plugins/payload-markdown',
          sourceId: 'main-docs',
        },
      ],
      existingDocs: [
        {
          id: 'doc-from-other-set',
          docsSet: 'other-docs-set',
          route: '/plugins/payload-markdown',
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
          routeBase: '/plugins/payload-markdown',
          sourceId: 'main-docs',
        },
      ],
      pages: [
        {
          id: 'page-1',
          slug: '/plugins/payload-markdown/configuration',
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

  it('preserves existing draft status in preserve mode', async () => {
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
        defaultPublishMode: 'preserve',
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
          _status: 'published',
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
    expect(payload.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'docs' }),
    )
    expect(payload.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'docs' }),
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
