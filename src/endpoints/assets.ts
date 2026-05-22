import type { Endpoint, PayloadRequest } from 'payload'

import { strToU8, zipSync } from 'fflate'

import type { DocsSetPayloadOperations, ResolvedDocsSet } from '../payload/index.js'
import type { SkillBundle, SkillBundleAsset } from '../skillBundles.js'

import {
  DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
  DEFAULT_MARKDOWN_FIELD_NAME,
} from '../constants.js'
import { findDocsSetByRoutePrefix } from '../payload/index.js'
import { joinRouteSegments, normalizeRoutePath } from '../routing/index.js'
import {
  getSkillBundleForAgent,
  getSkillZipEntryPath,
  parseSkillSourcePath,
  renderSkillDirectoryIndex,
  sanitizeSkillPackageSlug,
} from '../skillBundles.js'
import {
  DOCS_ASSETS_STORAGE_UNAVAILABLE_MESSAGE,
  isDocsAssetsStorageUnavailableError,
} from './assetsStorage.js'
import { createLlmsResponse, generateDocsSetLlms, generateRootLlms } from './llms.js'

export type CreateDocsAssetsEndpointsOptions = {
  docsAssetsCollectionSlug?: string
  docsAssetsEnabled?: boolean
  docsCollectionSlug?: string
  docsEnabled?: boolean
  docsGroupsCollectionSlug?: string
  docsSetsCollectionSlug?: string
  docsSetsEnabled?: boolean
  markdownFieldName?: string
}

type AssetEndpointPayloadOperations = {
  find: (args: {
    collection: string
    depth?: number
    draft?: boolean
    limit?: number
    overrideAccess?: boolean
    sort?: string
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

type SkillDocsAsset = {
  content: string
  contentType: string
  id?: string
  kind: string
  route: string
  sourceId?: string
  sourcePath: string
} & SkillBundleAsset

type SkillArchiveRequest = {
  agent: string
  archiveRoute: string
  rawSkillRoute: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => (typeof item === 'string' && item ? [item] : []))
  }

  return typeof value === 'string' && value ? [value] : []
}

const getRecordId = (doc: Record<string, unknown>): string | undefined => {
  if (typeof doc.id === 'string' || typeof doc.id === 'number') {
    return String(doc.id)
  }

  return undefined
}

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

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

const toSkillDocsAsset = (doc: unknown): SkillDocsAsset | undefined => {
  if (
    !isRecord(doc) ||
    typeof doc.content !== 'string' ||
    typeof doc.contentType !== 'string' ||
    doc.kind !== 'skill' ||
    typeof doc.route !== 'string' ||
    typeof doc.sourcePath !== 'string'
  ) {
    return undefined
  }

  const sync = isRecord(doc.sync) ? doc.sync : undefined

  if (sync?.archived === true) {
    return undefined
  }

  return {
    id: getRecordId(doc),
    content: doc.content,
    contentType: doc.contentType,
    kind: doc.kind,
    route: normalizeRoutePath(doc.route),
    sourceId: getString(doc.sourceId) ?? getString(sync?.sourceId),
    sourcePath: doc.sourcePath,
  }
}

const getRequestPath = (req: PayloadRequest): string =>
  normalizeRoutePath(new URL(req.url ?? 'http://payload.local/').pathname)

const getSkillAssetRequest = (
  req: PayloadRequest,
):
  | {
      agent: string
      assetPath?: string
      rawSkillRoute: string
      requestedRoute: string
    }
  | undefined => {
  const routeParams = (req as PayloadRequestWithRouteParams).routeParams
  const routeBase = toStringArray(routeParams?.routeBase)
  const routeParamAgent = typeof routeParams?.agent === 'string' ? routeParams.agent : undefined
  const requestPath = getRequestPath(req)
  const requestSegments = requestPath.split('/').filter(Boolean)
  const skillsIndex = requestSegments.lastIndexOf('skills')
  const requestAgent = skillsIndex >= 0 ? requestSegments[skillsIndex + 1] : undefined
  const agent = routeParamAgent ?? requestAgent

  if (!agent || agent.endsWith('.zip')) {
    return undefined
  }

  const assetPathSegments =
    routeParams && 'assetPath' in routeParams
      ? toStringArray(routeParams.assetPath)
      : skillsIndex >= 0
        ? requestSegments.slice(skillsIndex + 2)
        : []
  const assetPath = assetPathSegments.length > 0 ? assetPathSegments.join('/') : undefined
  const routePrefix =
    routeBase.length > 0
      ? joinRouteSegments(...routeBase)
      : skillsIndex > 0
        ? joinRouteSegments(...requestSegments.slice(0, skillsIndex))
        : undefined
  const rawSkillRoute = joinRouteSegments(routePrefix, 'skills', agent)

  return {
    agent,
    assetPath,
    rawSkillRoute,
    requestedRoute: assetPath ? joinRouteSegments(rawSkillRoute, assetPath) : rawSkillRoute,
  }
}

const getSkillArchiveRequest = (req: PayloadRequest): SkillArchiveRequest | undefined => {
  const routeParams = (req as PayloadRequestWithRouteParams).routeParams
  const routeBase = toStringArray(routeParams?.routeBase)
  const routeParamAgent = typeof routeParams?.agent === 'string' ? routeParams.agent : undefined
  const requestPath = getRequestPath(req)
  const requestPathMatch = requestPath.match(/^(?<routePrefix>.*)\/skills\/(?<agent>[^/]+)\.zip$/)
  const agent =
    (routeParamAgent?.endsWith('.zip')
      ? routeParamAgent.slice(0, -'.zip'.length)
      : routeParamAgent) ?? requestPathMatch?.groups?.agent

  if (!agent) {
    return undefined
  }

  const routePrefix =
    routeBase.length > 0 ? joinRouteSegments(...routeBase) : requestPathMatch?.groups?.routePrefix

  return {
    agent,
    archiveRoute:
      routeBase.length > 0
        ? joinRouteSegments(...routeBase, 'skills', `${agent}.zip`)
        : requestPath,
    rawSkillRoute: joinRouteSegments(routePrefix, 'skills', agent),
  }
}

const isAssetRouteInRequestedSkill = ({
  asset,
  rawSkillRoute,
}: {
  asset: SkillDocsAsset
  rawSkillRoute: string
}): boolean => {
  const normalizedRawSkillRoute = normalizeRoutePath(rawSkillRoute)
  const normalizedAssetRoute = normalizeRoutePath(asset.route)

  return normalizedAssetRoute.startsWith(`${normalizedRawSkillRoute}/`)
}

const createContentDispositionFilename = ({
  agent,
  sourceSlug,
}: {
  agent: string
  sourceSlug: string
}): string => {
  const safeSourceSlug = sanitizeSkillPackageSlug(sourceSlug) ?? 'skill'
  const safeAgent = sanitizeSkillPackageSlug(agent) ?? 'agent'

  return `${safeSourceSlug}-${safeAgent}.zip`
}

const notFoundResponse = (): Response =>
  new Response('Not found', {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
    status: 404,
  })

const docsAssetsStorageUnavailableResponse = (): Response =>
  new Response(DOCS_ASSETS_STORAGE_UNAVAILABLE_MESSAGE, {
    headers: {
      'Cache-Control': 'no-store',
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

const findSkillAssetsForDocsSet = async ({
  collectionSlug,
  docsSet,
  payload,
}: {
  collectionSlug: string
  docsSet: ResolvedDocsSet
  payload: AssetEndpointPayloadOperations
}): Promise<SkillDocsAsset[]> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    where: {
      and: [
        {
          kind: {
            equals: 'skill',
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
    const asset = toSkillDocsAsset(doc)

    return asset ? [asset] : []
  })
}

const resolveSkillAssetByRoute = async ({
  collectionSlug,
  payload,
  route,
}: {
  collectionSlug: string
  payload: AssetEndpointPayloadOperations
  route: string
}): Promise<SkillDocsAsset | undefined> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [
        {
          kind: {
            equals: 'skill',
          },
        },
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
    const asset = toSkillDocsAsset(doc)

    return asset ? [asset] : []
  })[0]
}

const findSkillAssetsBySourceId = async ({
  collectionSlug,
  payload,
  sourceId,
}: {
  collectionSlug: string
  payload: AssetEndpointPayloadOperations
  sourceId: string
}): Promise<SkillDocsAsset[]> => {
  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    where: {
      and: [
        {
          kind: {
            equals: 'skill',
          },
        },
        {
          or: [
            {
              sourceId: {
                equals: sourceId,
              },
            },
            {
              'sync.sourceId': {
                equals: sourceId,
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
    const asset = toSkillDocsAsset(doc)

    return asset ? [asset] : []
  })
}

const mergeSkillAssets = (assets: SkillDocsAsset[]): SkillDocsAsset[] => {
  const merged = new Map<string, SkillDocsAsset>()

  for (const asset of assets) {
    const key = asset.id ?? `${asset.sourcePath}\n${asset.route}`

    if (!merged.has(key)) {
      merged.set(key, asset)
    }
  }

  return [...merged.values()]
}

const loadSkillAssets = async ({
  agent,
  collectionSlug,
  docsSet,
  payload,
  rawSkillRoute,
}: {
  agent: string
  collectionSlug: string
  docsSet?: ResolvedDocsSet
  payload: AssetEndpointPayloadOperations
  rawSkillRoute: string
}): Promise<SkillDocsAsset[]> => {
  const docsSetAssets = docsSet
    ? await findSkillAssetsForDocsSet({
        collectionSlug,
        docsSet,
        payload,
      })
    : []

  if (docsSet && getSkillBundleForAgent(docsSetAssets, agent)) {
    return docsSetAssets
  }

  const routeRoot = await resolveSkillAssetByRoute({
    collectionSlug,
    payload,
    route: joinRouteSegments(rawSkillRoute, 'SKILL.md'),
  })

  if (!routeRoot) {
    return docsSetAssets
  }

  const sourceInfo = parseSkillSourcePath(routeRoot.sourcePath)

  if (!sourceInfo?.sourceId) {
    return mergeSkillAssets([...docsSetAssets, routeRoot])
  }

  const sourceAssets = await findSkillAssetsBySourceId({
    collectionSlug,
    payload,
    sourceId: sourceInfo.sourceId,
  })

  return mergeSkillAssets([
    ...docsSetAssets,
    routeRoot,
    ...sourceAssets.filter((asset) =>
      isAssetRouteInRequestedSkill({
        asset,
        rawSkillRoute,
      }),
    ),
  ])
}

const buildSkillZipResponse = ({
  bundle,
}: {
  bundle: SkillBundle
}): Response | undefined => {
  const zipEntries: Record<string, Uint8Array> = {}
  let rootSkillEntries = 0

  for (const file of bundle.files) {
    const zipPath = getSkillZipEntryPath({
      packageSlug: bundle.packageSlug,
      relativePath: file.relativePath,
    })

    if (!zipPath || typeof file.content !== 'string') {
      continue
    }

    if (file.relativePath === 'SKILL.md') {
      if (rootSkillEntries > 0) {
        continue
      }

      rootSkillEntries += 1
    }

    if (zipEntries[zipPath]) {
      continue
    }

    zipEntries[zipPath] = strToU8(file.content)
  }

  const rootZipPath = getSkillZipEntryPath({
    packageSlug: bundle.packageSlug,
    relativePath: 'SKILL.md',
  })

  if (rootSkillEntries !== 1 || !rootZipPath || !zipEntries[rootZipPath]) {
    return undefined
  }

  const zipArchive = zipSync(zipEntries, {
    level: 6,
  })
  const filename = createContentDispositionFilename({
    agent: bundle.agent,
    sourceSlug: bundle.packageSlug,
  })

  return new Response(new Blob([zipArchive], { type: 'application/zip' }), {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/zip',
    },
  })
}

const createAssetResponse = (asset: ServedDocsAsset): Response =>
  new Response(asset.content, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': asset.contentType,
    },
  })

const createMarkdownResponse = (content: string): Response =>
  new Response(content, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/markdown; charset=utf-8',
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
  docsCollectionSlug,
  docsEnabled,
  docsGroupsCollectionSlug,
  docsSetsCollectionSlug,
  docsSetsEnabled,
  kind,
  markdownFieldName,
  path,
}: {
  collectionSlug: string
  docsCollectionSlug: string
  docsEnabled: boolean
  docsGroupsCollectionSlug: string
  docsSetsCollectionSlug: string
  docsSetsEnabled: boolean
  kind: 'llms' | 'llms-full'
  markdownFieldName: string
  path: string
}): Endpoint =>
  createRootGetEndpoint({
    handler: async (req) => {
      try {
        const payload = req.payload as unknown as AssetEndpointPayloadOperations

        if (docsEnabled && docsSetsEnabled) {
          const generatedContent = await generateRootLlms({
            docsAssetsCollectionSlug: collectionSlug,
            docsCollectionSlug,
            docsGroupsCollectionSlug,
            docsSetsCollectionSlug,
            kind,
            markdownFieldName,
            payload,
            req,
          })

          if (generatedContent) {
            return createLlmsResponse(generatedContent)
          }
        }

        const asset = await resolveAssetByRoute({
          collectionSlug,
          payload,
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
  docsCollectionSlug,
  docsEnabled,
  docsGroupsCollectionSlug,
  docsSetsCollectionSlug,
  kind,
  markdownFieldName,
  path,
}: {
  collectionSlug: string
  docsCollectionSlug: string
  docsEnabled: boolean
  docsGroupsCollectionSlug: string
  docsSetsCollectionSlug: string
  kind: 'llms' | 'llms-full'
  markdownFieldName: string
  path: string
}): Endpoint =>
  createRootGetEndpoint({
    handler: async (req) => {
      const route = getRequestPath(req)
      const payload = req.payload as unknown as AssetEndpointPayloadOperations

      try {
        const docsSet = await findDocsSetByRoutePrefix({
          collectionSlug: docsSetsCollectionSlug,
          docsGroupsCollectionSlug,
          payload: payload as DocsSetPayloadOperations,
          route,
        })

        if (!docsSet) {
          return notFoundResponse()
        }

        if (docsEnabled) {
          const generatedContent = await generateDocsSetLlms({
            docsAssetsCollectionSlug: collectionSlug,
            docsCollectionSlug,
            docsGroupsCollectionSlug,
            docsSet,
            docsSetsCollectionSlug,
            kind,
            markdownFieldName,
            payload,
            req,
          })

          if (generatedContent) {
            return createLlmsResponse(generatedContent)
          }
        }

        const asset = await resolveAssetByDocsSet({
          collectionSlug,
          docsSet,
          kind,
          payload,
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
      const skillRequest = getSkillAssetRequest(req)

      if (!skillRequest) {
        return notFoundResponse()
      }

      try {
        const payload = req.payload as unknown as AssetEndpointPayloadOperations

        if (skillRequest.assetPath) {
          const asset = await resolveSkillAssetByRoute({
            collectionSlug,
            payload,
            route: skillRequest.requestedRoute,
          })

          if (asset) {
            return createAssetResponse(asset)
          }
        }

        const docsSet = await findDocsSetByRoutePrefix({
          collectionSlug: docsSetsCollectionSlug,
          docsGroupsCollectionSlug,
          payload: payload as DocsSetPayloadOperations,
          route: skillRequest.requestedRoute,
        })
        const assets = await loadSkillAssets({
          agent: skillRequest.agent,
          collectionSlug,
          docsSet,
          payload,
          rawSkillRoute: skillRequest.rawSkillRoute,
        })
        const bundle = getSkillBundleForAgent(assets, skillRequest.agent)
        const content = bundle
          ? renderSkillDirectoryIndex({
              bundle,
              directoryPath: skillRequest.assetPath,
            })
          : undefined

        return content ? createMarkdownResponse(content) : notFoundResponse()
      } catch (error) {
        if (isDocsAssetsStorageUnavailableError(error)) {
          return docsAssetsStorageUnavailableResponse()
        }

        throw error
      }
    },
    path: '/:routeBase*/skills/:agent/:assetPath*',
  })

const createSkillZipEndpoint = ({
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
      const archiveRequest = getSkillArchiveRequest(req)

      if (!archiveRequest) {
        return notFoundResponse()
      }

      try {
        const payload = req.payload as unknown as AssetEndpointPayloadOperations
        const docsSet = await findDocsSetByRoutePrefix({
          collectionSlug: docsSetsCollectionSlug,
          docsGroupsCollectionSlug,
          payload: payload as DocsSetPayloadOperations,
          route: archiveRequest.archiveRoute,
        })
        const assets = await loadSkillAssets({
          agent: archiveRequest.agent,
          collectionSlug,
          docsSet,
          payload,
          rawSkillRoute: archiveRequest.rawSkillRoute,
        })
        const bundle = getSkillBundleForAgent(assets, archiveRequest.agent)
        const response = bundle ? buildSkillZipResponse({ bundle }) : undefined

        return response ?? notFoundResponse()
      } catch (error) {
        if (isDocsAssetsStorageUnavailableError(error)) {
          return docsAssetsStorageUnavailableResponse()
        }

        throw error
      }
    },
    path: '/:routeBase*/skills/:agent.zip',
  })

export const createDocsAssetsEndpoints = ({
  docsAssetsCollectionSlug = DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
  docsAssetsEnabled = true,
  docsCollectionSlug = DEFAULT_DOCS_COLLECTION_SLUG,
  docsEnabled = true,
  docsGroupsCollectionSlug = DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  docsSetsCollectionSlug = DEFAULT_DOCS_SETS_COLLECTION_SLUG,
  docsSetsEnabled = true,
  markdownFieldName = DEFAULT_MARKDOWN_FIELD_NAME,
}: CreateDocsAssetsEndpointsOptions): Endpoint[] => {
  if (!docsAssetsEnabled) {
    return []
  }

  return [
    createRootAssetEndpoint({
      collectionSlug: docsAssetsCollectionSlug,
      docsCollectionSlug,
      docsEnabled,
      docsGroupsCollectionSlug,
      docsSetsCollectionSlug,
      docsSetsEnabled,
      kind: 'llms',
      markdownFieldName,
      path: '/llms.txt',
    }),
    createRootAssetEndpoint({
      collectionSlug: docsAssetsCollectionSlug,
      docsCollectionSlug,
      docsEnabled,
      docsGroupsCollectionSlug,
      docsSetsCollectionSlug,
      docsSetsEnabled,
      kind: 'llms-full',
      markdownFieldName,
      path: '/llms-full.txt',
    }),
    ...(docsSetsEnabled
      ? [
          createDocsSetLlmsEndpoint({
            collectionSlug: docsAssetsCollectionSlug,
            docsCollectionSlug,
            docsEnabled,
            docsGroupsCollectionSlug,
            docsSetsCollectionSlug,
            kind: 'llms',
            markdownFieldName,
            path: '/:routeBase*/llms.txt',
          }),
          createDocsSetLlmsEndpoint({
            collectionSlug: docsAssetsCollectionSlug,
            docsCollectionSlug,
            docsEnabled,
            docsGroupsCollectionSlug,
            docsSetsCollectionSlug,
            kind: 'llms-full',
            markdownFieldName,
            path: '/:routeBase*/llms-full.txt',
          }),
          createSkillZipEndpoint({
            collectionSlug: docsAssetsCollectionSlug,
            docsGroupsCollectionSlug,
            docsSetsCollectionSlug,
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
