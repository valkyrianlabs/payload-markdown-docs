import type { handleEndpoints } from 'payload'

import { handleEndpoints as dispatchPayloadEndpoints } from 'payload'

import { joinRouteSegments } from '../routing/index.js'

export type PayloadMarkdownDocsAssetRouteConfig = Parameters<typeof handleEndpoints>[0]['config']

export type PayloadMarkdownDocsAssetRouteHandler = (
  request: Request,
  context?: unknown,
) => Promise<Response>

export type CreatePayloadMarkdownDocsAssetRouteHandlerOptions = {
  apiRoute?: string
  config: PayloadMarkdownDocsAssetRouteConfig
}

export const createPayloadMarkdownDocsAssetRouteHandler = ({
  apiRoute = '/api',
  config,
}: CreatePayloadMarkdownDocsAssetRouteHandlerOptions): PayloadMarkdownDocsAssetRouteHandler => {
  const normalizedApiRoute = joinRouteSegments(apiRoute)

  return async (request) => {
    const pathname = new URL(request.url).pathname

    return dispatchPayloadEndpoints({
      config,
      path: joinRouteSegments(normalizedApiRoute, pathname),
      request,
    })
  }
}
