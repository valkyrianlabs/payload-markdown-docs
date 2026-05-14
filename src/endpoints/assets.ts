import type { Endpoint, PayloadRequest } from 'payload'

import type { DocsSetPayloadOperations, ResolvedDocsSet } from '../payload/index.js'

import {
  DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
} from '../constants.js'
import { findDocsSetByRoutePrefix } from '../payload/index.js'
import { joinRouteSegments, normalizeRoutePath } from '../routing/index.js'
import {
  DOCS_ASSETS_STORAGE_UNAVAILABLE_MESSAGE,
  isDocsAssetsStorageUnavailableError,
} from './assetsStorage.js'

export type CreateDocsAssetsEndpointsOptions = {
  docsAssetsCollectionSlug?: string
  docsAssetsEnabled?: boolean
  docsGroupsCollectionSlug?: string
  docsSetsCollectionSlug?: string
  docsSetsEnabled?: boolean
}

type AssetEndpointPayloadOperations = {
  find: (args: {
    collection: string
    depth?: number
    draft?: boolean
    limit?: number
    overrideAccess?: boolean
    where?: unknown
  }) => Promise<{
    docs: unknown[]
  }>
} & DocsSetPayloadOperations

type PayloadRequestWithRouteParams = {
  routeParams?: Record<string, unknown>
} & PayloadRequest

type ServedDocsAsset = {
  content: string
  contentType: string
  kind: string
  route: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => (typeof item === 'string' && item ? [item] : []))
  }

  return typeof value === 'string' && value ? [value] : []
}

const toServedDocsAsset = (doc: unknown): ServedDocsAsset | undefined => {
  if (
    !isRecord(doc) ||
    typeof doc.content !== 'string' ||
    typeof doc.contentType !== 'string' ||
    typeof doc.kind !== 'string' ||
    typeof doc.route !== 'string'
  ) {
    return undefined
  }

  const sync = isRecord(doc.sync) ? doc.sync : undefined

  if (sync?.archived === true) {
    return undefined
  }

  return {
    content: doc.content,
    contentType: doc.contentType,
    kind: doc.kind,
    route: normalizeRoutePath(doc.route),
  }
}

const getRequestPath = (req: PayloadRequest): string =>
  normalizeRoutePath(new URL(req.url ?? 'http://payload.local/').pathname)

const getSkillRequestPath = (req: PayloadRequest): string => {
  const routeParams = (req as PayloadRequestWithRouteParams).routeParams
  const routeBase = toStringArray(routeParams?.routeBase)
  const agent = typeof routeParams?.agent === 'string' ? routeParams.agent : undefined
  const assetPath = toStringArray(routeParams?.assetPath)
  const resolvedAssetPath = assetPath.length > 0 ? assetPath : ['SKILL.md']

  if (agent) {
    return joinRouteSegments(...routeBase, 'skills', agent, ...resolvedAssetPath)
  }

  return getRequestPath(req)
}

const getRouteRemainder = ({
  route,
  routeBase,
}: {
  route: string
  routeBase: string
}): string | undefined => {
  const normalizedRoute = normalizeRoutePath(route)
  const normalizedRouteBase = normalizeRoutePath(routeBase)

  if (normalizedRouteBase === '/') {
    return normalizedRoute
  }

  if (normalizedRoute === normalizedRouteBase) {
    return '/'
  }

  return normalizedRoute.startsWith(`${normalizedRouteBase}/`)
    ? normalizedRoute.slice(normalizedRouteBase.length)
    : undefined
}

const notFoundResponse = (): Response =>
  new Response('Not found', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
    status: 404,
  })

const docsAssetsStorageUnavailableResponse = (): Response =>
  new Response(DOCS_ASSETS_STORAGE_UNAVAILABLE_MESSAGE, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
    status: 500,
  })

const resolveAssetByRoute = async ({
  collectionSlug,
  payload,
  route,
}: {
  collectionSlug: string
  payload: AssetEndpointPayloadOperations
  route: string
}): Promise<ServedDocsAsset | undefined> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [
        {
          route: {
            equals: normalizeRoutePath(route),
          },
        },
        {
          'sync.archived': {
            not_equals: true,
          },
        },
      ],
    },
  })

  return result.docs.flatMap((doc) => {
    const asset = toServedDocsAsset(doc)

    return asset ? [asset] : []
  })[0]
}

const resolveAssetByDocsSet = async ({
  collectionSlug,
  docsSet,
  kind,
  payload,
}: {
  collectionSlug: string
  docsSet: ResolvedDocsSet
  kind: 'llms' | 'llms-full'
  payload: AssetEndpointPayloadOperations
}): Promise<ServedDocsAsset | undefined> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [
        {
          kind: {
            equals: kind,
          },
        },
        {
          or: [
            {
              docsSet: {
                equals: docsSet.id,
              },
            },
            {
              sourceId: {
                equals: docsSet.slug,
              },
            },
            {
              'sync.sourceId': {
                equals: docsSet.slug,
              },
            },
          ],
        },
        {
          'sync.archived': {
            not_equals: true,
          },
        },
      ],
    },
  })

  return result.docs.flatMap((doc) => {
    const asset = toServedDocsAsset(doc)

    return asset ? [asset] : []
  })[0]
}

const createAssetResponse = (asset: ServedDocsAsset): Response =>
  new Response(asset.content, {
    headers: {
      'Content-Type': asset.contentType,
    },
  })

const createRootGetEndpoint = ({
  handler,
  path,
}: {
  handler: Endpoint['handler']
  path: string
}): Endpoint =>
  ({
    handler,
    method: 'get',
    path,
    root: true,
  }) as unknown as Endpoint

const createRootAssetEndpoint = ({
  collectionSlug,
  kind,
  path,
}: {
  collectionSlug: string
  kind: 'llms' | 'llms-full'
  path: string
}): Endpoint =>
  createRootGetEndpoint({
    handler: async (req) => {
      try {
        const asset = await resolveAssetByRoute({
          collectionSlug,
          payload: req.payload as unknown as AssetEndpointPayloadOperations,
          route: path,
        })

        return asset?.kind === kind ? createAssetResponse(asset) : notFoundResponse()
      } catch (error) {
        if (isDocsAssetsStorageUnavailableError(error)) {
          return docsAssetsStorageUnavailableResponse()
        }

        throw error
      }
    },
    path,
  })

const createDocsSetLlmsEndpoint = ({
  collectionSlug,
  docsGroupsCollectionSlug,
  docsSetsCollectionSlug,
  kind,
  path,
}: {
  collectionSlug: string
  docsGroupsCollectionSlug: string
  docsSetsCollectionSlug: string
  kind: 'llms' | 'llms-full'
  path: string
}): Endpoint =>
  createRootGetEndpoint({
    handler: async (req) => {
      const route = getRequestPath(req)

      try {
        const docsSet = await findDocsSetByRoutePrefix({
          collectionSlug: docsSetsCollectionSlug,
          docsGroupsCollectionSlug,
          payload: req.payload as unknown as DocsSetPayloadOperations,
          route,
        })

        if (!docsSet) {
          return notFoundResponse()
        }

        const asset = await resolveAssetByDocsSet({
          collectionSlug,
          docsSet,
          kind,
          payload: req.payload as unknown as AssetEndpointPayloadOperations,
        })

        return asset ? createAssetResponse(asset) : notFoundResponse()
      } catch (error) {
        if (isDocsAssetsStorageUnavailableError(error)) {
          return docsAssetsStorageUnavailableResponse()
        }

        throw error
      }
    },
    path,
  })

const createSkillAssetEndpoint = ({
  collectionSlug,
  docsGroupsCollectionSlug,
  docsSetsCollectionSlug,
}: {
  collectionSlug: string
  docsGroupsCollectionSlug: string
  docsSetsCollectionSlug: string
}): Endpoint =>
  createRootGetEndpoint({
    handler: async (req) => {
      const route = getSkillRequestPath(req)

      try {
        const docsSet = await findDocsSetByRoutePrefix({
          collectionSlug: docsSetsCollectionSlug,
          docsGroupsCollectionSlug,
          payload: req.payload as unknown as DocsSetPayloadOperations,
          route,
        })

        if (!docsSet) {
          return notFoundResponse()
        }

        const routeRemainder = getRouteRemainder({
          route,
          routeBase: docsSet.routeBase,
        })

        if (!routeRemainder?.startsWith('/skills/')) {
          return notFoundResponse()
        }

        const asset = await resolveAssetByRoute({
          collectionSlug,
          payload: req.payload as unknown as AssetEndpointPayloadOperations,
          route,
        })

        return asset?.kind === 'skill' ? createAssetResponse(asset) : notFoundResponse()
      } catch (error) {
        if (isDocsAssetsStorageUnavailableError(error)) {
          return docsAssetsStorageUnavailableResponse()
        }

        throw error
      }
    },
    path: '/:routeBase*/skills/:agent/:assetPath*',
  })

export const createDocsAssetsEndpoints = ({
  docsAssetsCollectionSlug = DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
  docsAssetsEnabled = true,
  docsGroupsCollectionSlug = DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  docsSetsCollectionSlug = DEFAULT_DOCS_SETS_COLLECTION_SLUG,
  docsSetsEnabled = true,
}: CreateDocsAssetsEndpointsOptions): Endpoint[] => {
  if (!docsAssetsEnabled) {
    return []
  }

  return [
    createRootAssetEndpoint({
      collectionSlug: docsAssetsCollectionSlug,
      kind: 'llms',
      path: '/llms.txt',
    }),
    createRootAssetEndpoint({
      collectionSlug: docsAssetsCollectionSlug,
      kind: 'llms-full',
      path: '/llms-full.txt',
    }),
    ...(docsSetsEnabled
      ? [
          createDocsSetLlmsEndpoint({
            collectionSlug: docsAssetsCollectionSlug,
            docsGroupsCollectionSlug,
            docsSetsCollectionSlug,
            kind: 'llms',
            path: '/:routeBase*/llms.txt',
          }),
          createDocsSetLlmsEndpoint({
            collectionSlug: docsAssetsCollectionSlug,
            docsGroupsCollectionSlug,
            docsSetsCollectionSlug,
            kind: 'llms-full',
            path: '/:routeBase*/llms-full.txt',
          }),
          createSkillAssetEndpoint({
            collectionSlug: docsAssetsCollectionSlug,
            docsGroupsCollectionSlug,
            docsSetsCollectionSlug,
          }),
        ]
      : []),
  ]
}
