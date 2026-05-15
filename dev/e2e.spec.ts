import type { APIRequestContext } from '@playwright/test'

import { expect, test } from '@playwright/test'

type RawRouteExpectation = {
  contentType: string
  text: string
  url: string
}

const htmlMarkers = ['<!DOCTYPE html', '<html', '__next', 'text/html']

const expectRawRoute = async ({
  contentType,
  request,
  text,
  url,
}: {
  request: APIRequestContext
} & RawRouteExpectation) => {
  const response = await request.get(url)
  const headers = response.headers()
  const body = await response.text()

  expect(response.status(), `${url} status`).toBe(200)
  expect(headers['content-type'], `${url} content-type`).toContain(contentType)
  expect(headers['content-type'], `${url} is not HTML`).not.toContain('text/html')
  expect(body, `${url} body`).toContain(text)

  for (const marker of htmlMarkers) {
    expect(body, `${url} should not include ${marker}`).not.toContain(marker)
  }
}

test('serves AI assets from public root routes as raw text', async ({ request }) => {
  const expectations: RawRouteExpectation[] = [
    {
      contentType: 'text/plain',
      text: 'Generated index for published documentation packages',
      url: '/llms.txt',
    },
    {
      contentType: 'text/plain',
      text: 'AI Documentation Index',
      url: '/llms-full.txt',
    },
    {
      contentType: 'text/plain',
      text: 'Local dev docs set for end-to-end dedicated docs testing',
      url: '/plugins/payload-markdown-docs/llms.txt',
    },
    {
      contentType: 'text/plain',
      text: 'Payload Markdown Docs Full Documentation',
      url: '/plugins/payload-markdown-docs/llms-full.txt',
    },
    {
      contentType: 'text/markdown',
      text: 'Codex Skill',
      url: '/plugins/payload-markdown-docs/skills/codex',
    },
    {
      contentType: 'text/markdown',
      text: 'Codex Skill',
      url: '/plugins/payload-markdown-docs/skills/codex/SKILL.md',
    },
    {
      contentType: 'text/markdown',
      text: 'Codex Workflow',
      url: '/plugins/payload-markdown-docs/skills/codex/reference/workflow.md',
    },
    {
      contentType: 'text/markdown',
      text: 'Claude Skill',
      url: '/plugins/payload-markdown-docs/skills/claude',
    },
    {
      contentType: 'text/markdown',
      text: 'Claude Skill',
      url: '/plugins/payload-markdown-docs/skills/claude/SKILL.md',
    },
  ]

  for (const expectation of expectations) {
    await expectRawRoute({
      ...expectation,
      request,
    })
  }
})

test('serves missing AI assets as plain text 404 responses', async ({ request }) => {
  const response = await request.get('/plugins/payload-markdown-docs/skills/codex/missing.md')
  const body = await response.text()

  expect(response.status()).toBe(404)
  expect(response.headers()['content-type']).toContain('text/plain')

  for (const marker of htmlMarkers) {
    expect(body).not.toContain(marker)
  }
})
