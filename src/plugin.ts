import type { Config, Plugin } from 'payload'

import type { PayloadMarkdownDocsConfig } from './types.js'

import {
  createDocsCollection,
  createNoncesCollection,
  createSyncRunsCollection,
} from './collections/index.js'
import {
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_ROUTE_BASE,
  DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
  DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG,
  DEFAULT_DOCS_SYNC_RUNS_COLLECTION_SLUG,
  DEFAULT_MARKDOWN_FIELD_NAME,
  DEFAULT_MAX_BODY_BYTES,
} from './constants.js'
import { createSyncEndpoint } from './endpoints/index.js'

type ResolvedCollectionOptions = {
  docsCollectionSlug: string
  docsEnabled: boolean
  enableDrafts: boolean
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

const resolveCollectionOptions = (
  pluginOptions: PayloadMarkdownDocsConfig,
): ResolvedCollectionOptions => {
  if (pluginOptions.target?.type === 'existingCollection') {
    throw new Error(
      'payloadMarkdownDocs: target.type "existingCollection" is not supported in Phase 2. Use target.type "docsCollection".',
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
    docsCollectionSlug:
      docsSlugFromTarget ?? docsSlugFromCollections ?? DEFAULT_DOCS_COLLECTION_SLUG,
    docsEnabled: pluginOptions.collections?.docs?.enabled !== false,
    enableDrafts:
      pluginOptions.target?.type === 'docsCollection'
        ? pluginOptions.target.enableDrafts === true
        : false,
    markdownFieldName:
      pluginOptions.target?.type === 'docsCollection'
        ? pluginOptions.target.markdownField ?? DEFAULT_MARKDOWN_FIELD_NAME
        : DEFAULT_MARKDOWN_FIELD_NAME,
    noncesCollectionSlug:
      pluginOptions.collections?.nonces?.slug ?? DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG,
    noncesEnabled: pluginOptions.collections?.nonces?.enabled !== false,
    syncRunsCollectionSlug:
      pluginOptions.collections?.syncRuns?.slug ?? DEFAULT_DOCS_SYNC_RUNS_COLLECTION_SLUG,
    syncRunsEnabled: pluginOptions.collections?.syncRuns?.enabled !== false,
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

  const conflictingSlug = collectionSlugsToAdd.find((slug) =>
    existingCollectionSlugs.has(slug),
  )

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
      docsCollectionSlug,
      docsEnabled,
      enableDrafts,
      markdownFieldName,
      noncesCollectionSlug,
      noncesEnabled,
      syncRunsCollectionSlug,
      syncRunsEnabled,
    } = resolveCollectionOptions(pluginOptions)
    const endpointPath = normalizeEndpointPath(
      pluginOptions.endpoint?.path ?? DEFAULT_DOCS_SYNC_ENDPOINT_PATH,
    )

    const collectionSlugsToAdd = [
      ...(docsEnabled ? [docsCollectionSlug] : []),
      ...(syncRunsEnabled ? [syncRunsCollectionSlug] : []),
      ...(noncesEnabled ? [noncesCollectionSlug] : []),
    ]

    assertNoCollectionSlugConflicts(incomingConfig, collectionSlugsToAdd)

    const addedCollections = [
      ...(docsEnabled
        ? [
            createDocsCollection({
              slug: docsCollectionSlug,
              enableDrafts,
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

    return {
      ...incomingConfig,
      collections: [...(incomingConfig.collections ?? []), ...addedCollections],
      endpoints: [
        ...(incomingConfig.endpoints ?? []),
        createSyncEndpoint({
          allowWrites: pluginOptions.sync?.allowWrites,
          auth: pluginOptions.auth,
          deleteBehavior: pluginOptions.sync?.deleteBehavior,
          docsCollectionSlug,
          docsEnabled,
          endpointPath,
          markdownFieldName,
          maxBodyBytes: pluginOptions.endpoint?.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
          noncesCollectionSlug,
          noncesEnabled,
          requireDryRunBeforeApply: pluginOptions.sync?.requireDryRunBeforeApply,
          routeBase: DEFAULT_DOCS_ROUTE_BASE,
          sources: pluginOptions.sources,
          syncRunsCollectionSlug,
          syncRunsEnabled,
        }),
      ],
    }
  }
