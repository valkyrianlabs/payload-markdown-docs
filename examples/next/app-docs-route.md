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
Page per Markdown file.

## Raw Markdown Output

Serve the AI-facing `.md` export from a route handler at the exported path:

```ts
// app/(frontend)/plugins/payload-markdown-docs.md/route.ts
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  createPayloadMarkdownDocsMarkdownResponse,
} from '@valkyrianlabs/payload-markdown-docs/next'

export async function GET() {
  const payload = await getPayload({ config })
  const response = await createPayloadMarkdownDocsMarkdownResponse({
    payload,
    path: '/plugins/payload-markdown-docs.md',
  })

  if (response) {
    return response
  }

  notFound()
}
```

A `page.tsx` catch-all can render the human docs. Raw Markdown needs a
`route.ts` handler because it returns a `text/markdown` `Response`.
