import type { Endpoint, PayloadRequest } from 'payload'

import type { PublishGeneratedDocsPayloadOperations } from '../payload/publishGeneratedDocs.js'

import { publishGeneratedDocsForSet } from '../payload/publishGeneratedDocs.js'

export type CreatePublishGeneratedDocsEndpointOptions = {
  docsCollectionSlug: string
  docsSetsCollectionSlug: string
  markdownFieldName: string
}

type AccessCheckedPayload = {
  findByID: (args: Record<string, unknown>) => Promise<unknown>
}

const jsonResponse = (body: Record<string, unknown>, status = 200): Response =>
  Response.json(body, {
    status,
  })

const getRouteParam = (req: PayloadRequest, key: string): number | string | undefined => {
  const value = req.routeParams?.[key]

  if (typeof value === 'string' || typeof value === 'number') {
    return value
  }

  return undefined
}

const getRedirectTarget = (req: PayloadRequest): string | undefined => {
  if (!req.url) {
    return undefined
  }

  const url = new URL(req.url)
  const redirect = url.searchParams.get('redirect')

  if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) {
    return undefined
  }

  return redirect
}

const redirectResponse = (location: string): Response =>
  new Response(null, {
    headers: {
      Location: location,
    },
    status: 303,
  })

export const createPublishGeneratedDocsEndpoint = ({
  docsCollectionSlug,
  docsSetsCollectionSlug,
  markdownFieldName,
}: CreatePublishGeneratedDocsEndpointOptions): Endpoint => ({
  handler: async (req) => {
    if (!req.user) {
      return jsonResponse(
        {
          error: 'Unauthorized',
          ok: false,
        },
        401,
      )
    }

    const docsSetId = getRouteParam(req, 'id')

    if (docsSetId === undefined) {
      return jsonResponse(
        {
          error: 'Missing docs set id.',
          ok: false,
        },
        400,
      )
    }

    try {
      await (req.payload as unknown as AccessCheckedPayload).findByID({
        id: docsSetId,
        collection: docsSetsCollectionSlug,
        depth: 0,
        overrideAccess: false,
        user: req.user,
      })
    } catch {
      return jsonResponse(
        {
          error: 'Forbidden',
          ok: false,
        },
        403,
      )
    }

    const summary = await publishGeneratedDocsForSet({
      docsCollectionSlug,
      docsSetId,
      markdownFieldName,
      payload: req.payload as unknown as PublishGeneratedDocsPayloadOperations,
    })
    const redirect = getRedirectTarget(req)

    if (redirect) {
      return redirectResponse(redirect)
    }

    return jsonResponse({
      ok: true,
      summary,
    })
  },
  method: 'post',
  path: '/:id/publish-generated-docs',
})
