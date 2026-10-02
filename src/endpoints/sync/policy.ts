/**
 * Sync policy: every server-configuration decision about what a request may do and
 * how it is applied (publish vs draft writes, delete behavior, asset deferral, audit)
 * is made here once, instead of being threaded through the stages as booleans.
 */
import type { PayloadRequest } from 'payload'

import type { ResolvedDocsSet } from '../../payload/index.js'
import type { DocsDeleteBehavior, ValidatedDocsManifest } from '../../sync/index.js'
import type { SyncIdentity } from './authenticate.js'
import type { CreateSyncEndpointOptions } from './context.js'

import { assertApplyDeleteBehaviorSupported, isDocsSetInScope } from '../../payload/index.js'
import { checkGitHubOidcPolicy } from '../../security/index.js'
import { rejectSync } from './respond.js'

export type SyncPolicy = {
  /** `sync` writes and records the run; `dry-run` only plans (and audits by default). */
  apply: boolean
  /** Asset creates/updates wait for the next publish sync (assets have no drafts, DOCS-4). */
  deferAssetWrites: boolean
  /** Server-configured delete behavior for docs and assets missing from the manifest. */
  deleteBehavior: DocsDeleteBehavior
  /** The docs collection keeps drafts (versions). */
  draftsEnabled: boolean
  /** The request asks to publish (`manifest.publish`). */
  publish: boolean
  /** A sync-run audit record is written for this request. */
  recordAudit: boolean
  /** Updates write the live (main) record: publish syncs, or installs without drafts. */
  writesMainForUpdates: boolean
}

export const createSyncPolicy = ({
  manifest,
  options,
}: {
  manifest: ValidatedDocsManifest
  options: CreateSyncEndpointOptions
}): SyncPolicy => {
  const apply = manifest.mode === 'sync'

  return {
    apply,
    // In a draft-enabled install a non-publish sync must not change what is served, so
    // asset creates/updates wait for the next --publish sync; removals still apply,
    // like doc removals (DOCS-4).
    deferAssetWrites:
      options.docsEnableDrafts && !manifest.publish && options.applyAssetsOnDraftSync !== true,
    deleteBehavior: options.deleteBehavior ?? 'archive',
    draftsEnabled: options.docsEnableDrafts,
    publish: manifest.publish,
    recordAudit: options.syncRunsEnabled && (apply || options.auditDryRuns !== false),
    writesMainForUpdates: manifest.publish || !options.docsEnableDrafts,
  }
}

const warnedUnscopedKeys = new Set<string>()

/**
 * Credential scope (DOCS-5): Access records may be limited to docs sets, and docs sets
 * may bind GitHub OIDC to repositories, tag-ref acceptance, workflow refs, and pull
 * requests. Unscoped Ed25519 keys keep working but log a one-time warning.
 */
export const assertCredentialScope = ({
  docsSet,
  identity,
  req,
}: {
  docsSet: ResolvedDocsSet
  identity: SyncIdentity
  req: PayloadRequest
}): void => {
  if (identity.oidcClaims) {
    const sources = identity.oidcTrustedSources ?? []

    if (
      sources.length > 0 &&
      !sources.some((source) => isDocsSetInScope(source.docsSetIds, docsSet.id))
    ) {
      rejectSync(
        'oidc_repository_not_allowed',
        `GitHub OIDC repository "${identity.oidcClaims.repository}" is not allowed to sync docs set "${docsSet.slug}".`,
        403,
      )
    }

    const policy = checkGitHubOidcPolicy({
      claims: identity.oidcClaims,
      config: {
        allowedRefs: [
          docsSet.branch.startsWith('refs/') ? docsSet.branch : `refs/heads/${docsSet.branch}`,
        ],
        allowedRepositories: docsSet.repositories,
        allowedWorkflowRefs: docsSet.advancedSecurity?.allowedWorkflowRefs,
        allowPullRequests: docsSet.allowPullRequests,
        allowTagRefs: docsSet.allowTagRefs,
        enforceWorkflowRefs: docsSet.advancedSecurity?.enabled === true,
      },
    })

    if (!policy.ok) {
      rejectSync(policy.code, policy.message, 401)
    }

    return
  }

  const docsSetIds = identity.ed25519DocsSetIds ?? []

  if (docsSetIds.length === 0) {
    if (!warnedUnscopedKeys.has(identity.keyId)) {
      warnedUnscopedKeys.add(identity.keyId)
      const logger = (req.payload as { logger?: { warn?: (...args: unknown[]) => void } })
        ?.logger
      logger?.warn?.(
        `payloadMarkdownDocs: Ed25519 key "${identity.keyId}" is not limited to any docs set and can sync every docs set. Set "Allowed docs sets" on its Access record.`,
      )
    }

    return
  }

  if (!isDocsSetInScope(docsSetIds, docsSet.id)) {
    rejectSync(
      'source_not_allowed',
      `Sync key "${identity.keyId}" is not allowed to sync docs set "${docsSet.slug}".`,
      403,
    )
  }
}

/** Publish and delete-behavior lifecycle rules, checked before route collisions. */
export const assertLifecyclePolicy = ({
  options,
  policy,
}: {
  options: CreateSyncEndpointOptions
  policy: SyncPolicy
}): void => {
  if (policy.publish && options.allowPublish !== true) {
    rejectSync('publish_disabled', 'Publishing is disabled by server configuration.', 403)
  }

  if (policy.publish && !policy.draftsEnabled) {
    rejectSync(
      'publish_not_available',
      'Publishing requires a draft-enabled dedicated docs collection.',
      400,
    )
  }

  if (policy.deleteBehavior === 'draft' && !policy.draftsEnabled) {
    rejectSync(
      'draft_behavior_not_available',
      'Draft delete behavior requires a draft-enabled dedicated docs collection.',
      400,
    )
  }

  if (policy.deleteBehavior === 'delete' && options.allowHardDelete !== true) {
    rejectSync('hard_delete_disabled', 'Hard delete is disabled by server configuration.', 403)
  }
}

/** Gates for applied (non-dry-run) syncs: writes enabled, delete behavior, audit. */
export const assertApplyPolicy = ({
  options,
  policy,
}: {
  options: CreateSyncEndpointOptions
  policy: SyncPolicy
}): void => {
  if (!policy.apply) {
    return
  }

  if (options.allowWrites !== true) {
    rejectSync('sync_writes_disabled', 'Sync writes are disabled by server configuration.', 403)
  }

  if (
    !assertApplyDeleteBehaviorSupported(policy.deleteBehavior, {
      allowHardDelete: options.allowHardDelete,
      docsEnableDrafts: policy.draftsEnabled,
    })
  ) {
    rejectSync(
      'delete_behavior_not_implemented',
      'Configured delete behavior cannot be applied.',
      400,
    )
  }

  if (!options.syncRunsEnabled) {
    rejectSync('audit_unavailable', 'Applied sync requires the sync-run audit collection.', 500)
  }
}
