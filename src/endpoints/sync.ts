import type { Endpoint, PayloadRequest } from 'payload'

import type {
  ApplyDocsSyncPayloadOperations,
  DocsPublishMode,
  ExistingDocsPayloadOperations,
  ExistingPayloadDocsRecord,
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
  applyDocsSync,
  assertApplyDeleteBehaviorSupported,
  createSyncRunAudit,
  findDocsSyncConflicts,
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
  | 'publish_disabled'
  | 'publish_not_available'
  | 'replay_protection_unavailable'
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
  endpointPath: string
  getNow?: () => Date
  markdownFieldName: string
  maxBodyBytes?: number
  maxSkewSeconds?: number
  noncesCollectionSlug: string
  noncesEnabled: boolean
  nonceTtlSeconds?: number
  requireDryRunBeforeApply?: boolean
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
    const nonceTtlSeconds =
      options.auth.nonceTtlSeconds ??
      options.nonceTtlSeconds ??
      DEFAULT_NONCE_TTL_SECONDS
    const expiresAt = new Date(startedAt.getTime() + nonceTtlSeconds * 1000)

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
        completedAt: isSyncMode ? startedAt : options.getNow?.() ?? new Date(),
        deleteBehavior: effectiveDeleteBehavior,
        effectivePublishMode,
        errors: [],
        fileCount: validation.data.files.length,
        keyId: headersResult.headers.keyId,
        mode: isSyncMode ? 'sync' : 'dry-run',
        payload: req.payload as unknown as SyncRunsPayloadOperations,
        publishRequested: validation.data.publish,
        repository: validation.data.source.repository,
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
      syncRunId,
      warnings,
    })
  }

export const createSyncEndpoint = (options: CreateSyncEndpointOptions): Endpoint => ({
  handler: createSyncEndpointHandler(options),
  method: 'post',
  path: options.endpointPath,
})
