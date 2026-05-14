import type { PayloadMarkdownDocsCollectionSlugs, PayloadMarkdownDocsReadPayload } from './types.js'

import { DEFAULT_DOCS_ASSETS_COLLECTION_SLUG } from '../constants.js'
import { normalizeRoutePath } from '../routing/index.js'

export type ResolvedPayloadMarkdownDocsAsset = {
  content: string
  contentType: string
  id: string
  kind: string
  route: string
  sourceHash?: string
  sourcePath: string
}

export type ResolvePayloadMarkdownDocsAssetRouteOptions = {
  collections?: PayloadMarkdownDocsCollectionSlugs
  overrideAccess?: boolean
  path: string
  payload: PayloadMarkdownDocsReadPayload
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getRecordId = (doc: Record<string, unknown>): string | undefined => {
  if (typeof doc.id === 'string' || typeof doc.id === 'number') {
    return String(doc.id)
  }

  return undefined
}

const toResolvedAsset = (doc: unknown): ResolvedPayloadMarkdownDocsAsset | undefined => {
  if (
    !isRecord(doc) ||
    typeof doc.content !== 'string' ||
    typeof doc.contentType !== 'string' ||
    typeof doc.kind !== 'string' ||
    typeof doc.route !== 'string' ||
    typeof doc.sourcePath !== 'string'
  ) {
    return undefined
  }

  const sync = isRecord(doc.sync) ? doc.sync : undefined

  if (sync?.archived === true) {
    return undefined
  }

  const id = getRecordId(doc)

  if (!id) {
    return undefined
  }

  return {
    id,
    content: doc.content,
    contentType: doc.contentType,
    kind: doc.kind,
    route: normalizeRoutePath(doc.route),
    sourceHash: typeof doc.sourceHash === 'string' ? doc.sourceHash : undefined,
    sourcePath: doc.sourcePath,
  }
}

export const resolvePayloadMarkdownDocsAssetRoute = async ({
  collections,
  overrideAccess = true,
  path,
  payload,
}: ResolvePayloadMarkdownDocsAssetRouteOptions): Promise<
  ResolvedPayloadMarkdownDocsAsset | undefined
> => {
  const route = normalizeRoutePath(path)
  const collection = collections?.docsAssets ?? DEFAULT_DOCS_ASSETS_COLLECTION_SLUG

  const result = await payload.find({
    collection,
    depth: 0,
    limit: 1,
    overrideAccess,
    where: {
      and: [
        {
          route: {
            equals: route,
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
    const asset = toResolvedAsset(doc)

    return asset ? [asset] : []
  })[0]
}

export const createPayloadMarkdownDocsAssetResponse = async (
  options: ResolvePayloadMarkdownDocsAssetRouteOptions,
): Promise<Response> => {
  const asset = await resolvePayloadMarkdownDocsAssetRoute(options)

  if (!asset) {
    return new Response('Not found', {
      status: 404,
    })
  }

  return new Response(asset.content, {
    headers: {
      'Content-Type': asset.contentType,
    },
  })
}

export const createPayloadMarkdownDocsLlmsResponse =
  createPayloadMarkdownDocsAssetResponse

export const createPayloadMarkdownDocsSkillAssetResponse =
  createPayloadMarkdownDocsAssetResponse
