import type { Endpoint, PayloadRequest } from 'payload'

import type {
  ExistingDocsPayloadOperations,
  SyncRunsPayloadOperations,
} from '../payload/index.js'
import type { NoncePayloadOperations } from '../security/index.js'
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
  createSyncRunAudit,
  findExistingDocsRecords,
  getRecordId,
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
} from '../security/index.js'
import {
  planDocsSync,
  validateDocsManifest,
} from '../sync/index.js'

export type DocsSyncEndpointErrorCode =
  | 'auth_disabled'
  | 'body_hash_mismatch'
  | 'invalid_body'
  | 'invalid_manifest'
  | 'invalid_method'
  | 'invalid_signature'
  | 'invalid_timestamp'
  | 'missing_header'
  | 'nonce_replay'
  | 'replay_protection_unavailable'
  | 'source_not_allowed'
  | 'sync_mode_not_implemented'
  | 'unknown_key'

export type CreateSyncEndpointOptions = {
  auth?: PayloadMarkdownDocsAuthConfig
  deleteBehavior?: DocsDeleteBehavior
  docsCollectionSlug: string
  docsEnabled: boolean
  endpointPath: string
  getNow?: () => Date
  maxBodyBytes?: number
  maxSkewSeconds?: number
  noncesCollectionSlug: string
  noncesEnabled: boolean
  nonceTtlSeconds?: number
  routeBase?: string
  sources?: {
    id: string
    root?: string
    routeBase: string
  }[]
  syncRunsCollectionSlug: string
  syncRunsEnabled: boolean
}

type SyncErrorResponse = {
  error: {
    code: DocsSyncEndpointErrorCode
    message: string
  }
  ok: false
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
  dryRun: true
  ok: true
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
): Response =>
  jsonResponse(
    {
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

const getEffectiveRouteBase = ({
  manifest,
  options,
}: {
  manifest: DocsManifest
  options: CreateSyncEndpointOptions
}): string => {
  const sourceConfig = findSourceConfig(manifest.source?.id, options.sources)

  return sourceConfig?.routeBase ?? options.routeBase ?? DEFAULT_DOCS_ROUTE_BASE
}

const assertSourceAllowed = ({
  manifest,
  options,
}: {
  manifest: DocsManifest
  options: CreateSyncEndpointOptions
}): Response | undefined => {
  const sourceId = manifest.source?.id

  if (!sourceId) {
    return undefined
  }

  const sourceConfig = findSourceConfig(sourceId, options.sources)

  if (options.sources && options.sources.length > 0 && !sourceConfig) {
    return errorResponse(
      'source_not_allowed',
      `Manifest source.id "${sourceId}" is not configured for this endpoint.`,
      400,
    )
  }

  if (
    sourceConfig?.root &&
    manifest.source.root &&
    sourceConfig.root !== manifest.source.root
  ) {
    return errorResponse(
      'source_not_allowed',
      `Manifest source.root "${manifest.source.root}" is not allowed for source "${sourceId}".`,
      400,
    )
  }

  return undefined
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

const createSyncEndpointHandler =
  (options: CreateSyncEndpointOptions) =>
  async (req: PayloadRequest): Promise<Response> => {
    const startedAt = options.getNow?.() ?? new Date()

    if (req.method && req.method.toUpperCase() !== 'POST') {
      return errorResponse('invalid_method', 'Sync endpoint only accepts POST.', 405)
    }

    if (!options.auth || options.auth.mode !== 'ed25519') {
      return errorResponse(
        'auth_disabled',
        'Signed sync authentication is not configured for this endpoint.',
        401,
      )
    }

    const headersResult = extractSyncRequestHeaders(req.headers)

    if (!headersResult.ok) {
      return errorResponse(
        'missing_header',
        `Missing required sync header: ${headersResult.header}.`,
        401,
      )
    }

    const keyConfig = options.auth.keys.find(
      (key) => key.id === headersResult.headers.keyId,
    )

    if (!keyConfig) {
      return errorResponse('unknown_key', 'Unknown sync request key id.', 401)
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

    const bodyHash = verifyBodySha256({
      body: rawBody,
      expectedHash: headersResult.headers.bodySha256,
    })

    if (!bodyHash.ok) {
      return errorResponse(
        'body_hash_mismatch',
        'Sync request body hash does not match the signed header.',
        401,
      )
    }

    const timestampValidation = validateTimestampSkew({
      maxSkewSeconds:
        options.auth.maxSkewSeconds ??
        options.maxSkewSeconds ??
        DEFAULT_MAX_SKEW_SECONDS,
      now: startedAt,
      timestamp: headersResult.headers.timestamp,
    })

    if (!timestampValidation.ok) {
      return errorResponse(
        'invalid_timestamp',
        timestampValidation.message,
        401,
      )
    }

    if (!options.noncesEnabled) {
      return errorResponse(
        'replay_protection_unavailable',
        'Sync endpoint requires nonce replay protection.',
        500,
      )
    }

    const nonceAvailable = await assertNonceNotReplayed({
      collectionSlug: options.noncesCollectionSlug,
      keyId: headersResult.headers.keyId,
      nonce: headersResult.headers.nonce,
      now: startedAt,
      payload: req.payload as unknown as NoncePayloadOperations,
    })

    if (!nonceAvailable) {
      return errorResponse('nonce_replay', 'Sync request nonce has already been used.', 409)
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
      return errorResponse('invalid_signature', 'Invalid sync request signature.', 401)
    }

    const manifest = parseManifestBody(rawBody)

    if (!manifest) {
      return errorResponse('invalid_body', 'Sync request body must be a JSON manifest.', 400)
    }

    if (manifest.mode === 'sync') {
      return errorResponse(
        'sync_mode_not_implemented',
        'Sync mode is not implemented yet. Phase 5 accepts dry-run only.',
        400,
      )
    }

    const sourceError = assertSourceAllowed({
      manifest,
      options,
    })

    if (sourceError) {
      return sourceError
    }

    const validation = validateDocsManifest(manifest, {
      allowedSourceIds: getAllowedSourceIds(options.sources),
      maxTotalBytes: maxBodyBytes,
      routeBase: getEffectiveRouteBase({
        manifest,
        options,
      }),
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
    const existingDocs = options.docsEnabled
      ? await findExistingDocsRecords({
          collectionSlug: options.docsCollectionSlug,
          payload: req.payload as unknown as ExistingDocsPayloadOperations,
          sourceId: validation.data.source.id,
        })
      : []
    const plan = planDocsSync({
      deleteBehavior: effectiveDeleteBehavior,
      desired: validation.data,
      existing: existingDocs,
    })
    const summary = summarizePlan(plan)
    const warnings = [...validation.warnings, ...plan.warnings]
    const nonceTtlSeconds =
      options.auth.nonceTtlSeconds ??
      options.nonceTtlSeconds ??
      DEFAULT_NONCE_TTL_SECONDS
    const expiresAt = new Date(startedAt.getTime() + nonceTtlSeconds * 1000)

    await storeAcceptedNonce({
      bodyHash: bodyHash.computedHash,
      collectionSlug: options.noncesCollectionSlug,
      expiresAt,
      keyId: headersResult.headers.keyId,
      nonce: headersResult.headers.nonce,
      payload: req.payload as unknown as NoncePayloadOperations,
      sourceId: validation.data.source.id,
      usedAt: startedAt,
    })

    let syncRunId: string | undefined

    if (options.syncRunsEnabled) {
      const syncRun = await createSyncRunAudit({
        bodyHash: bodyHash.computedHash,
        branch: validation.data.source.branch,
        collectionSlug: options.syncRunsCollectionSlug,
        commit: validation.data.source.commit,
        completedAt: options.getNow?.() ?? new Date(),
        deleteBehavior: effectiveDeleteBehavior,
        effectivePublishMode: 'draft',
        errors: [],
        fileCount: validation.data.files.length,
        keyId: headersResult.headers.keyId,
        mode: 'dry-run',
        payload: req.payload as unknown as SyncRunsPayloadOperations,
        publishRequested: validation.data.publish,
        repository: validation.data.source.repository,
        sourceId: validation.data.source.id,
        startedAt,
        status: 'success',
        summary,
        totalBytes: getTotalManifestBytes(validation.data),
        warnings,
      })

      syncRunId = getRecordId(syncRun)
    }

    return jsonResponse({
      changes: serializeChanges(plan),
      dryRun: true,
      ok: true,
      summary,
      syncRunId,
      warnings,
    })
  }

export const createSyncEndpoint = (options: CreateSyncEndpointOptions): Endpoint => ({
  handler: createSyncEndpointHandler(options),
  method: 'post',
  path: options.endpointPath,
})
