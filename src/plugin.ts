import type { Config, Plugin } from 'payload'

import type { PayloadMarkdownDocsConfig } from './types.js'

import {
  createDocsAssetsCollection,
  createDocsCollection,
  createDocsGroupsCollection,
  createDocsKeysCollection,
  createDocsSetsCollection,
  createDocsTrustedCollection,
  createNoncesCollection,
  createSyncRunsCollection,
} from './collections/index.js'
import {
  DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_KEYS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
  DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
  DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG,
  DEFAULT_DOCS_SYNC_RUNS_COLLECTION_SLUG,
  DEFAULT_DOCS_TRUSTED_COLLECTION_SLUG,
  DEFAULT_MARKDOWN_FIELD_NAME,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MEDIA_COLLECTION_SLUG,
  DEFAULT_PAGES_BRIDGE_FIELD,
  DEFAULT_PAGES_COLLECTION_SLUG,
  DEFAULT_PAGES_ROUTE_FIELD,
} from './constants.js'
import { createDocsAssetsEndpoints, createSyncEndpoint } from './endpoints/index.js'
import { installDocsMarketingBlocks } from './install/blocks.js'

type ResolvedCollectionOptions = {
  docsAssetsCollectionSlug: string
  docsAssetsEnabled: boolean
  docsCollectionSlug: string
  docsEnabled: boolean
  docsGroupsCollectionSlug: string
  docsGroupsEnabled: boolean
  docsKeysCollectionSlug: string
  docsKeysEnabled: boolean
  docsSetsCollectionSlug: string
  docsSetsEnabled: boolean
  docsTrustedCollectionSlug: string
  docsTrustedEnabled: boolean
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

const resolveOpenGraphMediaCollectionSlugs = (
  pluginOptions: PayloadMarkdownDocsConfig,
): string[] => {
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
    docsAssetsCollectionSlug:
      pluginOptions.collections?.docsAssets?.slug ?? DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
    docsAssetsEnabled: pluginOptions.collections?.docsAssets?.enabled !== false,
    docsCollectionSlug:
      docsSlugFromTarget ?? docsSlugFromCollections ?? DEFAULT_DOCS_COLLECTION_SLUG,
    docsEnabled: pluginOptions.collections?.docs?.enabled !== false,
    docsGroupsCollectionSlug:
      pluginOptions.collections?.docsGroups?.slug ?? DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
    docsGroupsEnabled: pluginOptions.collections?.docsGroups?.enabled !== false,
    docsKeysCollectionSlug:
      pluginOptions.collections?.docsKeys?.slug ?? DEFAULT_DOCS_KEYS_COLLECTION_SLUG,
    docsKeysEnabled: pluginOptions.collections?.docsKeys?.enabled !== false,
    docsSetsCollectionSlug:
      pluginOptions.collections?.docsSets?.slug ?? DEFAULT_DOCS_SETS_COLLECTION_SLUG,
    docsSetsEnabled: pluginOptions.collections?.docsSets?.enabled !== false,
    docsTrustedCollectionSlug:
      pluginOptions.collections?.docsTrusted?.slug ?? DEFAULT_DOCS_TRUSTED_COLLECTION_SLUG,
    docsTrustedEnabled: pluginOptions.collections?.docsTrusted?.enabled !== false,
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

export const payloadMarkdownDocs =
  (pluginOptions: PayloadMarkdownDocsConfig = {}): Plugin =>
  (incomingConfig: Config): Config => {
    if (pluginOptions.enabled === false) {
      return incomingConfig
    }

    const {
      docsAssetsCollectionSlug,
      docsAssetsEnabled,
      docsCollectionSlug,
      docsEnabled,
      docsGroupsCollectionSlug,
      docsGroupsEnabled,
      docsKeysCollectionSlug,
      docsKeysEnabled,
      docsSetsCollectionSlug,
      docsSetsEnabled,
      docsTrustedCollectionSlug,
      docsTrustedEnabled,
      enableDrafts,
      heroImageMediaCollectionSlugs,
      markdownFieldName,
      noncesCollectionSlug,
      noncesEnabled,
      syncRunsCollectionSlug,
      syncRunsEnabled,
    } = resolveCollectionOptions(pluginOptions)
    assertCollectionOptionCompatibility({
      docsAssetsCollectionSlug,
      docsAssetsEnabled,
      docsCollectionSlug,
      docsEnabled,
      docsGroupsCollectionSlug,
      docsGroupsEnabled,
      docsKeysCollectionSlug,
      docsKeysEnabled,
      docsSetsCollectionSlug,
      docsSetsEnabled,
      docsTrustedCollectionSlug,
      docsTrustedEnabled,
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
      ...(docsKeysEnabled ? [docsKeysCollectionSlug] : []),
      ...(docsTrustedEnabled ? [docsTrustedCollectionSlug] : []),
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
              openGraphMediaCollectionSlugs: resolveOpenGraphMediaCollectionSlugs(pluginOptions),
            }),
          ]
        : []),
      ...(docsKeysEnabled
        ? [
            createDocsKeysCollection({
              slug: docsKeysCollectionSlug,
            }),
          ]
        : []),
      ...(docsTrustedEnabled
        ? [
            createDocsTrustedCollection({
              slug: docsTrustedCollectionSlug,
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

    const incomingCollections = installDocsMarketingBlocks({
      collectionConfigs: pluginOptions.collections,
      collections: incomingConfig.collections ?? [],
      globalSelection: pluginOptions.blocks,
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
          docsAssetsCollectionSlug,
          docsAssetsEnabled,
          docsCollectionSlug,
          docsEnabled,
          docsEnableDrafts: enableDrafts,
          docsGroupsCollectionSlug,
          docsKeysCollectionSlug,
          docsKeysEnabled,
          docsSetsCollectionSlug,
          docsSetsEnabled,
          docsTrustedCollectionSlug,
          docsTrustedEnabled,
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
