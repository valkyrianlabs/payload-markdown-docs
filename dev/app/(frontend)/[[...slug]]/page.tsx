import config from '@payload-config'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import type { PayloadMarkdownDocsReadPayload } from '../../../../dist/next'
import type { Page as PageType } from '../../../payload-types'

import {
  PayloadMarkdownDocsPage,
  resolvePayloadMarkdownDocsRoute,
} from '../../../../dist/next'
import { RenderBlocks } from '../../../blocks/RenderBlocks'
import { RenderHero } from '../../../heros/RenderHero'

type PageProps = {
  params: Promise<{
    slug?: string[]
  }>
}

export const dynamic = 'force-dynamic'

const getPagePath = (slug: string[]): string => {
  const path = `/${slug.join('/')}`.replace(/\/+/g, '/')

  return path.length > 1 ? path.replace(/\/+$/g, '') : path
}

const Page = async ({ params }: PageProps) => {
  const { slug = [] } = await params

  if (slug.length === 0) {
    return (
      <main className="mx-auto grid min-h-screen max-w-3xl content-center gap-8 px-6 py-16">
        <div>
          <p className="mb-3 text-sm font-medium uppercase tracking-wide text-cyan-300">
            Dev harness
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Payload Markdown Docs
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-foreground/70">
            Local routes for testing the dedicated docs workflow.
          </p>
        </div>
        <nav aria-label="Dev routes" className="grid gap-3 sm:grid-cols-3">
          <a
            className="rounded-xl border border-border bg-white/[0.03] p-4 text-sm font-medium text-foreground transition-colors hover:bg-white/[0.06]"
            href="/plugins/payload-markdown-docs"
          >
            Docs overview
          </a>
          <a
            className="rounded-xl border border-border bg-white/[0.03] p-4 text-sm font-medium text-foreground transition-colors hover:bg-white/[0.06]"
            href="/plugins/payload-markdown-docs/getting-started/installation"
          >
            Installation fixture
          </a>
          <a
            className="rounded-xl border border-border bg-white/[0.03] p-4 text-sm font-medium text-foreground transition-colors hover:bg-white/[0.06]"
            href="/admin"
          >
            Payload Admin
          </a>
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

  const pagePath = getPagePath(slug)
  const pages = await payload.find({
    collection: 'pages',
    depth: 2,
    limit: 1,
    overrideAccess: false,
    where: {
      fullPath: {
        equals: pagePath,
      },
    },
  })
  const page = pages.docs[0] as PageType | undefined

  if (!page) {
    notFound()
  }

  return (
    <>
      <RenderHero {...page.hero} />
      <RenderBlocks blocks={page.layout} collectionSlug="pages" />
    </>
  )
}

export default Page
