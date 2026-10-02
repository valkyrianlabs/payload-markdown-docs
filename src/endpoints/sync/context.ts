import type { PayloadRequest } from 'payload'

import type {
  ApplyDocsAssetsSyncPayloadOperations,
  ApplyDocsSyncPayloadOperations,
  DocsAccessPayloadOperations,
  DocsSetPayloadOperations,
  ExistingAssetsPayloadOperations,
  ExistingDocsPayloadOperations,
  ResolvedDocsSet,
  RouteCollisionPayloadOperations,
  SyncRunsPayloadOperations,
} from '../../payload/index.js'
import type { DocsRouteClaimsPayloadOperations } from '../../payload/routeClaims.js'
import type { TransactionalDatabase } from '../../payload/transaction.js'
import type { FetchJson, NoncePayloadOperations } from '../../security/index.js'
import type {
  DocsDeleteBehavior,
  DocsValidationIssue,
  ValidatedDocsManifest,
} from '../../sync/index.js'
import type {
  PayloadMarkdownDocsAuthConfig,
  PayloadMarkdownDocsSyncRevalidateConfig,
} from '../../types.js'
import type { SyncIdentity } from './authenticate.js'
import type { SyncPolicy } from './policy.js'

export type CreateSyncEndpointOptions = {
  allowHardDelete?: boolean
  allowPublish?: boolean
  allowWrites?: boolean
  /** Apply asset creates/updates in non-publish syncs (pre-DOCS-4 behavior). Default false. */
  applyAssetsOnDraftSync?: boolean
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

/** Every Payload operation the sync stages use, typed once for `req.payload`. */
export type SyncPayload = {
    db?: TransactionalDatabase
  } &
  ApplyDocsAssetsSyncPayloadOperations &
  ApplyDocsSyncPayloadOperations &
  DocsAccessPayloadOperations &
  DocsRouteClaimsPayloadOperations &
  DocsSetPayloadOperations &
  ExistingAssetsPayloadOperations &
  ExistingDocsPayloadOperations &
  NoncePayloadOperations &
  RouteCollisionPayloadOperations & SyncRunsPayloadOperations

/** What every stage knows about the request before it is authenticated. */
export type SyncRequestContext = {
  /** Effective manifest size limit (body bytes and total file bytes). */
  maxBodyBytes: number
  /** Clock for audit and lifecycle timestamps (`options.getNow` in tests). */
  now: () => Date
  options: CreateSyncEndpointOptions
  payload: SyncPayload
  req: PayloadRequest
  startedAt: Date
}

/** The docs set a sync targets (the manifest `source.id` is its slug). */
export type SyncSource = {
  assetRouteBase: string
  docsSet: ResolvedDocsSet
  routeBase: string
  sourceId: string
}

/** Everything known once the request is authenticated, scoped, and validated. */
export type SyncContext = {
  identity: SyncIdentity
  manifest: ValidatedDocsManifest
  /** Validator warnings carried into the response and audit. */
  manifestWarnings: DocsValidationIssue[]
  policy: SyncPolicy
  source: SyncSource
} & SyncRequestContext
