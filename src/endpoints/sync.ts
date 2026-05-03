import type { Endpoint, PayloadRequest } from 'payload'

import type {
  ApplyDocsSyncPayloadOperations,
  DocsPublishMode,
  DocsSetPayloadOperations,
  ExistingDocsPayloadOperations,
  ExistingPayloadDocsRecord,
  ResolvedDocsSet,
  RouteCollisionPayloadOperations,
  SyncRunsPayloadOperations,
} from '../payload/index.js'
import type {
  FetchJson,
  NoncePayloadOperations,
} from '../security/index.js'
import type {
  DocsDeleteBehavior,
  DocsManifest,
  DocsValidationIssue,
  PlannedDocChange,
  ValidatedDocsManifest,
} from '../sync/index.js'
import type { PayloadMarkdownDocsAuthConfig } from '../types.js'

import {
  DEFAULT_DOCS_ROUTE_BASE,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_SKEW_SECONDS,
  DEFAULT_NONCE_TTL_SECONDS,
} from '../constants.js'
import {
  applyDocsSync,
  assertApplyDeleteBehaviorSupported,
  createSyncRunAudit,
  findConfiguredPagesRouteCollisions,
  findDocsSetBySourceId,
  findDocsSyncConflicts,
  findDuplicateDesiredRouteCollisions,
  findExistingDocsRouteCollisions,
  findExistingPayloadDocsRecords,
  getRecordId,
  toExistingDocsRecord,
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
import {
  planDocsSync,
  validateDocsManifest,
} from '../sync/index.js'

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
  | 'oidc_environment_not_allowed'
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
  defaultPublishMode?: DocsPublishMode
  deleteBehavior?: DocsDeleteBehavior
  docsCollectionSlug: string
  docsEnabled: boolean
  docsEnableDrafts: boolean
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
  requireDryRunBeforeApply?: boolean
  routeBase?: string
  routing?: {
    pages?: {
      allowBridgePages: boolean
      bridgeField: string
      collection: string
      enabled: boolean
      routeField: string
    }
  }
  sources?: {
    id: string
    root?: string
    routeBase: string
  }[]
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
  effectivePublishMode: DocsPublishMode
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

const jsonResponse = (
  body: SyncErrorResponse | SyncSuccessResponse,
  status = 200,
): Response =>
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

const findSourceConfig = (
  sourceId: string,
  sources: CreateSyncEndpointOptions['sources'],
) => sources?.find((source) => source.id === sourceId)

const getAllowedSourceIds = (
  sources: CreateSyncEndpointOptions['sources'],
): string[] | undefined => {
  if (!sources || sources.length === 0) {
    return undefined
  }

  return sources.map((source) => source.id)
}

type ResolvedSyncSource = {
  allowedSourceIds?: string[]
  docsSet?: ResolvedDocsSet
  routeBase: string
  sourceRoot?: string
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
      source: {
        allowedSourceIds: getAllowedSourceIds(options.sources),
        routeBase: options.routeBase ?? DEFAULT_DOCS_ROUTE_BASE,
      },
    }
  }

  const docsSet =
    options.docsSetsEnabled
      ? await findDocsSetBySourceId({
          collectionSlug: options.docsSetsCollectionSlug,
          payload,
          sourceId,
        })
      : undefined

  if (docsSet) {
    if (
      docsSet.sourceRoot &&
      manifest.source.root &&
      docsSet.sourceRoot !== manifest.source.root
    ) {
      return {
        response: errorResponse(
          'source_not_allowed',
          `Manifest source.root "${manifest.source.root}" is not allowed for docs set source "${sourceId}".`,
          400,
        ),
      }
    }

    return {
      source: {
        allowedSourceIds: [sourceId],
        docsSet,
        routeBase: docsSet.routeBase,
        sourceRoot: docsSet.sourceRoot,
      },
    }
  }

  const sourceConfig = findSourceConfig(sourceId, options.sources)

  if (options.sources && options.sources.length > 0 && !sourceConfig) {
    return {
      response: errorResponse(
        'source_not_allowed',
        `Manifest source.id "${sourceId}" is not configured for this endpoint.`,
        400,
      ),
    }
  }

  if (
    sourceConfig?.root &&
    manifest.source.root &&
    sourceConfig.root !== manifest.source.root
  ) {
    return {
      response: errorResponse(
        'source_not_allowed',
        `Manifest source.root "${manifest.source.root}" is not allowed for source "${sourceId}".`,
        400,
      ),
    }
  }

  return {
    source: {
      allowedSourceIds: getAllowedSourceIds(options.sources),
      routeBase: sourceConfig?.routeBase ?? options.routeBase ?? DEFAULT_DOCS_ROUTE_BASE,
      sourceRoot: sourceConfig?.root,
    },
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
  manifest.files.reduce(
    (total, file) => total + Buffer.byteLength(file.content, 'utf8'),
    0,
  )

const getPlannedConflictChanges = ({
  existing,
  plan,
}: {
  existing: ExistingPayloadDocsRecord[]
  plan: ReturnType<typeof planDocsSync>
}): PlannedDocChange[] => {
  const existingBySourcePath = new Map(
    existing.map((record) => [record.sourcePath, record]),
  )
  const archivedUnchanged = plan.unchanged.filter((change) => {
    const current = existingBySourcePath.get(change.sourcePath)

    return current?.archived === true
  })

  return [
    ...plan.update,
    ...plan.archive,
    ...plan.draft,
    ...plan.delete,
    ...archivedUnchanged,
  ]
}

const getDefaultPublishMode = (
  options: CreateSyncEndpointOptions,
): DocsPublishMode =>
  options.defaultPublishMode ?? (options.docsEnableDrafts ? 'draft' : 'preserve')

const getLifecyclePolicyError = ({
  deleteBehavior,
  manifest,
  options,
  publishMode,
}: {
  deleteBehavior: DocsDeleteBehavior
  manifest: ValidatedDocsManifest
  options: CreateSyncEndpointOptions
  publishMode: DocsPublishMode
}): Response | undefined => {
  if (manifest.publish && options.allowPublish !== true) {
    return errorResponse(
      'publish_disabled',
      'Publishing is disabled by server configuration.',
      403,
    )
  }

  if (
    (manifest.publish || publishMode === 'published') &&
    !options.docsEnableDrafts
  ) {
    return errorResponse(
      'publish_not_available',
      'Publishing requires a draft-enabled dedicated docs collection.',
      400,
    )
  }

  if (publishMode === 'published' && options.allowPublish !== true) {
    return errorResponse(
      'publish_disabled',
      'Publishing is disabled by server configuration.',
      403,
    )
  }

  if (publishMode === 'draft' && !options.docsEnableDrafts) {
    return errorResponse(
      'draft_behavior_not_available',
      'Draft mode requires a draft-enabled dedicated docs collection.',
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
  const duplicateDesiredRouteCollisions =
    findDuplicateDesiredRouteCollisions(desiredRoutes)
  const existingDocsRouteCollisions = options.docsEnabled
    ? await findExistingDocsRouteCollisions({
        collectionSlug: options.docsCollectionSlug,
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

const getRequiredHeader = (
  headers: Headers,
  name: string,
): string | undefined => {
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
  if (!options.auth || options.auth.mode !== 'ed25519') {
    return {
      response: errorResponse(
        'auth_disabled',
        'Signed sync authentication is not configured for this endpoint.',
        401,
      ),
    }
  }

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

  const keyConfig = options.auth.keys.find(
    (key) => key.id === headersResult.headers.keyId,
  )

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
    maxSkewSeconds:
      options.auth.maxSkewSeconds ??
      options.maxSkewSeconds ??
      DEFAULT_MAX_SKEW_SECONDS,
    now,
    timestamp: headersResult.headers.timestamp,
  })

  if (!timestampValidation.ok) {
    return {
      response: errorResponse(
        'invalid_timestamp',
        timestampValidation.message,
        401,
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
    keyId: headersResult.headers.keyId,
    nonce: headersResult.headers.nonce,
    now,
    payload: req.payload as unknown as NoncePayloadOperations,
  })

  if (!nonceAvailable) {
    return {
      response: errorResponse(
        'nonce_replay',
        'Sync request nonce has already been used.',
        409,
      ),
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
      response: errorResponse(
        'invalid_signature',
        'Invalid sync request signature.',
        401,
      ),
    }
  }

  const nonceTtlSeconds =
    options.auth.nonceTtlSeconds ??
    options.nonceTtlSeconds ??
    DEFAULT_NONCE_TTL_SECONDS

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
  if (!options.auth || options.auth.mode !== 'github-oidc') {
    return {
      response: errorResponse(
        'auth_disabled',
        'GitHub OIDC sync authentication is not configured for this endpoint.',
        401,
      ),
    }
  }

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

  const expectedHash = getRequiredHeader(
    req.headers,
    'x-vl-md-docs-body-sha256',
  )

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

  const verified = await verifyGitHubOidcToken({
    config: options.auth,
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
      response: errorResponse(
        'oidc_replay',
        'GitHub OIDC token jti has already been used.',
        409,
      ),
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
  if (!options.auth || options.auth.mode === 'disabled') {
    return {
      response: errorResponse(
        'auth_disabled',
        'Sync authentication is not configured for this endpoint.',
        401,
      ),
    }
  }

  if (options.auth.mode === 'github-oidc') {
    return authenticateGitHubOidcRequest({
      now,
      options,
      rawBody,
      req,
    })
  }

  return authenticateEd25519Request({
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

    const authentication = await authenticateSyncRequest({
      now: startedAt,
      options,
      rawBody,
      req,
    })

    if (authentication.response) {
      return authentication.response
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

    const validation = validateDocsManifest(manifest, {
      allowedSourceIds: sourceResolution.source.allowedSourceIds,
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
    const effectivePublishMode: DocsPublishMode = validation.data.publish
      ? 'published'
      : getDefaultPublishMode(options)
    const lifecyclePolicyError = getLifecyclePolicyError({
      deleteBehavior: effectiveDeleteBehavior,
      manifest: validation.data,
      options,
      publishMode: effectivePublishMode,
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
        completedAt: isSyncMode ? startedAt : options.getNow?.() ?? new Date(),
        deleteBehavior: effectiveDeleteBehavior,
        effectivePublishMode,
        errors: [],
        fileCount: validation.data.files.length,
        keyId: authentication.identity.keyId,
        mode: isSyncMode ? 'sync' : 'dry-run',
        payload: req.payload as unknown as SyncRunsPayloadOperations,
        publishRequested: validation.data.publish,
        repository:
          authentication.identity.repository ?? validation.data.source.repository,
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
          publishMode: effectivePublishMode,
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
      effectivePublishMode,
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
