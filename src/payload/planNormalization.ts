import type { DocsAssetsSyncPlan, DocsSyncPlan } from '../sync/index.js'

/**
 * Server-side plan normalization (DOCS-10).
 *
 * The shared planner proposes archiving every existing record that is missing from the
 * manifest, including records that are already archived. Re-archiving rewrites
 * `archivedAt` (losing the original archive date), adds a version per sync, and inflates
 * the reported `archive` count forever. Already-archived records are dropped from the
 * archive/draft removal lists here; hard delete still applies to them.
 */
export const withoutAlreadyArchivedRemovals = (plan: DocsSyncPlan): DocsSyncPlan => ({
  ...plan,
  archive: plan.archive.filter((change) => change.current?.archived !== true),
  draft: plan.draft.filter((change) => change.current?.archived !== true),
})

export const withoutAlreadyArchivedAssetRemovals = (
  plan: DocsAssetsSyncPlan,
): DocsAssetsSyncPlan => ({
  ...plan,
  archive: plan.archive.filter((change) => change.current?.archived !== true),
})
