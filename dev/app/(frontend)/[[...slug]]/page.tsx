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
  const { slug = [] } = await params

  if (slug.length === 0) {
    return (
      <main
        style={{
          display: 'grid',
          gap: '1.25rem',
          margin: '0 auto',
          maxWidth: '48rem',
          padding: '4rem 1.5rem',
        }}
      >
        <div>
          <h1>Payload Markdown Docs Dev</h1>
          <p>Local routes for testing the dedicated docs workflow.</p>
        </div>
        <nav
          aria-label="Dev routes"
          style={{
            display: 'grid',
            gap: '0.75rem',
          }}
        >
          <a href="/plugins/payload-markdown-docs">Docs overview</a>
          <a href="/plugins/payload-markdown-docs/getting-started/installation">
            Installation fixture
          </a>
          <a href="/admin">Payload Admin</a>
        </nav>
      </main>
    )
  }

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
