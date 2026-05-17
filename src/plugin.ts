import type { Config, Plugin } from 'payload'

import type { PayloadMarkdownDocsConfig } from './types.js'

import {
  createDocsAccessCollection,
  createDocsAssetsCollection,
  createDocsCollection,
  createDocsGroupsCollection,
  createDocsSetsCollection,
  createNoncesCollection,
  createSyncRunsCollection,
} from './collections/index.js'
import {
  DEFAULT_DOCS_ACCESS_COLLECTION_SLUG,
  DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
  DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
  DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG,
  DEFAULT_DOCS_SYNC_RUNS_COLLECTION_SLUG,
  DEFAULT_MARKDOWN_FIELD_NAME,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MEDIA_COLLECTION_SLUG,
  DEFAULT_PAGES_BRIDGE_FIELD,
  DEFAULT_PAGES_COLLECTION_SLUG,
  DEFAULT_PAGES_ROUTE_FIELD,
} from './constants.js'
import { createDocsAssetsEndpoints, createSyncEndpoint } from './endpoints/index.js'
import { installDocsMarketingBlocks } from './install/blocks.js'
import { resolveDocsMarketingBlocksAfterRead } from './payload/index.js'

type ResolvedCollectionOptions = {
  docsAccessCollectionSlug: string
  docsAccessEnabled: boolean
  docsAssetsCollectionSlug: string
  docsAssetsEnabled: boolean
  docsCollectionSlug: string
  docsEnabled: boolean
  docsGroupsCollectionSlug: string
  docsGroupsEnabled: boolean
  docsSetsCollectionSlug: string
  docsSetsEnabled: boolean
  enableDrafts: boolean
  heroImageMediaCollectionSlugs?: string[]
  markdownFieldName: string
  noncesCollectionSlug: string
  noncesEnabled: boolean
  syncRunsCollectionSlug: string
  syncRunsEnabled: boolean
}

const normalizeEndpointPath = (path: string): string => {
  const normalized = `/${path.trim()}`.replace(/\/+/g, '/')

  return normalized.length > 1 ? normalized.replace(/\/+$/g, '') : normalized
}

const resolveHeroImageMediaCollectionSlugs = (
  pluginOptions: PayloadMarkdownDocsConfig,
): string[] | undefined => {
  if (pluginOptions.target?.heroImage === false) {
    return undefined
  }

  const additionalMediaCollections =
    typeof pluginOptions.target?.heroImage === 'object'
      ? (pluginOptions.target.heroImage.additionalMediaCollections ?? [])
      : []

  return [
    ...new Set([
      DEFAULT_MEDIA_COLLECTION_SLUG,
      ...additionalMediaCollections.map((slug) => slug.trim()).filter(Boolean),
    ]),
  ]
}

const resolveCollectionOptions = (
  pluginOptions: PayloadMarkdownDocsConfig,
): ResolvedCollectionOptions => {
  if (pluginOptions.target?.type !== undefined && pluginOptions.target.type !== 'docsCollection') {
    throw new Error(
      'payloadMarkdownDocs: target.type only supports "docsCollection". existingCollection is not supported.',
    )
  }

  const docsSlugFromTarget = pluginOptions.target?.slug
  const docsSlugFromCollections = pluginOptions.collections?.docs?.slug

  if (
    docsSlugFromTarget &&
    docsSlugFromCollections &&
    docsSlugFromTarget !== docsSlugFromCollections
  ) {
    throw new Error(
      'payloadMarkdownDocs: target.slug and collections.docs.slug must match when both are provided.',
    )
  }

  return {
    docsAccessCollectionSlug:
      pluginOptions.collections?.docsAccess?.slug ?? DEFAULT_DOCS_ACCESS_COLLECTION_SLUG,
    docsAccessEnabled: pluginOptions.collections?.docsAccess?.enabled !== false,
    docsAssetsCollectionSlug:
      pluginOptions.collections?.docsAssets?.slug ?? DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
    docsAssetsEnabled: pluginOptions.collections?.docsAssets?.enabled !== false,
    docsCollectionSlug:
      docsSlugFromTarget ?? docsSlugFromCollections ?? DEFAULT_DOCS_COLLECTION_SLUG,
    docsEnabled: pluginOptions.collections?.docs?.enabled !== false,
    docsGroupsCollectionSlug:
      pluginOptions.collections?.docsGroups?.slug ?? DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
    docsGroupsEnabled: pluginOptions.collections?.docsGroups?.enabled !== false,
    docsSetsCollectionSlug:
      pluginOptions.collections?.docsSets?.slug ?? DEFAULT_DOCS_SETS_COLLECTION_SLUG,
    docsSetsEnabled: pluginOptions.collections?.docsSets?.enabled !== false,
    enableDrafts: pluginOptions.target?.enableDrafts === true,
    heroImageMediaCollectionSlugs: resolveHeroImageMediaCollectionSlugs(pluginOptions),
    markdownFieldName: pluginOptions.target?.markdownField ?? DEFAULT_MARKDOWN_FIELD_NAME,
    noncesCollectionSlug:
      pluginOptions.collections?.nonces?.slug ?? DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG,
    noncesEnabled: pluginOptions.collections?.nonces?.enabled !== false,
    syncRunsCollectionSlug:
      pluginOptions.collections?.syncRuns?.slug ?? DEFAULT_DOCS_SYNC_RUNS_COLLECTION_SLUG,
    syncRunsEnabled: pluginOptions.collections?.syncRuns?.enabled !== false,
  }
}

const assertCollectionOptionCompatibility = ({
  docsGroupsEnabled,
  docsSetsEnabled,
}: ResolvedCollectionOptions) => {
  if (docsSetsEnabled && !docsGroupsEnabled) {
    throw new Error(
      'payloadMarkdownDocs: collections.docsSets requires collections.docsGroups to be enabled.',
    )
  }
}

const assertNoCollectionSlugConflicts = (
  incomingConfig: Config,
  collectionSlugsToAdd: string[],
) => {
  const duplicateRequestedSlug = collectionSlugsToAdd.find(
    (slug, index) => collectionSlugsToAdd.indexOf(slug) !== index,
  )

  if (duplicateRequestedSlug) {
    throw new Error(
      `payloadMarkdownDocs: collection slug "${duplicateRequestedSlug}" is configured more than once.`,
    )
  }

  const existingCollectionSlugs = new Set(
    incomingConfig.collections?.map((collection) => collection.slug) ?? [],
  )

  const conflictingSlug = collectionSlugsToAdd.find((slug) => existingCollectionSlugs.has(slug))

  if (conflictingSlug) {
    throw new Error(
      `payloadMarkdownDocs: collection slug "${conflictingSlug}" already exists in the Payload config.`,
    )
  }
}

const addDocsMarketingBlocksAfterReadHooks = ({
  collections,
  docsAssetsCollectionSlug,
  docsCollectionSlug,
  docsSetsCollectionSlug,
  installedCollectionSlugs,
}: {
  collections: NonNullable<Config['collections']>
  docsAssetsCollectionSlug: string
  docsCollectionSlug: string
  docsSetsCollectionSlug: string
  installedCollectionSlugs: string[]
}): NonNullable<Config['collections']> => {
  if (installedCollectionSlugs.length === 0) {
    return collections
  }

  const installedSlugs = new Set(installedCollectionSlugs)

  return collections.map((collection) => {
    if (!installedSlugs.has(collection.slug)) {
      return collection
    }

    return {
      ...collection,
      hooks: {
        ...collection.hooks,
        afterRead: [
          ...(collection.hooks?.afterRead ?? []),
          resolveDocsMarketingBlocksAfterRead({
            docsAssetsCollectionSlug,
            docsCollectionSlug,
            docsSetsCollectionSlug,
          }),
        ],
      },
    }
  })
}

export const payloadMarkdownDocs =
  (pluginOptions: PayloadMarkdownDocsConfig = {}): Plugin =>
  (incomingConfig: Config): Config => {
    if (pluginOptions.enabled === false) {
      return incomingConfig
    }

    const {
      docsAccessCollectionSlug,
      docsAccessEnabled,
      docsAssetsCollectionSlug,
      docsAssetsEnabled,
      docsCollectionSlug,
      docsEnabled,
      docsGroupsCollectionSlug,
      docsGroupsEnabled,
      docsSetsCollectionSlug,
      docsSetsEnabled,
      enableDrafts,
      heroImageMediaCollectionSlugs,
      markdownFieldName,
      noncesCollectionSlug,
      noncesEnabled,
      syncRunsCollectionSlug,
      syncRunsEnabled,
    } = resolveCollectionOptions(pluginOptions)
    assertCollectionOptionCompatibility({
      docsAccessCollectionSlug,
      docsAccessEnabled,
      docsAssetsCollectionSlug,
      docsAssetsEnabled,
      docsCollectionSlug,
      docsEnabled,
      docsGroupsCollectionSlug,
      docsGroupsEnabled,
      docsSetsCollectionSlug,
      docsSetsEnabled,
      enableDrafts,
      heroImageMediaCollectionSlugs,
      markdownFieldName,
      noncesCollectionSlug,
      noncesEnabled,
      syncRunsCollectionSlug,
      syncRunsEnabled,
    })
    const endpointPath = normalizeEndpointPath(
      pluginOptions.endpoint?.path ?? DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
    )

    const collectionSlugsToAdd = [
      ...(docsGroupsEnabled ? [docsGroupsCollectionSlug] : []),
      ...(docsSetsEnabled ? [docsSetsCollectionSlug] : []),
      ...(docsAccessEnabled ? [docsAccessCollectionSlug] : []),
      ...(docsAssetsEnabled ? [docsAssetsCollectionSlug] : []),
      ...(docsEnabled ? [docsCollectionSlug] : []),
      ...(syncRunsEnabled ? [syncRunsCollectionSlug] : []),
      ...(noncesEnabled ? [noncesCollectionSlug] : []),
    ]

    assertNoCollectionSlugConflicts(incomingConfig, collectionSlugsToAdd)

    const addedCollections = [
      ...(docsGroupsEnabled
        ? [
            createDocsGroupsCollection({
              slug: docsGroupsCollectionSlug,
            }),
          ]
        : []),
      ...(docsSetsEnabled
        ? [
            createDocsSetsCollection({
              slug: docsSetsCollectionSlug,
              docsCollectionSlug: docsEnabled ? docsCollectionSlug : undefined,
              docsGroupsCollectionSlug,
              seoEnabled: pluginOptions.seo !== false,
              seoUploadCollectionSlug: DEFAULT_MEDIA_COLLECTION_SLUG,
            }),
          ]
        : []),
      ...(docsAccessEnabled
        ? [
            createDocsAccessCollection({
              slug: docsAccessCollectionSlug,
            }),
          ]
        : []),
      ...(docsAssetsEnabled
        ? [
            createDocsAssetsCollection({
              slug: docsAssetsCollectionSlug,
              docsSetsCollectionSlug: docsSetsEnabled ? docsSetsCollectionSlug : undefined,
              syncRunsCollectionSlug: syncRunsEnabled ? syncRunsCollectionSlug : undefined,
            }),
          ]
        : []),
      ...(docsEnabled
        ? [
            createDocsCollection({
              slug: docsCollectionSlug,
              docsSetsCollectionSlug: docsSetsEnabled ? docsSetsCollectionSlug : undefined,
              enableDrafts,
              heroImageMediaCollectionSlugs,
              markdownFieldName,
              syncRunsCollectionSlug: syncRunsEnabled ? syncRunsCollectionSlug : undefined,
            }),
          ]
        : []),
      ...(syncRunsEnabled
        ? [
            createSyncRunsCollection({
              slug: syncRunsCollectionSlug,
            }),
          ]
        : []),
      ...(noncesEnabled
        ? [
            createNoncesCollection({
              slug: noncesCollectionSlug,
              syncRunsCollectionSlug: syncRunsEnabled ? syncRunsCollectionSlug : undefined,
            }),
          ]
        : []),
    ]

    const marketingBlocksInstall = installDocsMarketingBlocks({
      collectionConfigs: pluginOptions.collections,
      collections: incomingConfig.collections ?? [],
      globalSelection: pluginOptions.blocks,
    })
    const incomingCollections = addDocsMarketingBlocksAfterReadHooks({
      collections: marketingBlocksInstall.collections,
      docsAssetsCollectionSlug,
      docsCollectionSlug,
      docsSetsCollectionSlug,
      installedCollectionSlugs: marketingBlocksInstall.installedCollectionSlugs,
    })

    return {
      ...incomingConfig,
      collections: [...incomingCollections, ...addedCollections],
      endpoints: [
        ...(incomingConfig.endpoints ?? []),
        createSyncEndpoint({
          allowHardDelete: pluginOptions.sync?.allowHardDelete,
          allowPublish: pluginOptions.sync?.allowPublish,
          allowWrites: pluginOptions.sync?.allowWrites,
          auth: pluginOptions.auth,
          deleteBehavior: pluginOptions.sync?.deleteBehavior,
          docsAccessCollectionSlug,
          docsAccessEnabled,
          docsAssetsCollectionSlug,
          docsAssetsEnabled,
          docsCollectionSlug,
          docsEnabled,
          docsEnableDrafts: enableDrafts,
          docsGroupsCollectionSlug,
          docsSetsCollectionSlug,
          docsSetsEnabled,
          endpointPath,
          markdownFieldName,
          maxBodyBytes: pluginOptions.endpoint?.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
          noncesCollectionSlug,
          noncesEnabled,
          revalidate: pluginOptions.sync?.revalidate,
          routing: {
            pages: {
              allowBridgePages: pluginOptions.routing?.pages?.allowBridgePages ?? true,
              bridgeField: pluginOptions.routing?.pages?.bridgeField ?? DEFAULT_PAGES_BRIDGE_FIELD,
              collection: pluginOptions.routing?.pages?.collection ?? DEFAULT_PAGES_COLLECTION_SLUG,
              enabled: pluginOptions.routing?.pages?.enabled === true,
              routeField: pluginOptions.routing?.pages?.routeField ?? DEFAULT_PAGES_ROUTE_FIELD,
            },
          },
          syncRunsCollectionSlug,
          syncRunsEnabled,
        }),
        ...createDocsAssetsEndpoints({
          docsAssetsCollectionSlug,
          docsAssetsEnabled,
          docsCollectionSlug,
          docsEnabled,
          docsGroupsCollectionSlug,
          docsSetsCollectionSlug,
          docsSetsEnabled,
          markdownFieldName,
        }),
      ],
    }
  }
