/**
 * Real-Postgres regression tests for the docs sync endpoint and the public read side.
 *
 * Gated on PAYLOAD_MARKDOWN_DOCS_RUN_DB_TESTS=1 (and DATABASE_URL). These scenarios were
 * only reproducible with real Payload semantics (drafts/versions, unique indexes, default
 * access), which the mocked unit tests cannot model. Endpoint handlers come from the dev
 * config, which imports `../dist`: run `pnpm build` first.
 */
import type { Payload } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import { resolvePayloadMarkdownDocsRoute } from '../src/next/route.js'
import {
  buildManifest,
  callGet,
  callSync,
  createDocsSet,
  createSyncKey,
  findDocsBySource,
  registerSyncKey,
  runDbTests,
  type SyncKey,
  uniqueSlug,
} from './helpers/syncHarness.js'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

const describeDb = runDbTests ? describe : describe.skip

let payload: Payload
let key: SyncKey

const sync = (manifest: unknown, options: { nonce?: string; timestamp?: Date } = {}) =>
  callSync({ key, manifest, payload, ...options })

const getLlms = async (slug: string, file: 'llms.txt' | 'llms-full.txt' = 'llms-full.txt') => {
  const response = await callGet({
    path: `/:routeBase*/${file}`,
    payload,
    url: `http://localhost:3000/${slug}/${file}`,
  })

  return {
    status: response.status,
    text: await response.text(),
  }
}

describeDb('docs sync real-DB regressions', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
    key = createSyncKey()
    await registerSyncKey(payload, key)
  })

  afterAll(async () => {
    await payload?.destroy()
  })

  describe('public visibility (DOCS-1, DOCS-12)', () => {
    test('non-publish (draft) docs never appear in llms.txt / llms-full.txt', async () => {
      const slug = uniqueSlug('vis')
      await createDocsSet(payload, slug)
      const published = await sync(
        buildManifest(slug, [{ content: '# Public\n\nPUBLIC-CONTENT\n', path: 'public.md' }]),
      )
      expect(published.status).toBe(200)

      const draft = await sync(
        buildManifest(
          slug,
          [
            { content: '# Public\n\nPUBLIC-CONTENT\n', path: 'public.md' },
            { content: '# Secret Draft\n\nUNRELEASED-CONTENT-123\n', path: 'secret.md' },
          ],
          { publish: false },
        ),
      )
      expect(draft.status).toBe(200)

      const route = await resolvePayloadMarkdownDocsRoute({
        path: `/${slug}/secret`,
        payload: payload as never,
      })
      expect(route).toBeNull()

      const full = await getLlms(slug, 'llms-full.txt')
      expect(full.status).toBe(200)
      expect(full.text).toContain('PUBLIC-CONTENT')
      expect(full.text).not.toContain('UNRELEASED-CONTENT-123')
      expect(full.text).not.toContain('Secret Draft')

      const index = await getLlms(slug, 'llms.txt')
      expect(index.text).not.toContain('Secret Draft')

      const rootFull = await callGet({
        path: '/llms-full.txt',
        payload,
        url: 'http://localhost:3000/llms-full.txt',
      })
      expect(await rootFull.text()).not.toContain('UNRELEASED-CONTENT-123')
    })

    test('draft-only docs sets are not served by llms endpoints or the root index', async () => {
      const slug = uniqueSlug('vis-set')
      await createDocsSet(payload, slug, { _status: 'draft' })
      await payload.create({
        collection: 'docs',
        data: {
          _status: 'published',
          content: '# Hidden set doc\n\nHIDDEN-SET-CONTENT\n',
          docsSet: undefined,
          route: `/${slug}/page`,
          sourcePath: 'page.md',
          sync: { managedBy: 'payload-markdown-docs', sourceId: slug },
          title: 'Hidden set doc',
        } as never,
        overrideAccess: true,
      })

      expect((await getLlms(slug, 'llms-full.txt')).status).toBe(404)

      const rootIndex = await callGet({
        path: '/llms.txt',
        payload,
        url: 'http://localhost:3000/llms.txt',
      })
      expect(await rootIndex.text()).not.toContain(`/${slug}`)
    })

    test('sitemap excludes draft-only docs', async () => {
      const { getDocsForSitemap } = await import('../src/next/sitemap.js')
      const slug = uniqueSlug('sitemap')
      const set = await createDocsSet(payload, slug)
      await payload.create({
        collection: 'docs',
        data: {
          _status: 'draft',
          content: '# Draft',
          docsSet: set.id,
          route: `/${slug}/draft-only`,
          sourcePath: 'draft-only.md',
          sync: { managedBy: 'payload-markdown-docs', sourceId: slug },
          title: 'Draft only',
        } as never,
        draft: true,
        overrideAccess: true,
      })
      await payload.create({
        collection: 'docs',
        data: {
          _status: 'published',
          content: '# Live',
          docsSet: set.id,
          route: `/${slug}/live`,
          sourcePath: 'live.md',
          sync: { managedBy: 'payload-markdown-docs', sourceId: slug },
          title: 'Live',
        } as never,
        overrideAccess: true,
      })

      const entries = await getDocsForSitemap({
        payload: payload as never,
        siteUrl: 'https://site.test',
      } as never)
      const urls = entries.map((entry) => entry.url)

      expect(urls).toContain(`https://site.test/${slug}/live`)
      expect(urls.some((url) => url.includes('draft-only'))).toBe(false)
    })

    test('selecting _status on a collection without drafts does not throw', async () => {
      await expect(
        payload.find({
          collection: 'posts',
          depth: 0,
          draft: false,
          limit: 1,
          select: { _status: true } as never,
        }),
      ).resolves.toBeDefined()
    })

    test('findDocsBySource helper sees synced docs', async () => {
      const slug = uniqueSlug('helper')
      await createDocsSet(payload, slug)
      await sync(buildManifest(slug, [{ content: '# A\n', path: 'a.md' }]))
      expect((await findDocsBySource(payload, slug)).map((doc) => doc.sourcePath)).toEqual([
        'a.md',
      ])
    })
  })
})
