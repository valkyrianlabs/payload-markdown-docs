/**
 * Real-Postgres tests for the MCP integration (`payload-markdown-docs/mcp`)
 * through the official MCP client and @payloadcms/plugin-mcp's endpoint, composed with
 * payload-markdown's MCP wrapper exactly like the dev app.
 *
 * Gated on PAYLOAD_MARKDOWN_DOCS_RUN_DB_TESTS=1 (and DATABASE_URL). The dev config imports
 * `../dist`: run `pnpm build` first.
 */
import type { Payload } from 'payload'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import config from '@payload-config'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { APIError, createLocalReq, createPayloadRequest, getPayload } from 'payload'
import { writeMarkdown } from 'payload-markdown/mcp'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import { sha256Hex } from '../src/sync/hash.js'
import {
  buildManifest,
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
let client: Client
let userId: number | string
let slug: string
let docsSetId: number | string

const apiKey = `pmdocs-mcp-${randomUUID()}`

const sync = (files: Array<{ content: string; path: string }>, extra: Record<string, unknown> = {}) =>
  callSync({ key, manifest: buildManifest(slug, files, extra), payload })

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const result = (await client.callTool({ name, arguments: args })) as {
    content: Array<{ text: string }>
    isError?: boolean
  }
  const text = result.content[0]?.text ?? ''
  let json: unknown

  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { isError: Boolean(result.isError), json: json as any, text }
}

const docBySource = async (sourcePath: string) => {
  const doc = (await findDocsBySource(payload, slug)).find((entry) => entry.sourcePath === sourcePath)

  if (!doc) {
    throw new Error(`missing doc ${sourcePath}`)
  }

  return doc
}

const mainDoc = async (id: number | string) =>
  payload.findByID({ id, collection: 'docs', depth: 0, draft: false, overrideAccess: true })

describeDb('MCP integration (real DB)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
    key = createSyncKey()
    await registerSyncKey(payload, key)

    slug = uniqueSlug('mcp')
    docsSetId = (await createDocsSet(payload, slug)).id
    expect(
      (
        await sync([
          { content: '---\ntitle: Install\n---\n# Install\n\nVersion one.\n', path: 'install.md' },
          { content: '# Usage\n', path: 'usage.md' },
        ])
      ).status,
    ).toBe(200)

    const user = await payload.create({
      collection: 'users',
      data: { email: `${slug}@example.com`, password: 'test' } as never,
      overrideAccess: true,
    })
    userId = user.id

    await payload.create({
      collection: 'payload-mcp-api-keys' as never,
      data: {
        apiKey,
        docs: { find: true, update: true },
        docsAccess: { create: true, delete: true, find: true, update: true },
        docsGroups: { create: true, delete: true, find: true, update: true },
        docsSets: { create: true, find: true, update: true },
        docsSyncRuns: { find: true },
        enableAPIKey: true,
        label: 'pmdocs MCP test',
        pages: { find: true, update: true },
        payloadMarkdownDocsAssets: { find: true },
      } as never,
      overrideAccess: false,
      user: { ...user, collection: 'users' } as never,
    })

    const endpoint = (method: string) =>
      payload.config.endpoints.find((entry) => entry.path === '/mcp' && entry.method === method)

    // Route the official MCP client straight into plugin-mcp's endpoint handler.
    const fetchViaPayload = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const payloadRequest = await createPayloadRequest({ config: payload.config, request })
      const handler = endpoint(request.method.toLowerCase())?.handler

      return handler ? handler(payloadRequest) : new Response(null, { status: 405 })
    }

    client = new Client({ name: 'payload-markdown-docs-test', version: '1.0.0' })
    await client.connect(
      new StreamableHTTPClientTransport(new URL('http://localhost/api/mcp'), {
        fetch: fetchViaPayload,
        requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
      }),
    )
  })

  afterAll(async () => {
    await client?.close()
    await payload?.destroy()
  })

  test('registers the docs tools and keeps built-in writes off Git-owned collections', async () => {
    const names = (await client.listTools()).tools.map((tool) => tool.name)

    expect(names).toEqual(expect.arrayContaining(['docsGuide', 'docsFind', 'docsUpdate', 'docsRestoreVersion', 'markdownWrite']))
    expect(names).toEqual(expect.arrayContaining(['findDocs', 'updateDocsSets', 'createDocsAccess', 'findDocsSyncRuns']))
    expect(names).not.toContain('updateDocs')
    expect(names).not.toContain('createDocs')
    expect(names).not.toContain('deleteDocs')
    expect(names).not.toContain('updatePayloadMarkdownDocsAssets')

    const { prompts } = await client.listPrompts()
    expect(prompts.map((prompt) => prompt.name)).toEqual(expect.arrayContaining(['docsManage', 'markdownEditDocument']))

    const guide = await call('docsGuide')
    expect(guide.text).toMatch(/`docs` .*This connection may: find, update\./)
    expect(guide.text).toMatch(/Git-owned \(refused\): .*`content`/)
  })

  test('payload-markdown\'s markdown tools cannot overwrite synced docs', async () => {
    const install = await docBySource('install.md')

    const read = await call('markdownRead', { id: install.id, collection: 'docs' })
    expect(read.isError).toBe(false)
    expect(read.json.docs[0].targets[0].markdown).toContain('Version one.')

    const write = await call('markdownWrite', {
      id: install.id,
      collection: 'docs',
      edits: [{ action: 'replace', markdown: '# Hijacked\n', target: 'content' }],
    })
    expect(write.isError).toBe(true)
    expect(write.json).toMatchObject({ error: 'forbidden' })

    // Even with Payload access control only (no key checks), the plugin's guard refuses it.
    const req = await createLocalReq({ user: { ...(await payload.findByID({ id: userId, collection: 'users' })), collection: 'users' } as never }, payload)
    ;(req as { payloadAPI: string }).payloadAPI = 'MCP'
    await expect(
      writeMarkdown({ id: install.id, access: 'user', collection: 'docs', edits: [{ action: 'replace', markdown: '# Hijacked\n', target: 'content' }], req }),
    ).rejects.toMatchObject({ code: 'forbidden' })

    const direct = await payload
      .update({ id: install.id, collection: 'docs', data: { content: '# Hijacked\n' }, draft: true, overrideAccess: false, req })
      .then(
        () => undefined,
        (error: unknown) => error,
      )
    expect(direct).toBeInstanceOf(APIError)
    expect((direct as APIError<{ code: string }>).data).toMatchObject({ code: 'sync_owned', fields: ['content'] })

    expect((await docBySource('install.md')).content).toContain('Version one.')
  })

  test('finds docs and changes admin-owned fields only', async () => {
    const found = await call('docsFind', { docsSet: slug })
    expect(found.isError).toBe(false)
    expect(found.json.totalDocs).toBe(2)

    const install = found.json.docs.find((doc: { sourcePath: string }) => doc.sourcePath === 'install.md')
    expect(install).toMatchObject({
      editable: expect.objectContaining({ overrides: expect.anything() }),
      sync: { contentDrift: false, fieldsDrift: false, sourceId: slug },
      title: 'Install',
    })

    const refused = await call('docsUpdate', { id: install.id, data: { content: '# Nope\n', title: 'Nope' } })
    expect(refused.json).toMatchObject({ error: 'sync_owned' })

    const draft = await call('docsUpdate', {
      id: install.id,
      data: { overrides: { hideFromNav: false, navTitle: 'Setup' } },
      ifUpdatedAt: install.updatedAt,
    })
    expect(draft.isError).toBe(false)
    expect(draft.json).toMatchObject({ fields: ['overrides'], saved: true, status: 'draft' })
    expect((await mainDoc(install.id)).overrides?.navTitle ?? null).toBeNull()

    const stale = await call('docsUpdate', { id: install.id, data: { overrides: { navTitle: 'Late' } }, ifUpdatedAt: install.updatedAt })
    expect(stale.json).toMatchObject({ error: 'conflict' })

    const published = await call('docsPublish', { id: install.id })
    expect(published.json).toMatchObject({ status: 'published' })
    const live = await mainDoc(install.id)
    expect(live.overrides?.navTitle).toBe('Setup')
    expect(live.content).toContain('Version one.')

    // Agent changes to admin-owned fields never block the next sync.
    const resync = await sync([
      { content: '---\ntitle: Install\n---\n# Install\n\nVersion two.\n', path: 'install.md' },
      { content: '# Usage\n', path: 'usage.md' },
    ])
    expect(resync.status).toBe(200)
    const after = await mainDoc(install.id)
    expect(after.content).toContain('Version two.')
    expect(after.overrides?.navTitle).toBe('Setup')
  })

  test('unpublishes and republishes', async () => {
    const usage = await docBySource('usage.md')

    expect((await call('docsPublish', { id: usage.id, action: 'unpublish' })).json).toMatchObject({ status: 'draft' })
    expect((await mainDoc(usage.id))._status).toBe('draft')
    expect((await call('docsPublish', { id: usage.id })).json).toMatchObject({ status: 'published' })
    expect((await mainDoc(usage.id))._status).toBe('published')
  })

  test('rolls back to Git snapshots only', async () => {
    const install = await docBySource('install.md')
    const listed = await call('docsVersions', { id: install.id, limit: 50 })
    expect(listed.isError).toBe(false)

    const versionOne = listed.json.versions.find(
      (version: { gitSnapshot: boolean; sync: { contentDrift: boolean } }, index: number) =>
        version.gitSnapshot && index > 0,
    )
    expect(versionOne).toBeDefined()

    const detail = await call('docsVersions', { includeContent: true, versionId: versionOne.versionId })
    expect(detail.json).toMatchObject({ restorable: true })
    expect(detail.json.changedFields).toEqual(expect.arrayContaining(['content']))
    expect(detail.json.content).toContain('Version one.')

    const restored = await call('docsRestoreVersion', { publish: true, versionId: versionOne.versionId })
    expect(restored.isError).toBe(false)
    expect(restored.json).toMatchObject({ status: 'published' })
    const live = await mainDoc(install.id)
    expect(live.content).toContain('Version one.')
    expect(live.sync?.contentHashAtLastSync).toBe(sha256Hex(String(live.content)))

    // An edit made outside Git (admin) is versioned but cannot be restored by an agent.
    await payload.update({
      id: install.id,
      collection: 'docs',
      data: { content: '# Admin edit\n' },
      draft: true,
      overrideAccess: true,
    })
    const versions = await call('docsVersions', { id: install.id })
    const adminEdit = versions.json.versions[0]
    expect(adminEdit.gitSnapshot).toBe(false)

    const refused = await call('docsRestoreVersion', { versionId: adminEdit.versionId })
    expect(refused.json).toMatchObject({ error: 'not_git_snapshot' })

    // The next sync restores Git's content over a restored Git snapshot without conflicts.
    await call('docsRestoreVersion', { versionId: versionOne.versionId })
    const resync = await sync([
      { content: '---\ntitle: Install\n---\n# Install\n\nVersion three.\n', path: 'install.md' },
      { content: '# Usage\n', path: 'usage.md' },
    ])
    expect(resync.status).toBe(200)
    expect((await mainDoc(install.id)).content).toContain('Version three.')
  })

  test('manages docs sets and groups but not their sync status', async () => {
    const structure = await call('docsStructure')
    const set = structure.json.sets.find((entry: { slug: string }) => entry.slug === slug)
    expect(set).toMatchObject({ docsCount: 2, sync: { lastStatus: 'success' } })

    const saved = await call('docsSetSave', {
      id: docsSetId,
      data: { description: 'Product docs.', meta: { description: 'SEO description', title: 'Docs' }, repositories: ['acme/docs'] },
      publish: true,
    })
    expect(saved.json).toMatchObject({ saved: true, status: 'published' })
    const stored = await payload.findByID({ id: docsSetId, collection: 'docs-sets', depth: 0, overrideAccess: true })
    expect(stored.description).toBe('Product docs.')
    expect(stored.repositories?.map((row) => row.value)).toEqual(['acme/docs'])

    const refused = await call('docsSetSave', { id: docsSetId, data: { sync: { lastStatus: 'failed' } } })
    expect(refused.json).toMatchObject({ error: 'sync_owned' })

    // The built-in docs set tool reaches the same Payload guard.
    const generic = await call('updateDocsSets', { id: String(docsSetId), sync: { lastStatus: 'failed' } })
    expect(generic.text).toMatch(/owned by payload-markdown-docs Git sync/)

    const group = await call('docsGroupSave', { data: { slug: uniqueSlug('group'), description: 'Guides for everyone.', title: 'Guides' } })
    expect(group.json).toMatchObject({ saved: true, status: 'live' })
    const groups = (await call('docsStructure')).json.groups
    expect(groups.map((entry: { id: unknown }) => entry.id)).toContain(group.json.id)
  })

  test('configures sync access and inspects sync runs', async () => {
    const { publicKey } = generateKeyPairSync('ed25519', { privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
    const keyId = uniqueSlug('agent-key')

    const created = await call('docsAccessSave', {
      data: { accessType: 'ed25519', docsSets: [docsSetId], keyId, publicKey, title: 'CI key' },
    })
    expect(created.json).toMatchObject({ saved: true })

    const listed = await call('docsAccessList', { accessType: 'ed25519', limit: 100 })
    expect(listed.json.access.find((entry: { keyId: string }) => entry.keyId === keyId)).toMatchObject({
      docsSets: [String(docsSetId)],
      title: 'CI key',
    })

    const invalid = await call('docsAccessSave', { id: created.json.id, data: { publicKey: 'not a key' } })
    expect(invalid.json).toMatchObject({ error: 'invalid_input' })

    expect((await call('docsAccessDelete', { id: created.json.id })).json).toMatchObject({ deleted: true })

    const runs = await call('docsSyncRuns', { sourceId: slug })
    expect(runs.json.totalDocs).toBeGreaterThanOrEqual(3)
    expect(runs.json.runs[0]).toMatchObject({ mode: 'sync', sourceId: slug, status: 'success' })

    const run = await call('docsSyncRuns', { id: runs.json.runs[0].id })
    expect(run.json.runs[0]).toHaveProperty('warnings')
  })
})
