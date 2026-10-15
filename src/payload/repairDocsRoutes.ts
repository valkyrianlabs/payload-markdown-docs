/**
 * One-off repair for docs and asset routes that went stale before the docs set / docs
 * group hooks existed (or were written with `payloadMarkdownDocsSkipRouteRewrite`).
 */
import type { CollectionSlug, Payload, PayloadRequest } from 'payload'

import type {
  DocsRouteRewritePayload,
  DocsRouteRewriteResult,
  DocsSetRouteRewriteTarget,
} from './rewriteDocsSetRoutes.js'

import {
  DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
} from '../constants.js'
import { indexDocsGroupsById, resolveDocsSetRoutes } from '../routing/docsSetRoutes.js'
import { getRawRecordId, getString, isRecord } from '../shared/records.js'
import { getDocsRevalidationTags, revalidateNextCache } from './nextCache.js'
import { rewriteDocsSetRoutes } from './rewriteDocsSetRoutes.js'
import { runInSyncTransaction } from './transaction.js'

export type RepairDocsRoutesArgs = {
  /** Collection slugs, when they were changed with `collections.*.slug`. */
  collections?: {
    docs?: CollectionSlug
    docsAssets?: CollectionSlug
    docsGroups?: CollectionSlug
    docsSets?: CollectionSlug
  }
  /** Repair one docs set (by id) instead of all of them. */
  docsSetId?: number | string
  /** Report what would change without writing. */
  dryRun?: boolean
  payload: Payload
  /**
   * The caller's `req` (for example a migration's), so the repair joins its
   * transaction. Without it the repair runs in its own transaction when the adapter
   * supports one.
   */
  req?: Partial<PayloadRequest>
}

export type RepairDocsRoutesResult = DocsRouteRewriteResult

/**
 * Rewrites the stored `route` of every generated doc (main row and latest draft) and
 * docs asset whose docs set route changed since it was synced, so they match the
 * current docs set and group routes again. Stale routes are detected from the records
 * themselves (each doc's route against its `sourcePath`), so no previous state is
 * needed. Docs whose new route is already held by another doc are left in place and
 * reported under `collisions`; records that cannot be placed are reported under
 * `unresolved`. Safe to run more than once; afterwards the nav, docs and sitemap
 * cache tags and the affected paths are revalidated when running inside Next.
 *
 * ```ts
 * import { repairDocsRoutes } from 'payload-markdown-docs/migrations'
 *
 * const result = await repairDocsRoutes({ payload })
 * ```
 */
export async function repairDocsRoutes({
  collections = {},
  docsSetId,
  dryRun = false,
  payload,
  req,
}: RepairDocsRoutesArgs): Promise<RepairDocsRoutesResult> {
  const docsSetsCollection = collections.docsSets ?? DEFAULT_DOCS_SETS_COLLECTION_SLUG
  const docsGroupsCollection = collections.docsGroups ?? DEFAULT_DOCS_GROUPS_COLLECTION_SLUG
  const docsCollection = collections.docs ?? DEFAULT_DOCS_COLLECTION_SLUG
  const docsAssetsCollection = collections.docsAssets ?? DEFAULT_DOCS_ASSETS_COLLECTION_SLUG
  const has = (slug: string) => Boolean(payload.collections[slug])

  if (!has(docsSetsCollection) || !has(docsGroupsCollection)) {
    return { paths: [], sets: [] }
  }

  const work = async (transactionReq: unknown): Promise<RepairDocsRoutesResult> => {
    const operationReq = transactionReq as Partial<PayloadRequest>
    const [docsSets, groups] = await Promise.all([
      payload.find({
        collection: docsSetsCollection,
        depth: 0,
        draft: false,
        overrideAccess: true,
        pagination: false,
        req: operationReq,
        ...(docsSetId === undefined ? {} : { where: { id: { equals: docsSetId } } }),
      }),
      payload.find({
        collection: docsGroupsCollection,
        depth: 0,
        overrideAccess: true,
        pagination: false,
        req: operationReq,
      }),
    ])
    const groupsById = indexDocsGroupsById(groups.docs)
    const targets: DocsSetRouteRewriteTarget[] = docsSets.docs.flatMap((docsSet) => {
      const id = getRawRecordId(docsSet)
      const routes = resolveDocsSetRoutes({ doc: docsSet, groupsById })
      const slug = isRecord(docsSet) ? getString(docsSet.slug) : undefined

      return id !== undefined && routes
        ? [
            {
              docsSetId: id,
              routes: { productRoute: routes.productRoute, routeBase: routes.routeBase },
              sourceIds: slug ? [slug] : [],
            },
          ]
        : []
    })

    return rewriteDocsSetRoutes({
      collections: {
        docs: has(docsCollection) ? docsCollection : undefined,
        docsAssets: has(docsAssetsCollection) ? docsAssetsCollection : undefined,
      },
      dryRun,
      onCollision: 'skip',
      payload: payload as unknown as DocsRouteRewritePayload,
      req: transactionReq,
      targets,
    })
  }

  const result = req
    ? await work(req)
    : (
        await runInSyncTransaction({
          payload: payload as unknown as Parameters<typeof runInSyncTransaction>[0]['payload'],
          work,
        })
      ).result

  if (!dryRun && result.sets.some((set) => set.docs + set.assets + set.versions > 0)) {
    await revalidateNextCache({
      paths: result.paths,
      tags: getDocsRevalidationTags({}),
    })
  }

  return result
}
