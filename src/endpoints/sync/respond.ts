/**
 * Response shaping for the sync endpoint: the error contract shared with `pmdocs`
 * (`error.code`, `error.message`, `error.issues`, plus `conflicts` / `routeCollisions`)
 * and the success body. Raw database or validation messages never reach the client
 * (DOCS-17): unexpected failures are logged and answered with a generic message.
 */
import type { PayloadRequest } from 'payload'

import type {
  DocsAssetsSyncPlan,
  DocsSyncPlan,
  PlannedAssetChange,
  PlannedDocChange,
} from '../../sync/index.js'

import {
  DOCS_ASSETS_STORAGE_UNAVAILABLE_MESSAGE,
  isDocsAssetsStorageUnavailableError,
} from '../assetsStorage.js'

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

/**
 * Structured detail on every non-2xx response (shared contract with `pmdocs`).
 * `severity: 'warning'` entries are informational and never the cause of the error.
 */
export type SyncErrorIssue = {
  code: string
  message: string
  path?: string
  severity: 'error' | 'warning'
}

export type SyncConflict = {
  reason: string
  route?: string
  sourcePath: string
}

export type SyncRouteCollision = {
  /** Manifest files producing the route (in-manifest duplicates). */
  paths?: string[]
  reason: string
  route: string
  sourcePath?: string
}

type SyncErrorResponse = {
  conflicts?: SyncConflict[]
  error: {
    code: DocsSyncEndpointErrorCode
    issues?: SyncErrorIssue[]
    message: string
  }
  ok: false
  routeCollisions?: SyncRouteCollision[]
}

export type SyncErrorExtras = {
  issues?: SyncErrorIssue[]
} & Omit<SyncErrorResponse, 'error' | 'ok'>

/** Validator/planner warnings plus endpoint warnings such as deferred asset changes. */
export type SyncWarning = {
  code: string
  message: string
  path?: string
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

export type SyncSummary = {
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
  deleteBehavior: string
  dryRun: boolean
  ok: true
  publishRequested: boolean
  summary: SyncSummary
  syncRunId?: string
  warnings: SyncWarning[]
}

export const describeCollisionReason = (reason: string): string => {
  switch (reason) {
    case 'descendant_route_collision':
      return 'overlaps a route reserved by another docs set, group, or page'
    case 'existing_asset_route_collision':
      return 'is already used by an asset of another docs set'
    case 'existing_doc_route_collision':
      return 'is already used by a doc of another docs set'
    case 'route_retained_by_published_doc':
      return 'is still served by a published doc this sync does not publish'
    default:
      return 'collides with an existing route reservation'
  }
}

const describeConflictReason = (reason: string): string => {
  switch (reason) {
    case 'current_content_hash_mismatch':
      return 'was edited outside the docs sync workflow'
    case 'current_fields_hash_mismatch':
      return 'has title, description, navTitle, or order edited outside the docs sync workflow'
    case 'missing_current_record':
      return 'has no current record to update'
    case 'unmanaged_record':
      return 'is not managed by payload-markdown-docs'
    default:
      return 'cannot be changed safely'
  }
}

const deriveErrorIssues = (extras: SyncErrorExtras): SyncErrorIssue[] | undefined => {
  const issues = [
    ...(extras.issues ?? []),
    ...(extras.issues
      ? []
      : (extras.routeCollisions ?? []).map((collision) => ({
          code: collision.reason,
          message: `Route ${collision.route} ${describeCollisionReason(collision.reason)}.`,
          path: collision.sourcePath,
          severity: 'error' as const,
        }))),
    ...(extras.issues
      ? []
      : (extras.conflicts ?? []).map((conflict) => ({
          code: conflict.reason,
          message: `${conflict.sourcePath}${conflict.route ? ` (${conflict.route})` : ''} ${describeConflictReason(conflict.reason)}.`,
          path: conflict.sourcePath,
          severity: 'error' as const,
        }))),
  ]

  return issues.length > 0 ? issues : undefined
}

const jsonResponse = (body: SyncErrorResponse | SyncSuccessResponse, status = 200): Response =>
  Response.json(body, {
    status,
  })

export const errorResponse = (
  code: DocsSyncEndpointErrorCode,
  message: string,
  status = 400,
  extras: SyncErrorExtras = {},
): Response => {
  const { issues: _issues, ...rest } = extras
  const issues = deriveErrorIssues(extras)

  return jsonResponse(
    {
      ...rest,
      error: {
        code,
        ...(issues ? { issues } : {}),
        message,
      },
      ok: false,
    },
    status,
  )
}

/**
 * A request the endpoint rejects with a known error code. Stages throw it; the handler
 * turns it into the error response. Anything else thrown is an unexpected failure.
 */
export class SyncRequestError extends Error {
  readonly code: DocsSyncEndpointErrorCode
  readonly extras: SyncErrorExtras
  readonly status: number

  constructor(
    code: DocsSyncEndpointErrorCode,
    message: string,
    status = 400,
    extras: SyncErrorExtras = {},
  ) {
    super(message)
    this.name = 'SyncRequestError'
    this.code = code
    this.extras = extras
    this.status = status
  }

  toResponse(): Response {
    return errorResponse(this.code, this.message, this.status, this.extras)
  }
}

/** Rejects the request with a known error (a function declaration so TS narrows after it). */
export function rejectSync(
  code: DocsSyncEndpointErrorCode,
  message: string,
  status = 400,
  extras: SyncErrorExtras = {},
): never {
  throw new SyncRequestError(code, message, status, extras)
}

export const assetsStorageUnavailableError = (): SyncRequestError =>
  new SyncRequestError('assets_storage_unavailable', DOCS_ASSETS_STORAGE_UNAVAILABLE_MESSAGE, 500)

/** Docs or assets changed outside the sync workflow while the sync was being applied. */
export class SyncApplyConflictError extends Error {
  readonly conflicts: SyncConflict[]

  constructor(conflicts: SyncConflict[]) {
    super('One or more docs were modified outside the docs sync workflow.')
    this.name = 'SyncApplyConflictError'
    this.conflicts = conflicts
  }
}

const isRouteUniqueViolation = (error: unknown): boolean => {
  if (!(error instanceof Error) || error.name !== 'ValidationError') {
    return false
  }

  const data = (error as { data?: { errors?: { path?: string }[] } }).data

  return (data?.errors ?? []).some((issue) => issue.path === 'route')
}

/** Maps an apply-time failure (already rolled back) to its client error. */
export const classifySyncApplyFailure = (error: unknown): SyncRequestError => {
  if (error instanceof SyncApplyConflictError) {
    return new SyncRequestError('manual_edit_conflict', error.message, 409, {
      conflicts: error.conflicts,
    })
  }

  if (isRouteUniqueViolation(error)) {
    return new SyncRequestError(
      'route_collision',
      'A docs route was claimed concurrently by another record. The sync was rolled back; retry it.',
      409,
    )
  }

  if (isDocsAssetsStorageUnavailableError(error)) {
    return assetsStorageUnavailableError()
  }

  return new SyncRequestError(
    'sync_apply_failed',
    'Sync apply failed. See the server log for details.',
    500,
  )
}

export const logSyncFailure = (req: PayloadRequest, error: unknown, message: string): void => {
  const logger = (req.payload as { logger?: { error?: (...args: unknown[]) => void } } | undefined)
    ?.logger

  if (typeof logger?.error === 'function') {
    logger.error({ err: error, msg: message })
  }
}

/**
 * Answers known rejections with their error response and every other failure with a
 * generic `sync_endpoint_failed` (the cause is logged, never echoed).
 */
export const withSyncErrorBoundary =
  (handler: (req: PayloadRequest) => Promise<Response>) =>
  async (req: PayloadRequest): Promise<Response> => {
    try {
      return await handler(req)
    } catch (error) {
      if (error instanceof SyncRequestError) {
        return error.toResponse()
      }

      // Never echo raw database/validation messages to the client (DOCS-17).
      logSyncFailure(req, error, 'Docs sync endpoint failed.')

      return errorResponse(
        'sync_endpoint_failed',
        'Sync endpoint failed. See the server log for details.',
        500,
      )
    }
  }

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

export const syncSuccessResponse = ({
  assetPlan,
  deleteBehavior,
  dryRun,
  plan,
  publishRequested,
  summary,
  syncRunId,
  warnings,
}: {
  assetPlan: DocsAssetsSyncPlan
  deleteBehavior: string
  dryRun: boolean
  plan: DocsSyncPlan
  publishRequested: boolean
  summary: SyncSummary
  syncRunId?: number | string
  warnings: SyncWarning[]
}): Response =>
  jsonResponse({
    assetChanges: {
      archive: assetPlan.archive.map(serializeAssetChange),
      create: assetPlan.create.map(serializeAssetChange),
      delete: assetPlan.delete.map(serializeAssetChange),
      unchanged: assetPlan.unchanged.map(serializeAssetChange),
      update: assetPlan.update.map(serializeAssetChange),
    },
    changes: {
      archive: plan.archive.map(serializeChange),
      create: plan.create.map(serializeChange),
      delete: plan.delete.map(serializeChange),
      draft: plan.draft.map(serializeChange),
      unchanged: plan.unchanged.map(serializeChange),
      update: plan.update.map(serializeChange),
    },
    deleteBehavior,
    dryRun,
    ok: true,
    publishRequested,
    summary,
    syncRunId: syncRunId === undefined ? undefined : String(syncRunId),
    warnings,
  })
