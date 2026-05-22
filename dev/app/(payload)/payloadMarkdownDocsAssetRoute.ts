import config from '@payload-config'

import { createPayloadMarkdownDocsAssetRouteHandler } from '../../../dist/next'

export const GET = createPayloadMarkdownDocsAssetRouteHandler({
  config,
})
