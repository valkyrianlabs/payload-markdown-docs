import type { PayloadMarkdownDocsReadPayload } from '@valkyrianlabs/payload-markdown-docs/next'

import config from '@payload-config'
import {
  PayloadMarkdownDocsPage,
  resolvePayloadMarkdownDocsRoute,
} from '@valkyrianlabs/payload-markdown-docs/next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

type PageProps = {
  params: Promise<{
    slug?: string[]
  }>
}

const Page = async ({ params }: PageProps) => {
  const { slug } = await params
  const payload = await getPayload({
    config,
  })
  const resolved = await resolvePayloadMarkdownDocsRoute({
    slug,
    payload: payload as PayloadMarkdownDocsReadPayload,
  })

  if (resolved) {
    return <PayloadMarkdownDocsPage resolved={resolved} />
  }

  notFound()
}

export default Page
