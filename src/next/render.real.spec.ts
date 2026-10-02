/**
 * Un-mocked render test (X-10): renders the docs page through the REAL
 * `@valkyrianlabs/payload-markdown/server` MarkdownRenderer, so a core contract break
 * (renderer throws, heading ids or link handling change) fails docs CI. Core imports
 * `./index.css` as a side effect; vitest.config inlines the package so Vite handles CSS.
 */
import { renderToReadableStream } from 'react-dom/server.edge'
import { describe, expect, it } from 'vitest'

import type { ResolvedPayloadMarkdownDocsRoute } from './types.js'

import { PayloadMarkdownDocsPage } from './PayloadMarkdownDocsPage.js'

const docsSet = {
  id: 'set-1',
  slug: 'payload-markdown',
  order: 0,
  productRoute: '/plugins/payload-markdown',
  routeBase: '/plugins/payload-markdown',
  routeMode: 'docs-root',
  title: 'Payload Markdown',
} as const

const render = async (content: string, sourcePath = 'advanced/migrations.md') => {
  const resolved = {
    type: 'doc',
    doc: {
      id: 'doc-1',
      archived: false,
      content,
      depth: 1,
      order: 0,
      route: '/plugins/payload-markdown/advanced/migrations',
      sourcePath,
      title: 'Migrations',
    },
    docsSet,
    route: '/plugins/payload-markdown/advanced/migrations',
    sidebar: [],
  } as unknown as ResolvedPayloadMarkdownDocsRoute
  const element = await PayloadMarkdownDocsPage({ renderSidebar: false, resolved })

  return new Response(await renderToReadableStream(element)).text()
}

describe('docs page rendered by the real payload-markdown renderer', () => {
  it('produces heading anchors and rewritten doc links in the final HTML', async () => {
    const html = await render(
      [
        '# Migrations',
        '',
        '## Upgrade Steps',
        '',
        'See [the v1 guide](/advanced/v1.md), [troubleshooting](./troubleshooting.md#fix), and [GitHub](https://github.com).',
      ].join('\n'),
    )

    expect(html).toMatch(/<h2[^>]*id="upgrade-steps"/)
    expect(html).toContain('href="/plugins/payload-markdown/advanced/v1"')
    expect(html).toContain('href="/plugins/payload-markdown/advanced/troubleshooting#fix"')
    expect(html).toContain('href="https://github.com"')
    expect(html).not.toContain('.md"')
  })
})
