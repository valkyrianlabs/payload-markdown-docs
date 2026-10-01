import type { Endpoint, PayloadRequest } from 'payload'

import type {
  ApplyDocsAssetsSyncPayloadOperations,
  ApplyDocsSyncPayloadOperations,
  DocsAccessPayloadOperations,
  DocsSetPayloadOperations,
  ExistingAssetsPayloadOperations,
  ExistingDocsPayloadOperations,
  ExistingPayloadDocsRecord,
  ResolvedDocsSet,
  RouteCollisionPayloadOperations,
  SyncRunsPayloadOperations,
} from '../payload/index.js'
import type { FetchJson, GitHubOidcClaims, NoncePayloadOperations  } from '../security/index.js'
import type {
  DocsDeleteBehavior,
  DocsManifest,
  DocsValidationIssue,
  PlannedAssetChange,
  PlannedDocChange,
  ValidatedDocsManifest,
} from '../sync/index.js'
import type {
  PayloadMarkdownDocsAuthConfig,
  PayloadMarkdownDocsSyncRevalidateConfig,
} from '../types.js'

import {
  DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_SKEW_SECONDS,
  DEFAULT_NONCE_TTL_SECONDS,
} from '../constants.js'
import {
  applyDocsAssetsSync,
  applyDocsSync,
  assertApplyDeleteBehaviorSupported,
  createSyncRunAudit,
  findConfiguredPagesRouteCollisions,
  findDocsAssetsSyncConflicts,
  findDocsKeyById,
  findDocsSetBySlug,
  findDocsSyncConflicts,
  findDuplicateDesiredRouteCollisions,
  findExistingAssetRouteCollisions,
  findExistingDocsRouteCollisions,
  findExistingPayloadDocsAssetRecords,
  findExistingPayloadDocsRecords,
  findTrustedGitHubSources,
  getRecordId,
  isEd25519AuthEnabled,
  isGitHubOidcAuthEnabled,
  toExistingAssetRecord,
  toExistingDocsRecord,
  updateDocsSetAfterSync,
  updateSyncRunAudit,
} from '../payload/index.js'
import {
  withoutAlreadyArchivedAssetRemovals,
  withoutAlreadyArchivedRemovals,
} from '../payload/planNormalization.js'
import { resolveDocsRouteClaims } from '../payload/routeClaims.js'
import { runInSyncTransaction } from '../payload/transaction.js'
import {
  buildCanonicalSigningString,
  checkGitHubOidcPolicy,
  consumeNonce,
  extractSyncRequestHeaders,
  getCanonicalPathFromRequestUrl,
  pruneExpiredNonces,
  validateTimestampSkew,
  verifyBodySha256,
  verifyEd25519Signature,
  verifyGitHubOidcIdentity,
} from '../security/index.js'
import { planDocsAssetsSync, planDocsSync, validateDocsManifest } from '../sync/index.js'
import {
  DOCS_ASSETS_STORAGE_UNAVAILABLE_MESSAGE,
  isDocsAssetsStorageUnavailableError,
} from './assetsStorage.js'

export type DocsSyncEndpointErrorCode =
  | 'assets_storage_unavailable'
  | 'audit_unavailable'
  | 'auth_disabled'
  | 'body_hash_mismatch'
  | 'delete_behavior_not_implemented'
  | 'draft_behavior_not_available'
  | 'hard_delete_disabled'
  | 'invalid_body'
  | 'invalid_manifest'
  | 'invalid_method'
  | 'invalid_signature'
  | 'invalid_timestamp'
  | 'manual_edit_conflict'
  | 'missing_header'
  | 'nonce_replay'
  | 'oidc_expired'
  | 'oidc_invalid_audience'
  | 'oidc_invalid_issuer'
  | 'oidc_invalid_token'
  | 'oidc_jwks_unavailable'
  | 'oidc_missing_claim'
  | 'oidc_missing_jti'
  | 'oidc_not_yet_valid'
  | 'oidc_owner_not_allowed'
  | 'oidc_pull_request_not_allowed'
  | 'oidc_ref_not_allowed'
  | 'oidc_replay'
  | 'oidc_repository_not_allowed'
  | 'oidc_workflow_not_allowed'
  | 'publish_disabled'
  | 'publish_not_available'
  | 'replay_protection_unavailable'
  | 'route_collision'
  | 'source_not_allowed'
  | 'sync_apply_failed'
  | 'sync_endpoint_failed'
  | 'sync_mode_not_implemented'
  | 'sync_writes_disabled'
  | 'unknown_key'

export type CreateSyncEndpointOptions = {
  allowHardDelete?: boolean
  allowPublish?: boolean
  allowWrites?: boolean
  auditDryRuns?: boolean
  auth?: PayloadMarkdownDocsAuthConfig
  deleteBehavior?: DocsDeleteBehavior
  docsAccessCollectionSlug: string
  docsAccessEnabled: boolean
  docsAssetsCollectionSlug?: string
  docsAssetsEnabled?: boolean
  docsCollectionSlug: string
  docsEnabled: boolean
  docsEnableDrafts: boolean
  docsGroupsCollectionSlug: string
  docsSetsCollectionSlug: string
  docsSetsEnabled: boolean
  endpointPath: string
  getNow?: () => Date
  markdownFieldName: string
  maxBodyBytes?: number
  maxSkewSeconds?: number
  noncesCollectionSlug: string
  noncesEnabled: boolean
  nonceTtlSeconds?: number
  oidcFetchJson?: FetchJson
  revalidate?: false | PayloadMarkdownDocsSyncRevalidateConfig
  routing?: {
    pages?: {
      allowBridgePages: boolean
      bridgeField: string
      collection: string
      enabled: boolean
      routeField: string
    }
  }
  syncRunsCollectionSlug: string
  syncRunsEnabled: boolean
}

type SyncErrorResponse = {
  conflicts?: {
    reason: string
    route?: string
    sourcePath: string
  }[]
  error: {
    code: DocsSyncEndpointErrorCode
    message: string
  }
  ok: false
  routeCollisions?: {
    reason: string
    route: string
    sourcePath?: string
  }[]
}

type SerializedChange = {
  current?: {
    archived?: boolean
    route: string
    sourceHash?: string
    title?: string
  }
  desired?: {
    route: string
    sha256: string
    title: string
  }
  reason: string
  sourcePath: string
}

type SerializedAssetChange = {
  current?: {
    archived?: boolean
    contentType: string
    kind: string
    route?: string
    sourceHash?: string
  }
  desired?: {
    contentType: string
    kind: string
    route?: string
    sha256: string
  }
  reason: string
  sourcePath: string
}

type SyncSuccessResponse = {
  assetChanges: {
    archive: SerializedAssetChange[]
    create: SerializedAssetChange[]
    delete: SerializedAssetChange[]
    unchanged: SerializedAssetChange[]
    update: SerializedAssetChange[]
  }
  changes: {
    archive: SerializedChange[]
    create: SerializedChange[]
    delete: SerializedChange[]
    draft: SerializedChange[]
    unchanged: SerializedChange[]
    update: SerializedChange[]
  }
  deleteBehavior: DocsDeleteBehavior
  dryRun: boolean
  ok: true
  publishRequested: boolean
  summary: {
    archive: number
    assetArchive: number
    assetCreate: number
    assetDelete: number
    assetUnchanged: number
    assetUpdate: number
    create: number
    delete: number
    draft: number
    unchanged: number
    update: number
    warnings: number
  }
  syncRunId?: string
  warnings: DocsValidationIssue[]
}

const jsonResponse = (body: SyncErrorResponse | SyncSuccessResponse, status = 200): Response =>
  Response.json(body, {
    status,
  })

const errorResponse = (
  code: DocsSyncEndpointErrorCode,
  message: string,
  status = 400,
  extras: Omit<SyncErrorResponse, 'error' | 'ok'> = {},
): Response =>
  jsonResponse(
    {
      ...extras,
      error: {
        code,
        message,
      },
      ok: false,
    },
    status,
  )

const docsAssetsStorageUnavailableResponse = (): Response =>
  errorResponse('assets_storage_unavailable', DOCS_ASSETS_STORAGE_UNAVAILABLE_MESSAGE, 500)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseManifestBody = (rawBody: string): DocsManifest | undefined => {
  try {
    const parsed = JSON.parse(rawBody) as unknown

    return isRecord(parsed) ? (parsed as DocsManifest) : undefined
  } catch {
    return undefined
  }
}

const SOURCE_ID_PATTERN = /^[a-z0-9][\w.-]{0,199}$/i

const getManifestSourceId = (manifest: DocsManifest): string | undefined => {
  const source = (manifest as { source?: unknown }).source
  const id = isRecord(source) ? source.id : undefined

  return typeof id === 'string' && SOURCE_ID_PATTERN.test(id) ? id : undefined
}

/**
 * Reads the request body without buffering more than `maxBytes` (DOCS-15). Uses the
 * Content-Length header and the body stream when available; falls back to `text()`.
 */
const readRequestBodyWithLimit = async (
  req: PayloadRequest,
  maxBytes: number,
): Promise<{ ok: false; response: Response } | { ok: true; text: string }> => {
  const tooLarge = () => ({
    ok: false as const,
    response: errorResponse('invalid_body', 'Sync request body is too large.', 413),
  })
  const contentLength = Number(req.headers?.get?.('content-length') ?? Number.NaN)

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return tooLarge()
  }

  const stream = (req as { body?: unknown }).body

  if (
    stream &&
    typeof stream === 'object' &&
    typeof (stream as ReadableStream<Uint8Array>).getReader === 'function'
  ) {
    const reader = (stream as ReadableStream<Uint8Array>).getReader()
    const chunks: Uint8Array[] = []
    let received = 0

    for (;;) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      received += value.byteLength

      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined)

        return tooLarge()
      }

      chunks.push(value)
    }

    return {
      ok: true,
      text: Buffer.concat(chunks).toString('utf8'),
    }
  }

  if (typeof req.text !== 'function') {
    return {
      ok: false,
      response: errorResponse(
        'invalid_body',
        'Sync endpoint requires access to the request body text.',
        400,
      ),
    }
  }

  const text = await req.text()

  return Buffer.byteLength(text, 'utf8') > maxBytes ? tooLarge() : { ok: true, text }
}

type ResolvedSyncSource = {
  assetRouteBase: string
  docsSet: ResolvedDocsSet
  routeBase: string
  sourceId: string
}

const resolveSyncSource = async ({
  options,
  payload,
  sourceId,
}: {
  options: CreateSyncEndpointOptions
  payload: DocsSetPayloadOperations
  sourceId: string
}): Promise<
  | {
      response: Response
      source?: never
    }
  | {
      response?: never
      source: ResolvedSyncSource
    }
> => {
  const docsSet = options.docsSetsEnabled
    ? await findDocsSetBySlug({
        slug: sourceId,
        collectionSlug: options.docsSetsCollectionSlug,
        docsGroupsCollectionSlug: options.docsGroupsCollectionSlug,
        includeDrafts: true,
        payload,
      })
    : undefined

  if (docsSet) {
    return {
      source: {
        assetRouteBase: docsSet.productRoute,
        docsSet,
        routeBase: docsSet.routeBase,
        sourceId,
      },
    }
  }

  return {
    response: errorResponse(
      'source_not_allowed',
      `No docs set exists for source "${sourceId}". Create a docs set with slug "${sourceId}" in Payload Admin before syncing this source.`,
      400,
    ),
  }
}

const summarizePlan = (plan: ReturnType<typeof planDocsSync>) => ({
  archive: plan.archive.length,
  create: plan.create.length,
  delete: plan.delete.length,
  draft: plan.draft.length,
  unchanged: plan.unchanged.length,
  update: plan.update.length,
  warnings: plan.warnings.length,
})

const summarizeAssetPlan = (plan: ReturnType<typeof planDocsAssetsSync>) => ({
  assetArchive: plan.archive.length,
  assetCreate: plan.create.length,
  assetDelete: plan.delete.length,
  assetUnchanged: plan.unchanged.length,
  assetUpdate: plan.update.length,
})

const serializeChange = (change: PlannedDocChange): SerializedChange => ({
  current: change.current
    ? {
        archived: change.current.archived,
        route: change.current.route,
        sourceHash: change.current.sourceHash,
        title: change.current.title,
      }
    : undefined,
  desired: change.desired
    ? {
        route: change.desired.route,
        sha256: change.desired.sha256,
        title: change.desired.title,
      }
    : undefined,
  reason: change.reason,
  sourcePath: change.sourcePath,
})

const serializeChanges = (plan: ReturnType<typeof planDocsSync>) => ({
  archive: plan.archive.map(serializeChange),
  create: plan.create.map(serializeChange),
  delete: plan.delete.map(serializeChange),
  draft: plan.draft.map(serializeChange),
  unchanged: plan.unchanged.map(serializeChange),
  update: plan.update.map(serializeChange),
})

const serializeAssetChange = (change: PlannedAssetChange): SerializedAssetChange => ({
  current: change.current
    ? {
        archived: change.current.archived,
        contentType: change.current.contentType,
        kind: change.current.kind,
        route: change.current.route,
        sourceHash: change.current.sourceHash,
      }
    : undefined,
  desired: change.desired
    ? {
        contentType: change.desired.contentType,
        kind: change.desired.kind,
        route: change.desired.route,
        sha256: change.desired.sha256,
      }
    : undefined,
  reason: change.reason,
  sourcePath: change.sourcePath,
})

const serializeAssetChanges = (plan: ReturnType<typeof planDocsAssetsSync>) => ({
  archive: plan.archive.map(serializeAssetChange),
  create: plan.create.map(serializeAssetChange),
  delete: plan.delete.map(serializeAssetChange),
  unchanged: plan.unchanged.map(serializeAssetChange),
  update: plan.update.map(serializeAssetChange),
})

const getTotalManifestBytes = (manifest: ValidatedDocsManifest): number =>
  [...manifest.files, ...manifest.assets].reduce(
    (total, file) => total + Buffer.byteLength(file.content, 'utf8'),
    0,
  )

const DEFAULT_REVALIDATE_TAGS = [
  'payload-markdown-docs',
  'payload-markdown-docs:docs',
  'sitemap',
  'sitemap:docs',
]

type NextCacheModule = {
  revalidatePath?: (path: string, type?: 'layout' | 'page') => void
  revalidateTag?: (tag: string, profile?: { expire?: number } | string) => void
}

const importNextCache = async (): Promise<NextCacheModule | undefined> => {
  try {
    return (await import('next/cache')) as unknown as NextCacheModule
  } catch {
    return undefined
  }
}

const getRevalidationTags = ({
  revalidate,
  sourceId,
}: {
  revalidate?: false | PayloadMarkdownDocsSyncRevalidateConfig
  sourceId: string
}): string[] => {
  if (revalidate === false) {
    return []
  }

  const configuredTags = typeof revalidate === 'object' ? revalidate.tags : undefined
  const tags = configuredTags ?? [...DEFAULT_REVALIDATE_TAGS, `payload-markdown-docs:${sourceId}`]

  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
}

const getRevalidationPaths = ({
  assetPlan,
  docsSet,
  manifest,
  plan,
}: {
  assetPlan: ReturnType<typeof planDocsAssetsSync>
  docsSet?: ResolvedDocsSet
  manifest: ValidatedDocsManifest
  plan: ReturnType<typeof planDocsSync>
}): string[] => {
  const paths = new Set<string>()

  if (docsSet?.groupPageMode === 'auto' && docsSet.groupRoutePath) {
    paths.add(docsSet.groupRoutePath)
  }

  for (const file of manifest.files) {
    paths.add(file.route)
  }

  for (const asset of manifest.assets) {
    if (asset.route) {
      paths.add(asset.route)
    }
  }

  for (const change of [...plan.archive, ...plan.delete, ...plan.draft, ...plan.update]) {
    if (change.current?.route) {
      paths.add(change.current.route)
    }

    if (change.desired?.route) {
      paths.add(change.desired.route)
    }
  }

  for (const change of [...assetPlan.archive, ...assetPlan.delete, ...assetPlan.update]) {
    if (change.current?.route) {
      paths.add(change.current.route)
    }

    if (change.desired?.route) {
      paths.add(change.desired.route)
    }
  }

  return [...paths].filter((path) => path.startsWith('/'))
}

const revalidateDocsSyncCache = async ({
  assetPlan,
  docsSet,
  manifest,
  options,
  plan,
}: {
  assetPlan: ReturnType<typeof planDocsAssetsSync>
  docsSet?: ResolvedDocsSet
  manifest: ValidatedDocsManifest
  options: CreateSyncEndpointOptions
  plan: ReturnType<typeof planDocsSync>
}): Promise<void> => {
  if (options.revalidate === false) {
    return
  }

  const nextCache = await importNextCache()

  if (!nextCache) {
    return
  }

  const tags = getRevalidationTags({
    revalidate: options.revalidate,
    sourceId: manifest.source.id,
  })

  for (const tag of tags) {
    try {
      nextCache.revalidateTag?.(tag, 'max')
    } catch {
      // Revalidation is best effort so sync writes are not rolled back by cache runtime limits.
    }
  }

  const shouldRevalidatePaths =
    options.revalidate === undefined ||
    (typeof options.revalidate === 'object' && options.revalidate.paths !== false)

  if (!shouldRevalidatePaths) {
    return
  }

  for (const path of getRevalidationPaths({
    assetPlan,
    docsSet,
    manifest,
    plan,
  })) {
    try {
      nextCache.revalidatePath?.(path)
    } catch {
      // Revalidation is best effort so sync writes are not rolled back by cache runtime limits.
    }
  }
}

const getPlannedConflictChanges = ({
  existing,
  plan,
}: {
  existing: ExistingPayloadDocsRecord[]
  plan: ReturnType<typeof planDocsSync>
}): PlannedDocChange[] => {
  const existingBySourcePath = new Map(existing.map((record) => [record.sourcePath, record]))
  const archivedUnchanged = plan.unchanged.filter((change) => {
    const current = existingBySourcePath.get(change.sourcePath)

    return current?.archived === true
  })

  return [...plan.update, ...plan.archive, ...plan.draft, ...plan.delete, ...archivedUnchanged]
}

const getPlannedAssetConflictChanges = ({
  plan,
}: {
  plan: ReturnType<typeof planDocsAssetsSync>
}): PlannedAssetChange[] => [...plan.update, ...plan.archive, ...plan.delete]

const getLifecyclePolicyError = ({
  deleteBehavior,
  manifest,
  options,
}: {
  deleteBehavior: DocsDeleteBehavior
  manifest: ValidatedDocsManifest
  options: CreateSyncEndpointOptions
}): Response | undefined => {
  if (manifest.publish && options.allowPublish !== true) {
    return errorResponse('publish_disabled', 'Publishing is disabled by server configuration.', 403)
  }

  if (manifest.publish && !options.docsEnableDrafts) {
    return errorResponse(
      'publish_not_available',
      'Publishing requires a draft-enabled dedicated docs collection.',
      400,
    )
  }

  if (deleteBehavior === 'draft' && !options.docsEnableDrafts) {
    return errorResponse(
      'draft_behavior_not_available',
      'Draft delete behavior requires a draft-enabled dedicated docs collection.',
      400,
    )
  }

  if (deleteBehavior === 'delete' && options.allowHardDelete !== true) {
    return errorResponse(
      'hard_delete_disabled',
      'Hard delete is disabled by server configuration.',
      403,
    )
  }

  return undefined
}

const getRouteCollisionIssues = async ({
  docsSet,
  manifest,
  options,
  payload,
  routeBase,
}: {
  docsSet?: ResolvedDocsSet
  manifest: ValidatedDocsManifest
  options: CreateSyncEndpointOptions
  payload: RouteCollisionPayloadOperations
  routeBase: string
}) => {
  const desiredAssetRoutes = manifest.assets.flatMap((asset) => (asset.route ? [asset.route] : []))
  const desiredRoutes = [...manifest.files.map((file) => file.route), ...desiredAssetRoutes]
  const duplicateDesiredRouteCollisions = findDuplicateDesiredRouteCollisions(desiredRoutes)
  const existingDocsRouteCollisions = options.docsEnabled
    ? await findExistingDocsRouteCollisions({
        collectionSlug: options.docsCollectionSlug,
        docsSetId: docsSet?.id,
        includeDrafts: options.docsEnableDrafts,
        payload,
        routes: desiredRoutes,
        sourceId: manifest.source.id,
      })
    : []
  const existingAssetRouteCollisions =
    options.docsAssetsEnabled === true && desiredAssetRoutes.length > 0
      ? await findExistingAssetRouteCollisions({
          collectionSlug: options.docsAssetsCollectionSlug ?? DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
          docsSetId: docsSet?.id,
          payload,
          routes: desiredRoutes,
          sourceId: manifest.source.id,
        })
      : []
  const pageRouteCollisions =
    options.routing?.pages?.enabled === true
      ? await findConfiguredPagesRouteCollisions({
          allowBridgePages: options.routing.pages.allowBridgePages,
          bridgeField: options.routing.pages.bridgeField,
          collectionSlug: options.routing.pages.collection,
          docsGroupRoutes:
            docsSet?.groupRoutePath && docsSet.groupPageMode === 'auto'
              ? [
                  {
                    ownerId: docsSet.groupId,
                    pageMode: docsSet.groupPageMode,
                    routePath: docsSet.groupRoutePath,
                  },
                ]
              : [],
          docsSetRouteBase: routeBase,
          payload,
          routeField: options.routing.pages.routeField,
        })
      : []

  return [
    ...duplicateDesiredRouteCollisions,
    ...existingDocsRouteCollisions,
    ...existingAssetRouteCollisions,
    ...pageRouteCollisions,
  ]
}

type AuthenticatedSyncRequest = {
  actor?: string
  bodyHash: string
  branch?: string
  commit?: string
  keyId: string
  nonce: string
  /** Present for GitHub OIDC requests; docs-set policy is checked after lookup. */
  oidcClaims?: GitHubOidcClaims
  repository?: string
}

const getRequiredHeader = (headers: Headers, name: string): string | undefined => {
  const value = headers.get(name)

  return value && value.trim() !== '' ? value.trim() : undefined
}

const getBearerToken = (headers: Headers): string | undefined => {
  const authorization = getRequiredHeader(headers, 'authorization')

  if (!authorization) {
    return undefined
  }

  const [scheme, token] = authorization.split(/\s+/, 2)

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return ''
  }

  return token
}

const hasEd25519AuthHeaders = (headers: Headers): boolean =>
  getRequiredHeader(headers, 'x-vl-md-docs-key-id') !== undefined ||
  getRequiredHeader(headers, 'x-vl-md-docs-signature') !== undefined ||
  getRequiredHeader(headers, 'x-vl-md-docs-timestamp') !== undefined ||
  getRequiredHeader(headers, 'x-vl-md-docs-nonce') !== undefined

const assertReplayProtectionAvailable = (
  options: CreateSyncEndpointOptions,
): Response | undefined =>
  options.noncesEnabled
    ? undefined
    : errorResponse(
        'replay_protection_unavailable',
        'Sync endpoint requires nonce replay protection.',
        500,
      )

const authenticateEd25519Request = async ({
  now,
  options,
  rawBody,
  req,
  sourceId,
}: {
  now: Date
  options: CreateSyncEndpointOptions
  rawBody: string
  req: PayloadRequest
  sourceId: string
}): Promise<
  | {
      identity: AuthenticatedSyncRequest
      response?: never
    }
  | {
      identity?: never
      response: Response
    }
> => {
  const headersResult = extractSyncRequestHeaders(req.headers)

  if (!headersResult.ok) {
    return {
      response: errorResponse(
        'missing_header',
        `Missing required sync header: ${headersResult.header}.`,
        401,
      ),
    }
  }

  if (!options.docsAccessEnabled) {
    return {
      response: errorResponse(
        'auth_disabled',
        'Signed sync authentication requires the docs Access collection.',
        401,
      ),
    }
  }

  const keyConfig = await findDocsKeyById({
    collectionSlug: options.docsAccessCollectionSlug,
    keyId: headersResult.headers.keyId,
    payload: req.payload as unknown as DocsAccessPayloadOperations,
  })

  if (!keyConfig) {
    return {
      response: errorResponse('unknown_key', 'Unknown sync request key id.', 401),
    }
  }

  const bodyHash = verifyBodySha256({
    body: rawBody,
    expectedHash: headersResult.headers.bodySha256,
  })

  if (!bodyHash.ok) {
    return {
      response: errorResponse(
        'body_hash_mismatch',
        'Sync request body hash does not match the signed header.',
        401,
      ),
    }
  }

  const timestampValidation = validateTimestampSkew({
    maxSkewSeconds: options.maxSkewSeconds ?? DEFAULT_MAX_SKEW_SECONDS,
    now,
    timestamp: headersResult.headers.timestamp,
  })

  if (!timestampValidation.ok) {
    return {
      response: errorResponse('invalid_timestamp', timestampValidation.message, 401),
    }
  }

  const replayUnavailable = assertReplayProtectionAvailable(options)

  if (replayUnavailable) {
    return {
      response: replayUnavailable,
    }
  }

  const canonicalPath = getCanonicalPathFromRequestUrl({
    endpointPath: options.endpointPath,
    url: req.url,
  })
  const canonicalString = buildCanonicalSigningString({
    bodySha256: bodyHash.computedHash,
    method: 'POST',
    nonce: headersResult.headers.nonce,
    path: canonicalPath,
    timestamp: headersResult.headers.timestamp,
  })

  if (
    !verifyEd25519Signature({
      canonicalString,
      publicKey: keyConfig.publicKey,
      signature: headersResult.headers.signature,
    })
  ) {
    return {
      response: errorResponse('invalid_signature', 'Invalid sync request signature.', 401),
    }
  }

  const maxSkewSeconds = options.maxSkewSeconds ?? DEFAULT_MAX_SKEW_SECONDS
  const nonceTtlSeconds = options.nonceTtlSeconds ?? DEFAULT_NONCE_TTL_SECONDS
  const signedAt = Date.parse(headersResult.headers.timestamp)
  // Remember the nonce at least until the signed timestamp leaves the accepted skew
  // window, plus a second of margin (DOCS-7).
  const expiresAt = new Date(
    Math.max(now.getTime() + nonceTtlSeconds * 1000, signedAt + maxSkewSeconds * 1000) + 1000,
  )
  const consumed = await consumeNonce({
    bodyHash: bodyHash.computedHash,
    collectionSlug: options.noncesCollectionSlug,
    expiresAt,
    keyId: headersResult.headers.keyId,
    nonce: headersResult.headers.nonce,
    now,
    payload: req.payload as unknown as NoncePayloadOperations,
    sourceId,
  })

  if (!consumed) {
    return {
      response: errorResponse('nonce_replay', 'Sync request nonce has already been used.', 409),
    }
  }

  return {
    identity: {
      bodyHash: bodyHash.computedHash,
      keyId: headersResult.headers.keyId,
      nonce: headersResult.headers.nonce,
    },
  }
}

const authenticateGitHubOidcRequest = async ({
  now,
  options,
  rawBody,
  req,
  sourceId,
}: {
  now: Date
  options: CreateSyncEndpointOptions
  rawBody: string
  req: PayloadRequest
  sourceId: string
}): Promise<
  | {
      identity: AuthenticatedSyncRequest
      response?: never
    }
  | {
      identity?: never
      response: Response
    }
> => {
  const token = getBearerToken(req.headers)

  if (token === undefined) {
    return {
      response: errorResponse(
        'missing_header',
        'Missing required sync header: Authorization.',
        401,
      ),
    }
  }

  if (token === '') {
    return {
      response: errorResponse(
        'oidc_invalid_token',
        'Authorization must be a Bearer GitHub OIDC token.',
        401,
      ),
    }
  }

  const expectedHash = getRequiredHeader(req.headers, 'x-vl-md-docs-body-sha256')

  if (!expectedHash) {
    return {
      response: errorResponse(
        'missing_header',
        'Missing required sync header: X-VL-MD-DOCS-Body-SHA256.',
        401,
      ),
    }
  }

  const bodyHash = verifyBodySha256({
    body: rawBody,
    expectedHash,
  })

  if (!bodyHash.ok) {
    return {
      response: errorResponse(
        'body_hash_mismatch',
        'Sync request body hash does not match the OIDC header.',
        401,
      ),
    }
  }

  if (!options.docsAccessEnabled) {
    return {
      response: errorResponse(
        'auth_disabled',
        'GitHub OIDC sync authentication requires the docs Access collection.',
        401,
      ),
    }
  }

  const trustedSources = await findTrustedGitHubSources({
    collectionSlug: options.docsAccessCollectionSlug,
    payload: req.payload as unknown as DocsAccessPayloadOperations,
  })
  // Identity only: the docs set is not looked up until the caller is authenticated.
  // The audience must still equal the manifest source id (the docs set slug).
  const verified = await verifyGitHubOidcIdentity({
    config: {
      audience: sourceId,
      maxSkewSeconds: options.maxSkewSeconds,
      trustedSources,
    },
    fetchJson: options.oidcFetchJson,
    now,
    token,
  })

  if (!verified.ok) {
    return {
      response: errorResponse(
        verified.code,
        verified.message,
        verified.code === 'oidc_jwks_unavailable' ? 503 : 401,
      ),
    }
  }

  const replayUnavailable = assertReplayProtectionAvailable(options)

  if (replayUnavailable) {
    return {
      response: replayUnavailable,
    }
  }

  const consumed = await consumeNonce({
    bodyHash: bodyHash.computedHash,
    collectionSlug: options.noncesCollectionSlug,
    expiresAt: verified.token.expiresAt,
    keyId: verified.token.keyId,
    nonce: verified.token.claims.jti,
    now,
    payload: req.payload as unknown as NoncePayloadOperations,
    sourceId,
  })

  if (!consumed) {
    return {
      response: errorResponse('oidc_replay', 'GitHub OIDC token jti has already been used.', 409),
    }
  }

  return {
    identity: {
      actor: verified.token.claims.actor,
      bodyHash: bodyHash.computedHash,
      branch: verified.token.claims.ref,
      commit: verified.token.claims.sha,
      keyId: verified.token.keyId,
      nonce: verified.token.claims.jti,
      oidcClaims: verified.token.claims,
      repository: verified.token.claims.repository,
    },
  }
}

const authenticateSyncRequest = async ({
  now,
  options,
  rawBody,
  req,
  sourceId,
}: {
  now: Date
  options: CreateSyncEndpointOptions
  rawBody: string
  req: PayloadRequest
  sourceId: string
}): Promise<
  | {
      identity: AuthenticatedSyncRequest
      response?: never
    }
  | {
      identity?: never
      response: Response
    }
> => {
  const ed25519Enabled = isEd25519AuthEnabled(options.auth)
  const githubOidcEnabled = isGitHubOidcAuthEnabled(options.auth)

  if (!ed25519Enabled && !githubOidcEnabled) {
    return {
      response: errorResponse(
        'auth_disabled',
        'Sync authentication is not configured for this endpoint.',
        401,
      ),
    }
  }

  const bearerToken = getBearerToken(req.headers)

  if (bearerToken !== undefined) {
    if (!githubOidcEnabled) {
      return {
        response: errorResponse(
          'auth_disabled',
          'GitHub OIDC sync authentication is not configured for this endpoint.',
          401,
        ),
      }
    }

    return authenticateGitHubOidcRequest({
      now,
      options,
      rawBody,
      req,
      sourceId,
    })
  }

  if (hasEd25519AuthHeaders(req.headers) || !githubOidcEnabled) {
    if (!ed25519Enabled) {
      return {
        response: errorResponse(
          'auth_disabled',
          'Signed sync authentication is not configured for this endpoint.',
          401,
        ),
      }
    }

    return authenticateEd25519Request({
      now,
      options,
      rawBody,
      req,
      sourceId,
    })
  }

  return authenticateGitHubOidcRequest({
    now,
    options,
    rawBody,
    req,
    sourceId,
  })
}

class SyncApplyConflictError extends Error {
  readonly conflicts: { reason: string; route?: string; sourcePath: string }[]

  constructor(conflicts: { reason: string; route?: string; sourcePath: string }[]) {
    super('One or more docs were modified outside the docs sync workflow.')
    this.name = 'SyncApplyConflictError'
    this.conflicts = conflicts
  }
}

const logSyncFailure = (req: PayloadRequest, error: unknown, message: string): void => {
  const logger = (req.payload as { logger?: { error?: (...args: unknown[]) => void } } | undefined)
    ?.logger

  if (typeof logger?.error === 'function') {
    logger.error({ err: error, msg: message })
  }
}

const isRouteUniqueViolation = (error: unknown): boolean => {
  if (!(error instanceof Error) || error.name !== 'ValidationError') {
    return false
  }

  const data = (error as { data?: { errors?: { path?: string }[] } }).data

  return (data?.errors ?? []).some((issue) => issue.path === 'route')
}

const classifySyncApplyFailure = (
  error: unknown,
): {
  code: DocsSyncEndpointErrorCode
  extras?: Omit<SyncErrorResponse, 'error' | 'ok'>
  message: string
  status: number
} => {
  if (error instanceof SyncApplyConflictError) {
    return {
      code: 'manual_edit_conflict',
      extras: {
        conflicts: error.conflicts,
      },
      message: error.message,
      status: 409,
    }
  }

  if (isRouteUniqueViolation(error)) {
    return {
      code: 'route_collision',
      message:
        'A docs route was claimed concurrently by another record. The sync was rolled back; retry it.',
      status: 409,
    }
  }

  if (isDocsAssetsStorageUnavailableError(error)) {
    return {
      code: 'assets_storage_unavailable',
      message: DOCS_ASSETS_STORAGE_UNAVAILABLE_MESSAGE,
      status: 500,
    }
  }

  return {
    code: 'sync_apply_failed',
    message: 'Sync apply failed. See the server log for details.',
    status: 500,
  }
}

const createSyncEndpointHandler =
  (options: CreateSyncEndpointOptions) =>
  async (req: PayloadRequest): Promise<Response> => {
    const startedAt = options.getNow?.() ?? new Date()

    if (req.method && req.method.toUpperCase() !== 'POST') {
      return errorResponse('invalid_method', 'Sync endpoint only accepts POST.', 405)
    }

    const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
    const body = await readRequestBodyWithLimit(req, maxBodyBytes)

    if (!body.ok) {
      return body.response
    }

    const rawBody = body.text
    const manifest = parseManifestBody(rawBody)

    if (!manifest) {
      return errorResponse('invalid_body', 'Sync request body must be a JSON manifest.', 400)
    }

    // Validated before any database access: the id selects the docs set and the OIDC
    // audience, so it must be a plain slug string (DOCS-15).
    const sourceId = getManifestSourceId(manifest)

    if (!sourceId) {
      return errorResponse(
        'source_not_allowed',
        'Manifest source.id is required and must be a docs set slug.',
        400,
      )
    }

    // Authenticate before looking up the docs set, so unauthenticated callers cannot
    // probe which docs sets exist (DOCS-15).
    const authentication = await authenticateSyncRequest({
      now: startedAt,
      options,
      rawBody,
      req,
      sourceId,
    })

    if (authentication.response) {
      return authentication.response
    }

    void pruneExpiredNonces({
      collectionSlug: options.noncesCollectionSlug,
      now: startedAt,
      payload: req.payload as unknown as NoncePayloadOperations,
    })

    const sourceResolution = await resolveSyncSource({
      options,
      payload: req.payload as unknown as DocsSetPayloadOperations,
      sourceId,
    })

    if (sourceResolution.response) {
      return sourceResolution.response
    }

    if (authentication.identity.oidcClaims) {
      const docsSet = sourceResolution.source.docsSet
      const policy = checkGitHubOidcPolicy({
        claims: authentication.identity.oidcClaims,
        config: {
          allowedRefs: [
            docsSet.branch.startsWith('refs/') ? docsSet.branch : `refs/heads/${docsSet.branch}`,
          ],
          allowedWorkflowRefs: docsSet.advancedSecurity?.allowedWorkflowRefs,
          allowPullRequests: docsSet.allowPullRequests,
          enforceWorkflowRefs: docsSet.advancedSecurity?.enabled === true,
        },
      })

      if (!policy.ok) {
        return errorResponse(policy.code, policy.message, 401)
      }
    }

    const validation = validateDocsManifest(manifest, {
      allowedSourceIds: [sourceResolution.source.sourceId],
      assetRouteBase: sourceResolution.source.assetRouteBase,
      maxTotalBytes: maxBodyBytes,
      routeBase: sourceResolution.source.routeBase,
    })

    if (!validation.ok) {
      return jsonResponse(
        {
          error: {
            code: 'invalid_manifest',
            message: 'Sync manifest is invalid.',
          },
          ok: false,
        },
        400,
      )
    }

    const effectiveDeleteBehavior = options.deleteBehavior ?? 'archive'
    const lifecyclePolicyError = getLifecyclePolicyError({
      deleteBehavior: effectiveDeleteBehavior,
      manifest: validation.data,
      options,
    })

    if (lifecyclePolicyError) {
      return lifecyclePolicyError
    }

    let routeCollisions

    try {
      routeCollisions = await getRouteCollisionIssues({
        docsSet: sourceResolution.source.docsSet,
        manifest: validation.data,
        options,
        payload: req.payload as unknown as RouteCollisionPayloadOperations,
        routeBase: sourceResolution.source.routeBase,
      })
    } catch (error) {
      if (validation.data.assets.length > 0 && isDocsAssetsStorageUnavailableError(error)) {
        return docsAssetsStorageUnavailableResponse()
      }

      throw error
    }

    if (routeCollisions.length > 0) {
      return errorResponse(
        'route_collision',
        'One or more docs routes collide with an existing route reservation.',
        409,
        {
          routeCollisions,
        },
      )
    }

    const isSyncMode = validation.data.mode === 'sync'

    if (isSyncMode && options.allowWrites !== true) {
      return errorResponse(
        'sync_writes_disabled',
        'Sync writes are disabled by server configuration.',
        403,
      )
    }

    if (
      isSyncMode &&
      !assertApplyDeleteBehaviorSupported(effectiveDeleteBehavior, {
        allowHardDelete: options.allowHardDelete,
        docsEnableDrafts: options.docsEnableDrafts,
      })
    ) {
      return errorResponse(
        'delete_behavior_not_implemented',
        'Configured delete behavior cannot be applied.',
        400,
      )
    }

    if (isSyncMode && !options.syncRunsEnabled) {
      return errorResponse(
        'audit_unavailable',
        'Applied sync requires the sync-run audit collection.',
        500,
      )
    }

    const existingPayloadDocs = options.docsEnabled
      ? await findExistingPayloadDocsRecords({
          collectionSlug: options.docsCollectionSlug,
          docsSetId: sourceResolution.source.docsSet?.id,
          draft: options.docsEnableDrafts,
          markdownFieldName: options.markdownFieldName,
          payload: req.payload as unknown as ExistingDocsPayloadOperations,
          sourceId: validation.data.source.id,
        })
      : []
    const existingDocs = existingPayloadDocs.map(toExistingDocsRecord)
    const plan = withoutAlreadyArchivedRemovals(
      planDocsSync({
        deleteBehavior: effectiveDeleteBehavior,
        desired: validation.data,
        existing: existingDocs,
      }),
    )
    const docsAssetsCollectionSlug =
      options.docsAssetsCollectionSlug ?? DEFAULT_DOCS_ASSETS_COLLECTION_SLUG
    let existingPayloadAssets: Awaited<ReturnType<typeof findExistingPayloadDocsAssetRecords>> = []

    // Existing assets are always loaded when assets are enabled, so a manifest that
    // drops every asset (`assets: []`) archives them instead of leaving them live (DOCS-9).
    if (options.docsAssetsEnabled === true) {
      try {
        existingPayloadAssets = await findExistingPayloadDocsAssetRecords({
          collectionSlug: docsAssetsCollectionSlug,
          docsSetId: sourceResolution.source.docsSet?.id,
          payload: req.payload as unknown as ExistingAssetsPayloadOperations,
          sourceId: validation.data.source.id,
        })
      } catch (error) {
        if (!isDocsAssetsStorageUnavailableError(error)) {
          throw error
        }

        // Docs-only manifests do not require the assets table to exist yet.
        if (validation.data.assets.length > 0) {
          return docsAssetsStorageUnavailableResponse()
        }
      }
    }

    const shouldSyncAssets =
      options.docsAssetsEnabled === true &&
      (validation.data.assets.length > 0 || existingPayloadAssets.length > 0)
    const existingAssets = existingPayloadAssets.map(toExistingAssetRecord)
    const assetPlan = withoutAlreadyArchivedAssetRemovals(
      planDocsAssetsSync({
        deleteBehavior: effectiveDeleteBehavior,
        desired: validation.data,
        existing: existingAssets,
      }),
    )
    const warnings = [...validation.warnings, ...plan.warnings, ...assetPlan.warnings]
    const summary = {
      ...summarizePlan(plan),
      ...summarizeAssetPlan(assetPlan),
      warnings: warnings.length,
    }
    if (isSyncMode) {
      const existingBySourcePath = new Map(
        existingPayloadDocs.map((record) => [record.sourcePath, record]),
      )
      const conflicts = findDocsSyncConflicts({
        existingBySourcePath,
        plannedChanges: getPlannedConflictChanges({
          existing: existingPayloadDocs,
          plan,
        }),
      })

      if (conflicts.length > 0) {
        return errorResponse(
          'manual_edit_conflict',
          'One or more docs were modified outside the docs sync workflow.',
          409,
          {
            conflicts,
          },
        )
      }

      const existingAssetsBySourcePath = new Map(
        existingPayloadAssets.map((record) => [record.sourcePath, record]),
      )
      const assetConflicts = findDocsAssetsSyncConflicts({
        existingBySourcePath: existingAssetsBySourcePath,
        plannedChanges: getPlannedAssetConflictChanges({
          plan: assetPlan,
        }),
      })

      if (assetConflicts.length > 0) {
        return errorResponse(
          'manual_edit_conflict',
          'One or more docs assets were modified outside the docs sync workflow.',
          409,
          {
            conflicts: assetConflicts,
          },
        )
      }
    }

    const writesMainForUpdates = validation.data.publish || !options.docsEnableDrafts
    const routeClaims = options.docsEnabled
      ? await resolveDocsRouteClaims({
          collectionSlug: options.docsCollectionSlug,
          deleteBehavior: effectiveDeleteBehavior,
          existing: existingPayloadDocs,
          payload: req.payload as unknown as Parameters<typeof resolveDocsRouteClaims>[0]['payload'],
          plan,
          writesMainForUpdates,
        })
      : { collisions: [], releases: [] }

    if (routeClaims.collisions.length > 0) {
      return errorResponse(
        'route_collision',
        'One or more docs routes are still held by another doc that this sync cannot release.',
        409,
        {
          routeCollisions: routeClaims.collisions,
        },
      )
    }

    let syncRunId: number | string | undefined

    if (options.syncRunsEnabled && (isSyncMode || options.auditDryRuns !== false)) {
      const syncRun = await createSyncRunAudit({
        actor: authentication.identity.actor,
        bodyHash: authentication.identity.bodyHash,
        branch: authentication.identity.branch ?? validation.data.source.branch,
        collectionSlug: options.syncRunsCollectionSlug,
        commit: authentication.identity.commit ?? validation.data.source.commit,
        completedAt: isSyncMode ? startedAt : (options.getNow?.() ?? new Date()),
        deleteBehavior: effectiveDeleteBehavior,
        errors: [],
        fileCount: validation.data.files.length + validation.data.assets.length,
        keyId: authentication.identity.keyId,
        mode: isSyncMode ? 'sync' : 'dry-run',
        payload: req.payload as unknown as SyncRunsPayloadOperations,
        publishRequested: validation.data.publish,
        repository: authentication.identity.repository ?? validation.data.source.repository,
        sourceId: validation.data.source.id,
        startedAt,
        status: isSyncMode ? 'pending' : 'success',
        summary,
        totalBytes: getTotalManifestBytes(validation.data),
        warnings,
      })

      syncRunId = getRecordId(syncRun)
    }

    if (isSyncMode) {
      if (!syncRunId) {
        return errorResponse(
          'audit_unavailable',
          'Applied sync could not create a sync-run audit record.',
          500,
        )
      }

      try {
        await runInSyncTransaction({
          payload: req.payload as unknown as Parameters<typeof runInSyncTransaction>[0]['payload'],
          work: async (transactionReq) => {
            const applyResult = await applyDocsSync({
              collectionSlug: options.docsCollectionSlug,
              deleteBehavior: effectiveDeleteBehavior,
              docsEnableDrafts: options.docsEnableDrafts,
              docsSetId: sourceResolution.source.docsSet?.id,
              existing: existingPayloadDocs,
              manifest: validation.data,
              markdownFieldName: options.markdownFieldName,
              now: options.getNow?.() ?? new Date(),
              payload: req.payload as unknown as ApplyDocsSyncPayloadOperations,
              plan,
              publish: validation.data.publish,
              releases: routeClaims.releases,
              req: transactionReq,
              syncRunId,
            })

            if (!applyResult.ok) {
              throw new SyncApplyConflictError(applyResult.conflicts)
            }

            if (shouldSyncAssets) {
              const applyAssetsResult = await applyDocsAssetsSync({
                collectionSlug: docsAssetsCollectionSlug,
                deleteBehavior: effectiveDeleteBehavior,
                docsSetId: sourceResolution.source.docsSet?.id,
                existing: existingPayloadAssets,
                manifest: validation.data,
                now: options.getNow?.() ?? new Date(),
                payload: req.payload as unknown as ApplyDocsAssetsSyncPayloadOperations,
                plan: assetPlan,
                req: transactionReq,
                syncRunId,
              })

              if (!applyAssetsResult.ok) {
                throw new SyncApplyConflictError(applyAssetsResult.conflicts)
              }
            }

            if (sourceResolution.source.docsSet) {
              await updateDocsSetAfterSync({
                collectionSlug: options.docsSetsCollectionSlug,
                docsSetId: sourceResolution.source.docsSet.id,
                now: options.getNow?.() ?? new Date(),
                payload: req.payload as unknown as DocsSetPayloadOperations,
                publish: validation.data.publish,
                req: transactionReq,
              })
            }
          },
        })
      } catch (error) {
        const failure = classifySyncApplyFailure(error)

        logSyncFailure(req, error, 'Docs sync apply failed and was rolled back.')
        await updateSyncRunAudit({
          collectionSlug: options.syncRunsCollectionSlug,
          completedAt: options.getNow?.() ?? new Date(),
          errors: [
            {
              code: failure.code,
              message: failure.message,
            },
          ],
          payload: req.payload as unknown as SyncRunsPayloadOperations,
          status: 'failed',
          summary,
          syncRunId,
          warnings,
        }).catch((auditError: unknown) => {
          logSyncFailure(req, auditError, 'Could not mark docs sync run as failed.')
        })

        return errorResponse(failure.code, failure.message, failure.status, failure.extras)
      }

      await updateSyncRunAudit({
        collectionSlug: options.syncRunsCollectionSlug,
        completedAt: options.getNow?.() ?? new Date(),
        payload: req.payload as unknown as SyncRunsPayloadOperations,
        status: 'success',
        summary,
        syncRunId,
        warnings,
      })

      await revalidateDocsSyncCache({
        assetPlan,
        docsSet: sourceResolution.source.docsSet,
        manifest: validation.data,
        options,
        plan,
      })
    }

    return jsonResponse({
      assetChanges: serializeAssetChanges(assetPlan),
      changes: serializeChanges(plan),
      deleteBehavior: effectiveDeleteBehavior,
      dryRun: !isSyncMode,
      ok: true,
      publishRequested: validation.data.publish,
      summary,
      syncRunId: syncRunId === undefined ? undefined : String(syncRunId),
      warnings,
    })
  }

const createSyncEndpointHandlerWithErrorBoundary =
  (options: CreateSyncEndpointOptions) =>
  async (req: PayloadRequest): Promise<Response> => {
    try {
      return await createSyncEndpointHandler(options)(req)
    } catch (error) {
      // Never echo raw database/validation messages to the client (DOCS-17).
      logSyncFailure(req, error, 'Docs sync endpoint failed.')

      return errorResponse(
        'sync_endpoint_failed',
        'Sync endpoint failed. See the server log for details.',
        500,
      )
    }
  }

export const createSyncEndpoint = (options: CreateSyncEndpointOptions): Endpoint => ({
  handler: createSyncEndpointHandlerWithErrorBoundary(options),
  method: 'post',
  path: options.endpointPath,
})
