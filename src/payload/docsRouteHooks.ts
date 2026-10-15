/**
 * Collection hooks that keep generated docs routes and the Next.js cache in step with
 * docs sets and docs groups.
 *
 * Docs and assets store full routes derived from their docs set route (group chain +
 * set slug + routeMode). Changing a set's group, slug or routeMode, or a group's slug or
 * parent (or deleting a group), changes that route; these hooks rewrite the stored
 * routes in the same transaction (see ./rewriteDocsSetRoutes.ts) and then expire the
 * nav tag, the docs/sitemap tags and the affected paths.
 *
 * Context flags (`req.context`):
 * - `disableRevalidate: true` skips cache revalidation.
 * - `payloadMarkdownDocsSkipRouteRewrite: true` skips the route rewrite.
 */
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  PayloadRequest,
} from 'payload'

import type { DocsGroupsById, DocsSetRoutes } from '../routing/docsSetRoutes.js'
import type { PayloadMarkdownDocsSyncRevalidateConfig } from '../types.js'
import type {
  DocsRouteRewritePayload,
  DocsRouteRewriteResult,
  DocsSetRoutePair,
  DocsSetRouteRewriteTarget,
} from './rewriteDocsSetRoutes.js'

import { getDocsGroupRoutePath, indexDocsGroupsById, resolveDocsSetRoutes } from '../routing/docsSetRoutes.js'
import { getRecordId, getString, isRecord } from '../shared/records.js'
import {
  getDocsRevalidationTags,
  revalidateNextCache,
  shouldRevalidateDocsPaths,
} from './nextCache.js'
import { rewriteDocsSetRoutes } from './rewriteDocsSetRoutes.js'

export const SKIP_ROUTE_REWRITE_CONTEXT_KEY = 'payloadMarkdownDocsSkipRouteRewrite'

const PREVIOUS_MAIN_SET_CONTEXT_KEY = 'payloadMarkdownDocs:previousMainDocsSet'
const GROUP_DELETE_CONTEXT_KEY = 'payloadMarkdownDocs:groupDeleteRoutes'

export type DocsRouteHooksOptions = {
  docsAssetsCollectionSlug?: string
  docsCollectionSlug?: string
  docsGroupsCollectionSlug: string
  docsSetsCollectionSlug: string
  revalidate?: false | PayloadMarkdownDocsSyncRevalidateConfig
}

type HookPayload = {
  db: {
    findOne?: (args: { collection: string; req?: unknown; where: unknown }) => Promise<unknown>
  } & DocsRouteRewritePayload['db']
} & DocsRouteRewritePayload

const hookPayload = (req: PayloadRequest): HookPayload => req.payload as unknown as HookPayload

const contextOf = (req: PayloadRequest): Record<string, unknown> => {
  if (!isRecord(req.context)) {
    req.context = {}
  }

  return req.context
}

const skipsRouteRewrite = (req: PayloadRequest): boolean =>
  contextOf(req)[SKIP_ROUTE_REWRITE_CONTEXT_KEY] === true

const skipsRevalidation = (req: PayloadRequest): boolean => contextOf(req).disableRevalidate === true

const findGroupsById = async (
  req: PayloadRequest,
  options: DocsRouteHooksOptions,
): Promise<Map<string, Record<string, unknown>>> =>
  indexDocsGroupsById(
    (
      await hookPayload(req).find({
        collection: options.docsGroupsCollectionSlug,
        depth: 0,
        overrideAccess: true,
        pagination: false,
        req,
      })
    ).docs,
  )

/** Main rows of every docs set: the published (or never-published) state. */
const findMainDocsSets = async (
  req: PayloadRequest,
  options: DocsRouteHooksOptions,
): Promise<Record<string, unknown>[]> =>
  (
    await hookPayload(req).find({
      collection: options.docsSetsCollectionSlug,
      depth: 0,
      draft: false,
      overrideAccess: true,
      pagination: false,
      req,
    })
  ).docs.filter(isRecord)

const findMainDocsSet = async (
  req: PayloadRequest,
  options: DocsRouteHooksOptions,
  id: number | string,
): Promise<Record<string, unknown> | undefined> => {
  const { db } = hookPayload(req)

  if (typeof db.findOne !== 'function') {
    return undefined
  }

  // Called on `db` so adapter methods keep their `this`.
  const doc = await db.findOne({
    collection: options.docsSetsCollectionSlug,
    req,
    where: { id: { equals: id } },
  })

  return isRecord(doc) ? doc : undefined
}

const toRoutePair = (routes: DocsSetRoutes | undefined): DocsSetRoutePair | undefined =>
  routes ? { productRoute: routes.productRoute, routeBase: routes.routeBase } : undefined

const routesDiffer = (first: DocsSetRoutePair, second: DocsSetRoutePair): boolean =>
  first.routeBase !== second.routeBase || first.productRoute !== second.productRoute

const runRewrite = async ({
  options,
  req,
  targets,
}: {
  options: DocsRouteHooksOptions
  req: PayloadRequest
  targets: DocsSetRouteRewriteTarget[]
}): Promise<DocsRouteRewriteResult | undefined> => {
  if (targets.length === 0 || skipsRouteRewrite(req)) {
    return undefined
  }

  return rewriteDocsSetRoutes({
    collections: {
      docs: options.docsCollectionSlug,
      docsAssets: options.docsAssetsCollectionSlug,
    },
    onCollision: 'throw',
    payload: hookPayload(req),
    req,
    targets,
  })
}

const revalidate = async ({
  options,
  paths,
  req,
  sourceIds,
}: {
  options: DocsRouteHooksOptions
  paths: Iterable<string | undefined>
  req: PayloadRequest
  sourceIds: Iterable<string | undefined>
}): Promise<void> => {
  if (skipsRevalidation(req)) {
    return
  }

  await revalidateNextCache({
    paths: shouldRevalidateDocsPaths(options.revalidate)
      ? [...paths].filter((path): path is string => typeof path === 'string')
      : [],
    tags: getDocsRevalidationTags({
      revalidate: options.revalidate,
      sourceIds: [...new Set([...sourceIds].filter((id): id is string => Boolean(id)))],
    }),
  })
}

export const createDocsSetsRouteHooks = (
  options: DocsRouteHooksOptions,
): {
  afterChange: CollectionAfterChangeHook
  afterDelete: CollectionAfterDeleteHook
  beforeChange: CollectionBeforeChangeHook
} => ({
  afterChange: async ({ doc, operation, previousDoc, req }) => {
    const id = getRecordId(doc)

    if (id === undefined) {
      return doc
    }

    const context = contextOf(req)
    const previousMain = context[`${PREVIOUS_MAIN_SET_CONTEXT_KEY}:${id}`]

    delete context[`${PREVIOUS_MAIN_SET_CONTEXT_KEY}:${id}`]

    // A draft saved over a published set changes nothing public (routes, nav): the
    // published main row is untouched until the draft is published.
    if (isRecord(doc) && doc._status === 'draft') {
      const main = await findMainDocsSet(req, options, id)

      if (main?._status === 'published') {
        return doc
      }
    }

    const groupsById = await findGroupsById(req, options)
    const routes = toRoutePair(resolveDocsSetRoutes({ doc, groupsById }))
    const previousRoutes = [previousMain, previousDoc].flatMap((previous) => {
      const pair = toRoutePair(resolveDocsSetRoutes({ doc: previous, groupsById }))

      return pair ? [pair] : []
    })
    const slugs = [doc, previousDoc, previousMain].map((record) =>
      isRecord(record) ? getString(record.slug) : undefined,
    )
    // Every public save also repairs routes that were already stale (inference).
    const result =
      operation === 'update' && routes && options.docsCollectionSlug
        ? await runRewrite({
            options,
            req,
            targets: [
              {
                docsSetId: id,
                hints: previousRoutes.filter((pair) => routesDiffer(pair, routes)),
                routes,
                sourceIds: slugs.filter((slug): slug is string => Boolean(slug)),
              },
            ],
          })
        : undefined

    await revalidate({
      options,
      paths: [
        routes?.routeBase,
        routes?.productRoute,
        ...previousRoutes.flatMap((pair) => [pair.routeBase, pair.productRoute]),
        ...(result?.paths ?? []),
      ],
      req,
      sourceIds: slugs,
    })

    return doc
  },
  afterDelete: async ({ doc, req }) => {
    const groupsById = await findGroupsById(req, options)
    const routes = toRoutePair(resolveDocsSetRoutes({ doc, groupsById }))

    await revalidate({
      options,
      paths: [routes?.routeBase, routes?.productRoute],
      req,
      sourceIds: [isRecord(doc) ? getString(doc.slug) : undefined],
    })

    return doc
  },
  // Remember the published main row: with drafts, `previousDoc` in afterChange is the
  // latest draft, which may already carry the new group/slug when a draft is published.
  beforeChange: async ({ data, operation, originalDoc, req }) => {
    const id = getRecordId(originalDoc)

    if (operation === 'update' && id !== undefined && !skipsRouteRewrite(req)) {
      const main = await findMainDocsSet(req, options, id)

      if (main) {
        contextOf(req)[`${PREVIOUS_MAIN_SET_CONTEXT_KEY}:${id}`] = main
      }
    }

    return data
  },
})

type DocsSetRouteChange = {
  id: string
  next: DocsSetRoutePair
  previous: DocsSetRoutePair
  slug: string
}

/** Docs sets whose routes differ between two group maps (same set records). */
const diffDocsSetRoutes = ({
  docsSets,
  nextGroups,
  previousGroups,
}: {
  docsSets: Record<string, unknown>[]
  nextGroups: DocsGroupsById
  previousGroups: DocsGroupsById
}): DocsSetRouteChange[] =>
  docsSets.flatMap((docsSet) => {
    const id = getRecordId(docsSet)
    const previous = toRoutePair(resolveDocsSetRoutes({ doc: docsSet, groupsById: previousGroups }))
    const next = toRoutePair(resolveDocsSetRoutes({ doc: docsSet, groupsById: nextGroups }))
    const slug = getString(docsSet.slug)

    return id !== undefined && previous && next && slug && routesDiffer(previous, next)
      ? [{ id, slug, next, previous }]
      : []
  })

type GroupDeleteSnapshot = {
  groupRoutePath?: string
  /** Docs set routes before the delete, keyed by docs set id. */
  routes: Record<string, { routes: DocsSetRoutePair; slug: string }>
}

export const createDocsGroupsRouteHooks = (
  options: DocsRouteHooksOptions,
): {
  afterChange: CollectionAfterChangeHook
  afterDelete: CollectionAfterDeleteHook
  beforeDelete: CollectionBeforeDeleteHook
} => {
  const applyChanges = async ({
    changes,
    groupRoutes,
    req,
  }: {
    changes: DocsSetRouteChange[]
    groupRoutes: (string | undefined)[]
    req: PayloadRequest
  }) => {
    const result = options.docsCollectionSlug
      ? await runRewrite({
          options,
          req,
          targets: changes.map((change) => ({
            docsSetId: change.id,
            hints: [change.previous],
            routes: change.next,
            sourceIds: [change.slug],
          })),
        })
      : undefined

    await revalidate({
      options,
      paths: [
        ...groupRoutes,
        ...changes.flatMap((change) => [
          change.previous.routeBase,
          change.previous.productRoute,
          change.next.routeBase,
          change.next.productRoute,
        ]),
        ...(result?.paths ?? []),
      ],
      req,
      sourceIds: changes.map((change) => change.slug),
    })
  }

  return {
    afterChange: async ({ doc, operation, previousDoc, req }) => {
      const id = getRecordId(doc)

      if (id === undefined) {
        return doc
      }

      const nextGroups = await findGroupsById(req, options)
      const previousGroups = new Map(nextGroups)

      if (operation === 'update' && isRecord(previousDoc)) {
        previousGroups.set(id, previousDoc)
      } else {
        previousGroups.delete(id)
      }

      const changes = diffDocsSetRoutes({
        docsSets: await findMainDocsSets(req, options),
        nextGroups,
        previousGroups,
      })

      await applyChanges({
        changes,
        groupRoutes: [
          getDocsGroupRoutePath({ group: id, groupsById: previousGroups }),
          getDocsGroupRoutePath({ group: id, groupsById: nextGroups }),
        ],
        req,
      })

      return doc
    },
    afterDelete: async ({ id, doc, req }) => {
      const context = contextOf(req)
      const key = `${GROUP_DELETE_CONTEXT_KEY}:${String(id)}`
      const snapshot = context[key] as GroupDeleteSnapshot | undefined

      delete context[key]

      const nextGroups = await findGroupsById(req, options)
      const changes = (await findMainDocsSets(req, options)).flatMap(
        (docsSet): DocsSetRouteChange[] => {
          const docsSetId = getRecordId(docsSet)
          const previous = docsSetId === undefined ? undefined : snapshot?.routes[docsSetId]
          const next = toRoutePair(resolveDocsSetRoutes({ doc: docsSet, groupsById: nextGroups }))

          return docsSetId !== undefined && previous && next && routesDiffer(previous.routes, next)
            ? [{ id: docsSetId, slug: previous.slug, next, previous: previous.routes }]
            : []
        },
      )

      await applyChanges({
        changes,
        groupRoutes: [snapshot?.groupRoutePath],
        req,
      })

      return doc
    },
    // Deleting a group clears relationships to it (Postgres/SQLite foreign keys), so the
    // docs set routes that depended on it are captured before the delete.
    beforeDelete: async ({ id, req }) => {
      const groupsById = await findGroupsById(req, options)
      const routes: GroupDeleteSnapshot['routes'] = {}

      for (const docsSet of await findMainDocsSets(req, options)) {
        const docsSetId = getRecordId(docsSet)
        const pair = toRoutePair(resolveDocsSetRoutes({ doc: docsSet, groupsById }))
        const slug = getString(docsSet.slug)

        if (docsSetId !== undefined && pair && slug) {
          routes[docsSetId] = { slug, routes: pair }
        }
      }

      contextOf(req)[`${GROUP_DELETE_CONTEXT_KEY}:${String(id)}`] = {
        groupRoutePath: getDocsGroupRoutePath({ group: id, groupsById }),
        routes,
      } satisfies GroupDeleteSnapshot
    },
  }
}
