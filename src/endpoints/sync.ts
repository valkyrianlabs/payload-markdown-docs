import type { Endpoint, PayloadRequest } from 'payload'

import type {
  ApplyDocsSyncPayloadOperations,
  DocsKeyPayloadOperations,
  DocsSetPayloadOperations,
  DocsTrustedPayloadOperations,
  ExistingDocsPayloadOperations,
  ExistingPayloadDocsRecord,
  ResolvedDocsSet,
  RouteCollisionPayloadOperations,
  SyncRunsPayloadOperations,
} from '../payload/index.js'
import type { FetchJson, NoncePayloadOperations } from '../security/index.js'
import type {
  DocsDeleteBehavior,
  DocsManifest,
  DocsValidationIssue,
  PlannedDocChange,
  ValidatedDocsManifest,
} from '../sync/index.js'
import type {
  PayloadMarkdownDocsAuthConfig,
  PayloadMarkdownDocsSyncRevalidateConfig,
} from '../types.js'

import {
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_SKEW_SECONDS,
  DEFAULT_NONCE_TTL_SECONDS,
} from '../constants.js'
import {
  applyDocsSync,
  assertApplyDeleteBehaviorSupported,
  createSyncRunAudit,
  findConfiguredPagesRouteCollisions,
  findDocsKeyById,
  findDocsSetBySlug,
  findDocsSyncConflicts,
  findDuplicateDesiredRouteCollisions,
  findExistingDocsRouteCollisions,
  findExistingPayloadDocsRecords,
  findTrustedGitHubSources,
  getRecordId,
  isEd25519AuthEnabled,
  isGitHubOidcAuthEnabled,
  toExistingDocsRecord,
  updateDocsSetAfterSync,
  updateSyncRunAudit,
} from '../payload/index.js'
import {
  assertNonceNotReplayed,
  buildCanonicalSigningString,
  extractSyncRequestHeaders,
  getCanonicalPathFromRequestUrl,
  storeAcceptedNonce,
  validateTimestampSkew,
  verifyBodySha256,
  verifyEd25519Signature,
  verifyGitHubOidcToken,
} from '../security/index.js'
import { planDocsSync, validateDocsManifest } from '../sync/index.js'

export type DocsSyncEndpointErrorCode =
  | 'audit_unavailable'
  | 'auth_disabled'
  | 'body_hash_mismatch'
  | 'delete_behavior_not_implemented'
  | 'draft_behavior_not_available'
  | 'dry_run_required_not_implemented'
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
  | 'sync_mode_not_implemented'
  | 'sync_writes_disabled'
  | 'unknown_key'

export type CreateSyncEndpointOptions = {
  allowHardDelete?: boolean
  allowPublish?: boolean
  allowWrites?: boolean
  auth?: PayloadMarkdownDocsAuthConfig
  deleteBehavior?: DocsDeleteBehavior
  docsCollectionSlug: string
  docsEnabled: boolean
  docsEnableDrafts: boolean
  docsGroupsCollectionSlug: string
  docsKeysCollectionSlug: string
  docsKeysEnabled: boolean
  docsSetsCollectionSlug: string
  docsSetsEnabled: boolean
  docsTrustedCollectionSlug: string
  docsTrustedEnabled: boolean
  endpointPath: string
  getNow?: () => Date
  markdownFieldName: string
  maxBodyBytes?: number
  maxSkewSeconds?: number
  noncesCollectionSlug: string
  noncesEnabled: boolean
  nonceTtlSeconds?: number
  oidcFetchJson?: FetchJson
  requireDryRunBeforeApply?: boolean
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

type SyncSuccessResponse = {
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

type ResolvedSyncSource = {
  docsSet: ResolvedDocsSet
  routeBase: string
  sourceId: string
}

const resolveSyncSource = async ({
  manifest,
  options,
  payload,
}: {
  manifest: DocsManifest
  options: CreateSyncEndpointOptions
  payload: DocsSetPayloadOperations
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
  const sourceId = manifest.source?.id

  if (!sourceId) {
    return {
      response: errorResponse(
        'source_not_allowed',
        'Manifest source.id is required and must match a docs set slug.',
        400,
      ),
    }
  }

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

const getTotalManifestBytes = (manifest: ValidatedDocsManifest): number =>
  manifest.files.reduce((total, file) => total + Buffer.byteLength(file.content, 'utf8'), 0)

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
  manifest,
  plan,
  routeBase,
}: {
  manifest: ValidatedDocsManifest
  plan: ReturnType<typeof planDocsSync>
  routeBase: string
}): string[] => {
  const paths = new Set<string>()

  for (const file of manifest.files) {
    paths.add(file.route)
  }

  for (const change of [...plan.archive, ...plan.delete, ...plan.draft, ...plan.update]) {
    if (change.current?.route) {
      paths.add(change.current.route)
    }

    if (change.desired?.route) {
      paths.add(change.desired.route)
    }
  }

  if (manifest.aiExport) {
    paths.add(manifest.aiExport.output ?? `${routeBase}.md`)
  }

  return [...paths].filter((path) => path.startsWith('/'))
}

const revalidateDocsSyncCache = async ({
  manifest,
  options,
  plan,
  routeBase,
}: {
  manifest: ValidatedDocsManifest
  options: CreateSyncEndpointOptions
  plan: ReturnType<typeof planDocsSync>
  routeBase: string
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
    manifest,
    plan,
    routeBase,
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
  const desiredRoutes = manifest.files.map((file) => file.route)
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
  const pageRouteCollisions =
    options.routing?.pages?.enabled === true
      ? await findConfiguredPagesRouteCollisions({
          allowBridgePages: options.routing.pages.allowBridgePages,
          bridgeField: options.routing.pages.bridgeField,
          collectionSlug: options.routing.pages.collection,
          docsSetRouteBase: routeBase,
          payload,
          routeField: options.routing.pages.routeField,
        })
      : []

  return [
    ...duplicateDesiredRouteCollisions,
    ...existingDocsRouteCollisions,
    ...pageRouteCollisions,
  ]
}

type AuthenticatedSyncRequest = {
  actor?: string
  bodyHash: string
  branch?: string
  commit?: string
  expiresAt: Date
  keyId: string
  nonce: string
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
}: {
  now: Date
  options: CreateSyncEndpointOptions
  rawBody: string
  req: PayloadRequest
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

  if (!options.docsKeysEnabled) {
    return {
      response: errorResponse(
        'auth_disabled',
        'Signed sync authentication requires the docs Keys collection.',
        401,
      ),
    }
  }

  const keyConfig = await findDocsKeyById({
    collectionSlug: options.docsKeysCollectionSlug,
    keyId: headersResult.headers.keyId,
    payload: req.payload as unknown as DocsKeyPayloadOperations,
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

  const nonceAvailable = await assertNonceNotReplayed({
    collectionSlug: options.noncesCollectionSlug,
    keyId: headersResult.headers.keyId,
    nonce: headersResult.headers.nonce,
    now,
    payload: req.payload as unknown as NoncePayloadOperations,
  })

  if (!nonceAvailable) {
    return {
      response: errorResponse('nonce_replay', 'Sync request nonce has already been used.', 409),
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

  const nonceTtlSeconds = options.nonceTtlSeconds ?? DEFAULT_NONCE_TTL_SECONDS

  return {
    identity: {
      bodyHash: bodyHash.computedHash,
      expiresAt: new Date(now.getTime() + nonceTtlSeconds * 1000),
      keyId: headersResult.headers.keyId,
      nonce: headersResult.headers.nonce,
    },
  }
}

const authenticateGitHubOidcRequest = async ({
  docsSet,
  now,
  options,
  rawBody,
  req,
}: {
  docsSet: ResolvedDocsSet
  now: Date
  options: CreateSyncEndpointOptions
  rawBody: string
  req: PayloadRequest
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

  if (!options.docsTrustedEnabled) {
    return {
      response: errorResponse(
        'auth_disabled',
        'GitHub OIDC sync authentication requires the docs Trusted collection.',
        401,
      ),
    }
  }

  const trustedSources = await findTrustedGitHubSources({
    collectionSlug: options.docsTrustedCollectionSlug,
    payload: req.payload as unknown as DocsTrustedPayloadOperations,
  })
  const allowedRef = docsSet.branch.startsWith('refs/')
    ? docsSet.branch
    : `refs/heads/${docsSet.branch}`

  const verified = await verifyGitHubOidcToken({
    config: {
      allowedRefs: [allowedRef],
      allowedWorkflowRefs: docsSet.advancedSecurity?.allowedWorkflowRefs,
      allowPullRequests: docsSet.allowPullRequests,
      audience: docsSet.slug,
      enforceWorkflowRefs: docsSet.advancedSecurity?.enabled === true,
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

  const nonceAvailable = await assertNonceNotReplayed({
    collectionSlug: options.noncesCollectionSlug,
    keyId: verified.token.keyId,
    nonce: verified.token.claims.jti,
    now,
    payload: req.payload as unknown as NoncePayloadOperations,
  })

  if (!nonceAvailable) {
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
      expiresAt: verified.token.expiresAt,
      keyId: verified.token.keyId,
      nonce: verified.token.claims.jti,
      repository: verified.token.claims.repository,
    },
  }
}

const authenticateSyncRequest = async ({
  docsSet,
  now,
  options,
  rawBody,
  req,
}: {
  docsSet: ResolvedDocsSet
  now: Date
  options: CreateSyncEndpointOptions
  rawBody: string
  req: PayloadRequest
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
      docsSet,
      now,
      options,
      rawBody,
      req,
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
    })
  }

  return authenticateGitHubOidcRequest({
    docsSet,
    now,
    options,
    rawBody,
    req,
  })
}

const createSyncEndpointHandler =
  (options: CreateSyncEndpointOptions) =>
  async (req: PayloadRequest): Promise<Response> => {
    const startedAt = options.getNow?.() ?? new Date()

    if (req.method && req.method.toUpperCase() !== 'POST') {
      return errorResponse('invalid_method', 'Sync endpoint only accepts POST.', 405)
    }

    if (typeof req.text !== 'function') {
      return errorResponse(
        'invalid_body',
        'Sync endpoint requires access to the request body text.',
        400,
      )
    }

    const rawBody = await req.text()
    const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES

    if (Buffer.byteLength(rawBody, 'utf8') > maxBodyBytes) {
      return errorResponse('invalid_body', 'Sync request body is too large.', 413)
    }

    const manifest = parseManifestBody(rawBody)

    if (!manifest) {
      return errorResponse('invalid_body', 'Sync request body must be a JSON manifest.', 400)
    }

    const sourceResolution = await resolveSyncSource({
      manifest,
      options,
      payload: req.payload as unknown as DocsSetPayloadOperations,
    })

    if (sourceResolution.response) {
      return sourceResolution.response
    }

    const authentication = await authenticateSyncRequest({
      docsSet: sourceResolution.source.docsSet,
      now: startedAt,
      options,
      rawBody,
      req,
    })

    if (authentication.response) {
      return authentication.response
    }

    const validation = validateDocsManifest(manifest, {
      allowedSourceIds: [sourceResolution.source.sourceId],
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

    const routeCollisions = await getRouteCollisionIssues({
      docsSet: sourceResolution.source.docsSet,
      manifest: validation.data,
      options,
      payload: req.payload as unknown as RouteCollisionPayloadOperations,
      routeBase: sourceResolution.source.routeBase,
    })

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

    if (isSyncMode && options.requireDryRunBeforeApply === true) {
      return errorResponse(
        'dry_run_required_not_implemented',
        'Required dry-run proof before apply is not implemented yet.',
        400,
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
    const plan = planDocsSync({
      deleteBehavior: effectiveDeleteBehavior,
      desired: validation.data,
      existing: existingDocs,
    })
    const summary = summarizePlan(plan)
    const warnings = [...validation.warnings, ...plan.warnings]
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
    }

    await storeAcceptedNonce({
      bodyHash: authentication.identity.bodyHash,
      collectionSlug: options.noncesCollectionSlug,
      expiresAt: authentication.identity.expiresAt,
      keyId: authentication.identity.keyId,
      nonce: authentication.identity.nonce,
      payload: req.payload as unknown as NoncePayloadOperations,
      sourceId: validation.data.source.id,
      usedAt: startedAt,
    })

    let syncRunId: number | string | undefined

    if (options.syncRunsEnabled) {
      const syncRun = await createSyncRunAudit({
        actor: authentication.identity.actor,
        bodyHash: authentication.identity.bodyHash,
        branch: authentication.identity.branch ?? validation.data.source.branch,
        collectionSlug: options.syncRunsCollectionSlug,
        commit: authentication.identity.commit ?? validation.data.source.commit,
        completedAt: isSyncMode ? startedAt : (options.getNow?.() ?? new Date()),
        deleteBehavior: effectiveDeleteBehavior,
        errors: [],
        fileCount: validation.data.files.length,
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
          syncRunId,
        })

        if (!applyResult.ok) {
          return errorResponse(
            'manual_edit_conflict',
            'One or more docs were modified outside the docs sync workflow.',
            409,
            {
              conflicts: applyResult.conflicts,
            },
          )
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

        if (sourceResolution.source.docsSet) {
          await updateDocsSetAfterSync({
            aiExport: validation.data.aiExport,
            collectionSlug: options.docsSetsCollectionSlug,
            docsCount: validation.data.files.length,
            docsSetId: sourceResolution.source.docsSet.id,
            now: options.getNow?.() ?? new Date(),
            payload: req.payload as unknown as DocsSetPayloadOperations,
            publish: validation.data.publish,
            syncRunId,
          })
        }

        await revalidateDocsSyncCache({
          manifest: validation.data,
          options,
          plan,
          routeBase: sourceResolution.source.routeBase,
        })
      } catch (error) {
        await updateSyncRunAudit({
          collectionSlug: options.syncRunsCollectionSlug,
          completedAt: options.getNow?.() ?? new Date(),
          errors: [
            {
              code: 'invalid_manifest',
              message: error instanceof Error ? error.message : 'Sync apply failed.',
            },
          ],
          payload: req.payload as unknown as SyncRunsPayloadOperations,
          status: 'failed',
          summary,
          syncRunId,
          warnings,
        })

        return errorResponse('sync_apply_failed', 'Sync apply failed.', 500)
      }
    }

    return jsonResponse({
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

export const createSyncEndpoint = (options: CreateSyncEndpointOptions): Endpoint => ({
  handler: createSyncEndpointHandler(options),
  method: 'post',
  path: options.endpointPath,
})
