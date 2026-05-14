# Next App Router Docs Route Example

This example shows how an existing catch-all route can resolve generated docs
routes before falling back to normal Pages handling.

```tsx
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  PayloadMarkdownDocsPage,
  resolvePayloadMarkdownDocsRoute,
} from '@valkyrianlabs/payload-markdown-docs/next'

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const resolved = await resolvePayloadMarkdownDocsRoute({
    payload,
    slug,
  })

  if (resolved) {
    return <PayloadMarkdownDocsPage resolved={resolved} />
  }

  // Load and render your normal Pages collection route here.
  notFound()
}
```

The adapter is read-only. It does not create Pages, update Pages, or sync one
Page per Markdown file. Agent skill artifacts live separately under `skills/`
and can be exposed by a static route when a site wants direct skill downloads.
