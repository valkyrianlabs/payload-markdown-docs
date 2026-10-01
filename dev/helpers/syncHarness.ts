/**
 * Real-Postgres harness for docs sync regression tests.
 *
 * The handlers are taken from `payload.config.endpoints`, so the tests exercise the
 * plugin build that the dev config imports (`../dist`). Rebuild (`pnpm build`) before
 * running `PAYLOAD_MARKDOWN_DOCS_RUN_DB_TESTS=1 pnpm exec vitest --run`.
 */
import type { Endpoint, Payload } from 'payload'

import { generateKeyPairSync, randomUUID } from 'node:crypto'

import { signDocsSyncRequest } from '../../src/security/sign.js'

export const SYNC_ENDPOINT_URL = 'http://localhost:3000/api/documentation/sync'

export type SyncCallResult = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any
  status: number
}

export type SyncKey = {
  keyId: string
  privateKey: string
  publicKey: string
}

export const runDbTests = process.env.PAYLOAD_MARKDOWN_DOCS_RUN_DB_TESTS === '1'

export const uniqueSlug = (prefix: string): string => `${prefix}-${randomUUID().slice(0, 8)}`

export const createSyncKey = (): SyncKey => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })

  return {
    keyId: uniqueSlug('regression-key'),
    privateKey,
    publicKey,
  }
}

export const registerSyncKey = async (
  payload: Payload,
  key: SyncKey,
  extra: Record<string, unknown> = {},
): Promise<void> => {
  await payload.create({
    collection: 'docs-access',
    data: {
      accessType: 'ed25519',
      keyId: key.keyId,
      publicKey: key.publicKey,
      title: key.keyId,
      ...extra,
    } as never,
    overrideAccess: true,
  })
}

export const findEndpoint = (payload: Payload, path: string, method = 'post'): Endpoint => {
  const endpoint = payload.config.endpoints.find(
    (candidate) => candidate.path === path && candidate.method === method,
  )

  if (!endpoint) {
    throw new Error(`Endpoint ${method.toUpperCase()} ${path} is not registered.`)
  }

  return endpoint
}

export const callRawSync = async ({
  body,
  headers = {},
  payload,
}: {
  body: string
  headers?: Record<string, string>
  payload: Payload
}): Promise<SyncCallResult> => {
  const endpoint = findEndpoint(payload, '/documentation/sync')
  const response = (await endpoint.handler({
    headers: new Headers(headers),
    method: 'POST',
    payload,
    text: () => Promise.resolve(body),
    url: SYNC_ENDPOINT_URL,
  } as never))

  return {
    json: await response.json(),
    status: response.status,
  }
}

export const callSync = async ({
  key,
  manifest,
  nonce,
  payload,
  timestamp,
}: {
  key: SyncKey
  manifest: unknown
  nonce?: string
  payload: Payload
  timestamp?: Date
}): Promise<SyncCallResult> => {
  const body = JSON.stringify(manifest)
  const signed = signDocsSyncRequest({
    body,
    endpoint: SYNC_ENDPOINT_URL,
    keyId: key.keyId,
    nonce,
    now: timestamp,
    privateKey: key.privateKey,
  })

  return callRawSync({
    body,
    headers: signed.headers as unknown as Record<string, string>,
    payload,
  })
}

export const callGet = async ({
  headers = {},
  path,
  payload,
  routeParams,
  url,
}: {
  headers?: Record<string, string>
  path: string
  payload: Payload
  routeParams?: Record<string, unknown>
  url: string
}): Promise<Response> => {
  const endpoint = findEndpoint(payload, path, 'get')

  return (await endpoint.handler({
    headers: new Headers(headers),
    method: 'GET',
    payload,
    routeParams,
    url,
  } as never))
}

export const createDocsSet = async (
  payload: Payload,
  slug: string,
  data: Record<string, unknown> = {},
) =>
  payload.create({
    collection: 'docs-sets',
    data: {
      slug,
      _status: 'published',
      branch: 'main',
      title: slug,
      ...data,
    } as never,
    overrideAccess: true,
  })

export type ManifestFile = {
  content: string
  path: string
}

export const buildManifest = (
  sourceId: string,
  files: ManifestFile[],
  extra: Record<string, unknown> = {},
) => ({
  files,
  mode: 'sync',
  publish: true,
  source: { id: sourceId },
  version: 1,
  ...extra,
})

export const findDocsBySource = async (payload: Payload, sourceId: string, draft = true) =>
  (
    await payload.find({
      collection: 'docs',
      depth: 0,
      draft,
      limit: 0,
      overrideAccess: true,
      pagination: false,
      sort: 'sourcePath',
      where: { 'sync.sourceId': { equals: sourceId } },
    })
  ).docs as unknown as Array<Record<string, any>> // eslint-disable-line @typescript-eslint/no-explicit-any
