/**
 * Validation: the target docs set, the manifest (shared protocol validator plus the
 * server's asset content-type policy), route collisions with other docs sets, assets
 * and pages, and route claims for the planned changes.
 */
import type { ExistingPayloadDocsRecord } from '../../payload/index.js'
import type { DocsRouteRelease } from '../../payload/routeClaims.js'
import type {
  DocsManifest,
  DocsSyncPlan,
  DocsValidationIssue,
  ValidatedDocsManifest,
} from '../../sync/index.js'
import type { SyncContext, SyncRequestContext, SyncSource } from './context.js'
import type { SyncErrorIssue } from './respond.js'

import { DEFAULT_DOCS_ASSETS_COLLECTION_SLUG } from '../../constants.js'
import {
  findConfiguredPagesRouteCollisions,
  findDocsSetBySlug,
  findExistingAssetRouteCollisions,
  findExistingDocsRouteCollisions,
} from '../../payload/index.js'
import { resolveDocsRouteClaims } from '../../payload/routeClaims.js'
import { findManifestRouteCollisions, validateDocsManifest } from '../../sync/index.js'
import {
  ALLOWED_ASSET_CONTENT_TYPES_DESCRIPTION,
  isAllowedAssetContentType,
} from '../assetContentTypes.js'
import { isDocsAssetsStorageUnavailableError } from '../assetsStorage.js'
import { assetsStorageUnavailableError, describeCollisionReason, rejectSync } from './respond.js'

/** The docs set whose slug is the manifest source id (drafts included). */
export const resolveSyncSource = async (
  { options, payload }: SyncRequestContext,
  sourceId: string,
): Promise<SyncSource> => {
  const docsSet = options.docsSetsEnabled
    ? await findDocsSetBySlug({
        slug: sourceId,
        collectionSlug: options.docsSetsCollectionSlug,
        docsGroupsCollectionSlug: options.docsGroupsCollectionSlug,
        includeDrafts: true,
        payload,
      })
    : undefined

  if (!docsSet) {
    return rejectSync(
      'source_not_allowed',
      `No docs set exists for source "${sourceId}". Create a docs set with slug "${sourceId}" in Payload Admin before syncing this source.`,
      400,
    )
  }

  return {
    assetRouteBase: docsSet.productRoute,
    docsSet,
    routeBase: docsSet.routeBase,
    sourceId,
  }
}

const toSyncErrorIssue = (
  issue: DocsValidationIssue,
  severity: SyncErrorIssue['severity'],
): SyncErrorIssue => ({
  code: issue.code,
  message: issue.message,
  ...(issue.path ? { path: issue.path } : {}),
  severity,
})

/**
 * Validates the manifest against the docs set's routes and limits, then applies the
 * server-side asset content-type policy (DOCS-4): assets are served from the site
 * origin, so only text formats are accepted.
 */
export const validateSyncManifest = ({
  context: { maxBodyBytes },
  manifest,
  source,
}: {
  context: SyncRequestContext
  manifest: DocsManifest
  source: SyncSource
}): { manifest: ValidatedDocsManifest; warnings: DocsValidationIssue[] } => {
  const validation = validateDocsManifest(manifest, {
    allowedSourceIds: [source.sourceId],
    assetRouteBase: source.assetRouteBase,
    maxTotalBytes: maxBodyBytes,
    routeBase: source.routeBase,
  })

  if (!validation.ok) {
    return rejectSync('invalid_manifest', 'Sync manifest is invalid.', 400, {
      issues: [
        ...validation.issues.map((issue) => toSyncErrorIssue(issue, 'error')),
        ...validation.warnings.map((issue) => toSyncErrorIssue(issue, 'warning')),
      ],
    })
  }

  const assetContentTypeIssues = validation.data.assets.flatMap((asset) =>
    isAllowedAssetContentType(asset.contentType)
      ? []
      : [
          {
            code: 'invalid_asset',
            message: `Asset content type "${asset.contentType}" is not allowed for ${asset.kind} assets. Allowed: ${ALLOWED_ASSET_CONTENT_TYPES_DESCRIPTION}.`,
            path: asset.path,
            severity: 'error' as const,
          },
        ],
  )

  if (assetContentTypeIssues.length > 0) {
    rejectSync('invalid_manifest', 'Sync manifest is invalid.', 400, {
      issues: assetContentTypeIssues,
    })
  }

  return {
    manifest: validation.data,
    warnings: validation.warnings,
  }
}

const getManifestRouteOwners = (manifest: ValidatedDocsManifest): Map<string, string[]> => {
  const owners = new Map<string, string[]>()

  for (const entry of [...manifest.files, ...manifest.assets]) {
    if (!entry.route) {
      continue
    }

    owners.set(entry.route, [...(owners.get(entry.route) ?? []), entry.path])
  }

  return owners
}

const findRouteCollisions = async ({ manifest, options, payload, source }: SyncContext) => {
  const { docsSet, routeBase } = source
  const desiredAssetRoutes = manifest.assets.flatMap((asset) => (asset.route ? [asset.route] : []))
  const desiredRoutes = [...manifest.files.map((file) => file.route), ...desiredAssetRoutes]
  // In-manifest duplicates come from the shared protocol helper so the server and
  // pmdocs name the same files (DOCS-17, CLI-6).
  const duplicateDesiredRouteCollisions = findManifestRouteCollisions(manifest)
    .filter((collision) => collision.reason === 'exact_route_collision')
    .map((collision) => ({
      paths: collision.paths,
      reason: collision.reason,
      route: collision.route,
    }))
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

/** Rejects routes produced twice by the manifest or reserved by other owners. */
export const assertNoRouteCollisions = async (context: SyncContext): Promise<void> => {
  const { manifest } = context
  let routeCollisions

  try {
    routeCollisions = await findRouteCollisions(context)
  } catch (error) {
    if (manifest.assets.length > 0 && isDocsAssetsStorageUnavailableError(error)) {
      throw assetsStorageUnavailableError()
    }

    throw error
  }

  if (routeCollisions.length === 0) {
    return
  }

  const routeOwners = getManifestRouteOwners(manifest)
  const onlyManifestDuplicates = routeCollisions.every(
    (collision) => 'paths' in collision && Array.isArray(collision.paths),
  )

  rejectSync(
    'route_collision',
    onlyManifestDuplicates
      ? 'Two or more manifest files resolve to the same route.'
      : 'One or more docs routes collide with an existing route reservation.',
    409,
    {
      issues: routeCollisions.map((collision) => {
        const paths =
          'paths' in collision && Array.isArray(collision.paths) ? collision.paths : undefined

        return {
          code: collision.reason,
          message: paths
            ? `Route ${collision.route} is produced by ${paths.join(', ')}.`
            : `Route ${collision.route} ${describeCollisionReason(collision.reason)}.`,
          path: paths?.[0] ?? routeOwners.get(collision.route.split(' <> ')[0] ?? '')?.[0],
          severity: 'error' as const,
        }
      }),
      routeCollisions,
    },
  )
}

/**
 * Route claims for the planned doc changes: routes this sync takes over must be
 * releasable from their current holders (same docs set: archived, draft-only, or
 * moving); otherwise the sync is rejected before anything is written.
 */
export const resolveSyncRouteClaims = async ({
  context: { options, payload, policy },
  existing,
  plan,
}: {
  context: SyncContext
  existing: ExistingPayloadDocsRecord[]
  plan: DocsSyncPlan
}): Promise<DocsRouteRelease[]> => {
  const routeClaims = options.docsEnabled
    ? await resolveDocsRouteClaims({
        collectionSlug: options.docsCollectionSlug,
        deleteBehavior: policy.deleteBehavior,
        existing,
        payload,
        plan,
        writesMainForUpdates: policy.writesMainForUpdates,
      })
    : { collisions: [], releases: [] }

  if (routeClaims.collisions.length > 0) {
    rejectSync(
      'route_collision',
      'One or more docs routes are still held by another doc that this sync cannot release.',
      409,
      {
        routeCollisions: routeClaims.collisions,
      },
    )
  }

  return routeClaims.releases
}
