import config from '@payload-config'
import {
  PayloadMarkdownDocsPage,
  type PayloadMarkdownDocsReadPayload,
  resolvePayloadMarkdownDocsRoute,
} from '@valkyrianlabs/payload-markdown-docs/next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

const Page = async ({ params }: { params: Promise<{ slug?: string[] }> }) => {
  const { slug = [] } = await params
  const payload = await getPayload({ config })
  const resolved = await resolvePayloadMarkdownDocsRoute({
    payload: payload as unknown as PayloadMarkdownDocsReadPayload,
    slug,
  })

  if (!resolved) notFound()

  return <PayloadMarkdownDocsPage resolved={resolved} />
}

export default Page
