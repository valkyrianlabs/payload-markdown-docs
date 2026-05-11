import type { PayloadMarkdownDocsReadPayload } from '@valkyrianlabs/payload-markdown-docs/next'

import config from '@payload-config'
import { createPayloadMarkdownDocsMarkdownResponse } from '@valkyrianlabs/payload-markdown-docs/next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

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
