/**
 * Real-Postgres tests for docs set project metadata (docs/stack.toml synced through the
 * manifest `project` key) and the public projects API.
 *
 * Gated on PAYLOAD_MARKDOWN_DOCS_RUN_DB_TESTS=1 (and DATABASE_URL). Endpoint handlers come
 * from the dev config, which imports `../dist`: run `pnpm build` first.
 */
import type { Payload } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import {
  createDocsProjectsClient,
  parseDocsProjectsListResponse,
} from '../packages/consumer/src/index.js'
import {
  buildManifest,
  callGet,
  callSync,
  createDocsSet,
  createSyncKey,
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

const stackOf = (...entries: Array<[string, ...string[]]>) =>
  entries.map(([category, ...names]) => ({ category, items: names.map((name) => ({ name })) }))

const syncProject = (slug: string, project: unknown, extra: Record<string, unknown> = {}) =>
  callSync({
    key,
    manifest: buildManifest(slug, [{ content: '# Home\n', path: 'index.md' }], {
      ...(project === undefined ? {} : { project }),
      ...extra,
    }),
    payload,
  })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mainRecord = async (id: number | string): Promise<Record<string, any>> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (await payload.findByID({ id, collection: 'docs-sets', draft: false, overrideAccess: true })) as any

/** A docs set as it looks after upgrading: the toggle did not exist when it was created. */
const makeLegacy = (id: number | string) =>
  payload.db.updateOne({
    id,
    collection: 'docs-sets',
    data: { manualTitleDescription: null },
  })

const PROJECTS_URL = 'http://localhost:3000/api/documentation/projects'

const listProjects = async (headers: Record<string, string> = {}, query = '') => {
  const response = await callGet({
    headers,
    path: '/documentation/projects',
    payload,
    url: `${PROJECTS_URL}${query}`,
  })

  return {
    etag: response.headers.get('etag'),
     
    json: response.status === 200 ? ((await response.json())) : undefined,
    response,
    status: response.status,
  }
}

const getProject = async (slug: string) => {
  const response = await callGet({
    path: '/documentation/projects/:slug',
    payload,
    routeParams: { slug },
    url: `${PROJECTS_URL}/${slug}`,
  })

   
  return { json: (await response.json()), status: response.status }
}

describeDb('docs set project metadata (real DB)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
    key = createSyncKey()
    await registerSyncKey(payload, key)
  })

  afterAll(async () => {
    await payload?.destroy()
  })

  describe('sync', () => {
    test('new docs sets take title, description and stack from stack.toml', async () => {
      const slug = uniqueSlug('project-new')
      const set = await createDocsSet(payload, slug, { description: 'Admin description' })
      const stack = stackOf(['languages', 'C++23', 'TypeScript'], ['databases', 'PostgreSQL'])

      expect((await mainRecord(set.id)).manualTitleDescription).toBe(false)

      const result = await syncProject(slug, { description: 'Agent description', stack, title: 'Agent Title' })

      expect(result.status).toBe(200)
      expect(result.json.project).toEqual({
        applied: true,
        description: 'updated',
        stack: 'updated',
        title: 'updated',
      })

      const stored = await mainRecord(set.id)
      expect(stored.title).toBe('Agent Title')
      expect(stored.description).toBe('Agent description')
      expect(stored.stack).toEqual(stack)
      expect(stored.sync).toMatchObject({
        lastStatus: 'success',
        projectDescription: 'Agent description',
        projectTitle: 'Agent Title',
      })
      expect(stored.slug).toBe(slug)

      const again = await syncProject(slug, { description: 'Agent description', stack, title: 'Agent Title' })
      expect(again.json.project).toEqual({
        applied: true,
        description: 'unchanged',
        stack: 'unchanged',
        title: 'unchanged',
      })
    })

    test('docs sets that predate the toggle keep their admin title and description', async () => {
      const slug = uniqueSlug('project-legacy')
      const set = await createDocsSet(payload, slug, { description: 'Admin description', title: 'Admin Title' })
      await makeLegacy(set.id)

      expect((await mainRecord(set.id)).manualTitleDescription).toBe(true)

      const result = await syncProject(slug, {
        description: 'Agent description',
        stack: stackOf(['languages', 'Go']),
        title: 'Agent Title',
      })

      expect(result.json.project).toEqual({
        applied: true,
        description: 'manual',
        stack: 'updated',
        title: 'manual',
      })

      const stored = await mainRecord(set.id)
      expect(stored.title).toBe('Admin Title')
      expect(stored.description).toBe('Admin description')
      expect(stored.stack).toEqual(stackOf(['languages', 'Go']))
      expect(stored.sync.projectTitle).toBe('Agent Title')
    })

    test('missing values never blank fields, and an absent project changes nothing', async () => {
      const slug = uniqueSlug('project-partial')
      const set = await createDocsSet(payload, slug, { description: 'Kept', title: 'Kept Title' })

      const partial = await syncProject(slug, { stack: stackOf(['tooling', 'Meson']) })
      expect(partial.json.project).toEqual({
        applied: true,
        description: 'not_provided',
        stack: 'updated',
        title: 'not_provided',
      })
      expect(await mainRecord(set.id)).toMatchObject({ description: 'Kept', title: 'Kept Title' })

      await syncProject(slug, { title: 'From Agent' })
      const withoutStackKey = await mainRecord(set.id)
      expect(withoutStackKey.title).toBe('From Agent')
      expect(withoutStackKey.stack).toEqual(stackOf(['tooling', 'Meson']))

      const absent = await syncProject(slug, undefined)
      expect(absent.status).toBe(200)
      expect(absent.json).not.toHaveProperty('project')

      const stored = await mainRecord(set.id)
      expect(stored.title).toBe('From Agent')
      expect(stored.stack).toEqual(stackOf(['tooling', 'Meson']))
      expect(stored.sync.projectTitle).toBe('From Agent')
    })

    test('an explicitly empty stack clears it', async () => {
      const slug = uniqueSlug('project-clear')
      const set = await createDocsSet(payload, slug)

      await syncProject(slug, { stack: stackOf(['languages', 'Rust']) })
      const cleared = await syncProject(slug, { stack: [] })

      expect(cleared.json.project.stack).toBe('cleared')
      expect((await mainRecord(set.id)).stack).toEqual([])
    })

    test('dry runs report the outcome without writing', async () => {
      const slug = uniqueSlug('project-dry')
      const set = await createDocsSet(payload, slug, { title: 'Before' })

      const result = await syncProject(
        slug,
        { stack: stackOf(['languages', 'C']), title: 'After' },
        { mode: 'dry-run' },
      )

      expect(result.json.project).toEqual({
        applied: false,
        description: 'not_provided',
        stack: 'updated',
        title: 'updated',
      })
      const stored = await mainRecord(set.id)
      expect(stored.title).toBe('Before')
      expect(stored.stack ?? null).toBeNull()
    })

    test('invalid project metadata rejects the sync with stack.toml paths', async () => {
      const slug = uniqueSlug('project-invalid')
      await createDocsSet(payload, slug)

      const result = await syncProject(slug, { stack: [{ category: 'languages', items: [{ name: '' }] }] })

      expect(result.status).toBe(400)
      expect(result.json.error.issues).toEqual([
        expect.objectContaining({ code: 'invalid_stack_item', path: 'stack.languages[0].name', severity: 'error' }),
      ])
    })
  })

  describe('admin ownership and saved versions', () => {
    test('manual mode keeps admin edits across syncs; agent mode reapplies the agent title', async () => {
      const slug = uniqueSlug('project-owner')
      const set = await createDocsSet(payload, slug)
      await syncProject(slug, { title: 'Agent Title' })

      await payload.update({
        id: set.id,
        collection: 'docs-sets',
        data: { title: 'Admin Edit' } as never,
        overrideAccess: true,
      })
      expect((await mainRecord(set.id)).title).toBe('Agent Title')

      await payload.update({
        id: set.id,
        collection: 'docs-sets',
        data: { manualTitleDescription: true, title: 'Admin Edit' } as never,
        overrideAccess: true,
      })
      expect((await mainRecord(set.id)).title).toBe('Admin Edit')

      const result = await syncProject(slug, { title: 'Agent Title 2' })
      expect(result.json.project.title).toBe('manual')
      expect((await mainRecord(set.id)).title).toBe('Admin Edit')

      await payload.update({
        id: set.id,
        collection: 'docs-sets',
        data: { manualTitleDescription: false } as never,
        overrideAccess: true,
      })
      expect((await mainRecord(set.id)).title).toBe('Agent Title 2')
    })

    test('publishing an older draft or restoring a version keeps Git-owned metadata', async () => {
      const slug = uniqueSlug('project-versions')
      const set = await createDocsSet(payload, slug, { title: 'Original' })
      const firstStack = stackOf(['languages', 'C'])
      const secondStack = stackOf(['languages', 'C', 'Zig'], ['tooling', 'Meson'])

      await syncProject(slug, { stack: firstStack, title: 'Agent One' })
      await payload.update({
        id: set.id,
        collection: 'docs-sets',
        data: { description: 'Draft description' } as never,
        draft: true,
        overrideAccess: true,
      })
      await syncProject(slug, { stack: secondStack, title: 'Agent Two' })

      await payload.update({
        id: set.id,
        collection: 'docs-sets',
        data: { _status: 'published' } as never,
        draft: false,
        overrideAccess: true,
      })

      const published = await mainRecord(set.id)
      expect(published.description).toBe('Draft description')
      expect(published.title).toBe('Agent Two')
      expect(published.stack).toEqual(secondStack)

      const versions = await payload.findVersions({
        collection: 'docs-sets',
        overrideAccess: true,
        sort: 'createdAt',
        where: { parent: { equals: set.id } },
      })
      const oldest = versions.docs[0]
      expect(oldest).toBeDefined()

      await payload.restoreVersion({ id: oldest.id, collection: 'docs-sets', overrideAccess: true })

      const restored = await mainRecord(set.id)
      expect(restored.title).toBe('Agent Two')
      expect(restored.stack).toEqual(secondStack)
      expect(restored.sync.projectTitle).toBe('Agent Two')
    })

    test('admin and API writes cannot set the stack', async () => {
      const slug = uniqueSlug('project-readonly')
      const set = await createDocsSet(payload, slug, { stack: stackOf(['languages', 'Forged']) })
      expect((await mainRecord(set.id)).stack ?? null).toBeNull()

      await syncProject(slug, { stack: stackOf(['languages', 'Real']) })
      await payload.update({
        id: set.id,
        collection: 'docs-sets',
        data: { stack: stackOf(['languages', 'Forged']) } as never,
        overrideAccess: true,
      })
      expect((await mainRecord(set.id)).stack).toEqual(stackOf(['languages', 'Real']))
    })
  })

  describe('public projects API', () => {
    test('lists published docs sets only, with an allowlisted shape', async () => {
      const groupSlug = uniqueSlug('products')
      const group = await payload.create({
        collection: 'docs-groups',
        data: { slug: groupSlug, title: 'Products' } as never,
        overrideAccess: true,
      })
      const published = uniqueSlug('api-published')
      const ungrouped = uniqueSlug('api-ungrouped')
      const draft = uniqueSlug('api-draft')

      await createDocsSet(payload, published, {
        allowPullRequests: true,
        group: group.id,
        meta: { description: 'SEO description', title: 'SEO Title' },
        repositories: [{ value: 'owner/secret-repo' }],
        title: 'Published',
      })
      await createDocsSet(payload, ungrouped, { description: 'Plain', title: 'Ungrouped' })
      await createDocsSet(payload, draft, { _status: 'draft', title: 'Draft only' })
      await syncProject(published, { stack: stackOf(['languages', 'C++23'], ['libraries', 'libpqxx']) })

      const { json, status } = await listProjects()
      expect(status).toBe(200)
      expect(json.schemaVersion).toBe(1)

      const slugs = json.projects.map((project: { slug: string }) => project.slug)
      expect(slugs).toContain(published)
      expect(slugs).toContain(ungrouped)
      expect(slugs).not.toContain(draft)
      expect(json.groups).toContainEqual({ slug: groupSlug, title: 'Products' })

      const project = json.projects.find((entry: { slug: string }) => entry.slug === published)
      expect(Object.keys(project).sort()).toEqual(
        ['description', 'group', 'lastSyncedAt', 'seo', 'slug', 'stack', 'title', 'updatedAt', 'urls'].sort(),
      )
      expect(project).toMatchObject({
        group: { slug: groupSlug, title: 'Products' },
        seo: { description: 'SEO description', image: null, title: 'SEO Title' },
        stack: stackOf(['languages', 'C++23'], ['libraries', 'libpqxx']),
        title: 'Published',
      })
      expect(project.urls.product).toMatch(new RegExp(`^https?://[^/]+/${groupSlug}/${published}$`))
      expect(project.urls.docs).toBe(project.urls.product)
      expect(typeof project.lastSyncedAt).toBe('string')

      const serialized = JSON.stringify(json)
      expect(serialized).not.toContain('secret-repo')
      expect(serialized).not.toContain('allowPullRequests')
      expect(serialized).not.toContain('advancedSecurity')
      expect(serialized).not.toContain('branch')

      const plain = json.projects.find((entry: { slug: string }) => entry.slug === ungrouped)
      expect(plain).toMatchObject({
        description: 'Plain',
        group: null,
        seo: { description: 'Plain', image: null, title: 'Ungrouped' },
        stack: [],
      })

      const filtered = await listProjects({}, `?group=${groupSlug}`)
      expect(filtered.json.projects.map((entry: { slug: string }) => entry.slug)).toEqual([published])
      expect(filtered.json.groups).toEqual([{ slug: groupSlug, title: 'Products' }])
    })

    test('single project lookup returns published sets and 404s otherwise', async () => {
      const slug = uniqueSlug('api-single')
      const draft = uniqueSlug('api-single-draft')
      await createDocsSet(payload, slug, { title: 'Single' })
      await createDocsSet(payload, draft, { _status: 'draft' })

      const found = await getProject(slug)
      expect(found.status).toBe(200)
      expect(found.json).toMatchObject({ project: { slug, title: 'Single' }, schemaVersion: 1 })

      for (const missing of [draft, 'does-not-exist']) {
        const response = await getProject(missing)
        expect(response.status).toBe(404)
        expect(response.json).toMatchObject({ error: { code: 'not_found' }, schemaVersion: 1 })
      }
    })

    test('ETags follow the response: additions, changes, group renames and deletions', async () => {
      const first = await listProjects()
      expect(first.etag).toMatch(/^"[\w-]+"$/)
      expect(first.response.headers.get('cache-control')).toContain('public')

      const notModified = await listProjects({ 'If-None-Match': first.etag! })
      expect(notModified.status).toBe(304)
      expect(await notModified.response.text()).toBe('')
      expect((await listProjects({ 'If-None-Match': `W/${first.etag}` })).status).toBe(304)
      expect((await listProjects({ 'If-None-Match': '"other", ' + first.etag })).status).toBe(304)

      const groupSlug = uniqueSlug('etag-group')
      const group = await payload.create({
        collection: 'docs-groups',
        data: { slug: groupSlug, title: 'Group A' } as never,
        overrideAccess: true,
      })
      const slug = uniqueSlug('api-etag')
      const set = await createDocsSet(payload, slug, { group: group.id })
      const added = await listProjects({ 'If-None-Match': first.etag! })
      expect(added.status).toBe(200)
      expect(added.etag).not.toBe(first.etag)

      await syncProject(slug, { stack: stackOf(['languages', 'Go']) })
      const changed = await listProjects()
      expect(changed.etag).not.toBe(added.etag)

      await payload.update({
        id: group.id,
        collection: 'docs-groups',
        data: { title: 'Group B' } as never,
        overrideAccess: true,
      })
      const renamed = await listProjects()
      expect(renamed.etag).not.toBe(changed.etag)
      expect(renamed.json.groups).toContainEqual({ slug: groupSlug, title: 'Group B' })

      expect((await listProjects()).etag).toBe(renamed.etag)

      await payload.delete({ id: set.id, collection: 'docs-sets', overrideAccess: true })
      const deleted = await listProjects({ 'If-None-Match': renamed.etag! })
      expect(deleted.status).toBe(200)
      expect(deleted.etag).not.toBe(renamed.etag)
    })

    test('the consumer parses the live response without warnings', async () => {
      const slug = uniqueSlug('api-parse')
      await createDocsSet(payload, slug)
      await syncProject(slug, { stack: stackOf(['languages', 'C'], ['security', 'libsodium']) })

      const parsed = parseDocsProjectsListResponse((await listProjects()).json)

      expect(parsed.ok).toBe(true)
      expect(parsed.ok && parsed.warnings).toEqual([])
    })
  })

  describe('end to end: stack.toml -> sync -> consumer', () => {
    test('a technology added in Git reaches a multi-site consumer', async () => {
      const groupSlug = uniqueSlug('e2e-group')
      const group = await payload.create({
        collection: 'docs-groups',
        data: { slug: groupSlug, title: 'E2E' } as never,
        overrideAccess: true,
      })
      const slug = uniqueSlug('e2e')
      await createDocsSet(payload, slug, { group: group.id })

      // Two "sites" served by this Payload instance; the consumer only sees URLs.
      const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = new URL(input instanceof Request ? input.url : input.toString())
        const projectSlug = url.pathname.match(/\/api\/documentation\/projects\/([^/]+)$/)?.[1]

        return callGet({
          headers: Object.fromEntries(new Headers(init?.headers)),
          path: projectSlug ? '/documentation/projects/:slug' : '/documentation/projects',
          payload,
          routeParams: projectSlug ? { slug: decodeURIComponent(projectSlug) } : undefined,
          url: url.toString(),
        })
      }
      const client = createDocsProjectsClient({
        fetch,
        sites: [
          { id: 'alpha', baseUrl: 'http://alpha.test' },
          { id: 'beta', baseUrl: 'http://beta.test' },
        ],
      })
      const technologiesOf = async () => {
        const result = await client.getProjects({ groups: [groupSlug] })

        expect(result.complete).toBe(true)

        return result.projects.map((entry) => [entry.key, entry.groupKey, entry.stack])
      }

      await syncProject(slug, { stack: stackOf(['languages', 'C++23']) })
      expect(await technologiesOf()).toEqual([
        [`alpha/${slug}`, `alpha/${groupSlug}`, stackOf(['languages', 'C++23'])],
        [`beta/${slug}`, `beta/${groupSlug}`, stackOf(['languages', 'C++23'])],
      ])

      await syncProject(slug, { stack: stackOf(['languages', 'C++23'], ['libraries', 'libpqxx']) })
      expect(await technologiesOf()).toEqual([
        [`alpha/${slug}`, `alpha/${groupSlug}`, stackOf(['languages', 'C++23'], ['libraries', 'libpqxx'])],
        [`beta/${slug}`, `beta/${groupSlug}`, stackOf(['languages', 'C++23'], ['libraries', 'libpqxx'])],
      ])

      const single = await client.getProject('beta', slug)
      expect(single.ok && single.project.stack).toEqual(stackOf(['languages', 'C++23'], ['libraries', 'libpqxx']))
    })
  })
})
