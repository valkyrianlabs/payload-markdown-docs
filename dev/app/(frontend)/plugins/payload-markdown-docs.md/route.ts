import config from '@payload-config'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import type { PayloadMarkdownDocsReadPayload } from '../../../../../dist/next'

import { createPayloadMarkdownDocsMarkdownResponse } from '../../../../../dist/next'

export async function GET() {
  const payload = await getPayload({
    config,
  })
  const response = await createPayloadMarkdownDocsMarkdownResponse({
    path: '/plugins/payload-markdown-docs.md',
    payload: payload as PayloadMarkdownDocsReadPayload,
  })

  if (response) {
    return response
  }

  notFound()
}
