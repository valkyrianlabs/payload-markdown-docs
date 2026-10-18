import type { SanitizedCollectionConfig, SanitizedConfig } from 'payload'

import { APIError, buildConfig } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { MANAGED_BY } from '../constants.js'
import { payloadMarkdownDocs } from '../plugin.js'
import {
  getDocsCollectionMarker,
  getSyncOwnedDocsFields,
  isAgentRequest,
  isSameFieldValue,
  PAYLOAD_MARKDOWN_DOCS_MCP_CONTEXT_KEY,
  PAYLOAD_MARKDOWN_DOCS_RESTORE_CONTEXT_KEY,
} from './agentGuard.js'
import { buildArchiveData, buildDocsData } from './docsData.js'

const fakeDb = { defaultIDType: 'number', init: () => ({}) } as never

let config: SanitizedConfig

const collection = (slug: string): SanitizedCollectionConfig => {
  const found = config.collections.find((entry) => entry.slug === slug)

  if (!found) {
    throw new Error(`missing collection ${slug}`)
  }

  return found
}

const mcpReq = (context: Record<string, unknown> = {}) => ({ context, payloadAPI: 'MCP' })

const storedDoc = {
  id: 7,
  _status: 'published',
  content: '# Install\n',
  description: 'How to install.',
  heroImage: null,
  order: 2,
  overrides: { hideFromNav: false, navTitle: null },
  route: '/docs/install',
  sourcePath: 'install.md',
  sync: {
    archived: false,
    contentHashAtLastSync: 'abc',
    managedBy: MANAGED_BY,
    sourceId: 'docs',
  },
  title: 'Install',
}

/** Runs the guard (the first beforeChange hook); a synchronous throw becomes a rejection. */
const runBeforeChange = ({
  slug = 'docs',
  data,
  operation = 'update',
  originalDoc = storedDoc,
  req = mcpReq(),
}: {
  data: Record<string, unknown>
  operation?: 'create' | 'update'
  originalDoc?: Record<string, unknown>
  req?: Record<string, unknown>
  slug?: string
}): Promise<unknown> => {
  const target = collection(slug)
  const hook = target.hooks.beforeChange[0]

  return Promise.resolve().then(() =>
    hook?.({
      collection: target,
      context: {},
      data,
      operation,
      originalDoc,
      req: req as never,
    } as never),
  )
}

const rejection = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )

  expect(error).toBeInstanceOf(APIError)

  return error as APIError<{ code: string; fields: string[] }>
}

beforeAll(async () => {
  config = await buildConfig({
    collections: [
      { slug: 'users', auth: true, fields: [] },
      { slug: 'media', fields: [], upload: true },
    ],
    db: fakeDb,
    plugins: [payloadMarkdownDocs({ target: { enableDrafts: true } })],
    secret: 'test',
  })
})

describe('sync-owned fields', () => {
  it('cover every field the sync endpoint writes', () => {
    const desired = {
      content: '# Hi\n',
      frontmatter: { description: 'd', navTitle: 'n', order: 1 },
      path: 'hi.md',
      route: '/docs/hi',
      sha256: 'x',
      title: 'Hi',
    }
    const written = [
      ...Object.keys(
        buildDocsData({
          desired: desired as never,
          docsEnableDrafts: true,
          docsSetId: 1,
          manifest: { source: { id: 'docs' } } as never,
          markdownFieldName: 'body',
          now: new Date(),
          publish: true,
          syncRunId: 1,
        }),
      ),
      ...Object.keys(buildArchiveData({ now: new Date(), releasedRoute: 'archived:1' })),
    ].filter((key) => key !== '_status')

    expect(getSyncOwnedDocsFields('body')).toEqual(expect.arrayContaining([...new Set(written)]))
  })

  it('tags every plugin collection with its role and policy', () => {
    expect(getDocsCollectionMarker(collection('docs'))).toMatchObject({
      agentPolicy: { create: false, delete: false },
      markdownField: 'content',
      role: 'docs',
    })
    expect(getDocsCollectionMarker(collection('docs-sets'))?.agentPolicy).toEqual({
      create: true,
      delete: true,
      syncOwnedFields: ['stack', 'sync'],
    })
    expect(getDocsCollectionMarker(collection('docs-sync-runs'))?.agentPolicy?.syncOwnedFields).toBe('*')
    expect(getDocsCollectionMarker(collection('docs-groups'))).toEqual({ role: 'docsGroups' })
    expect(getDocsCollectionMarker(collection('docs-access'))).toEqual({ role: 'docsAccess' })
    expect(getDocsCollectionMarker(collection('users'))).toBeUndefined()
  })
})

describe('isSameFieldValue', () => {
  it('treats empty values, dates, ids and populated relationships loosely', () => {
    expect(isSameFieldValue(null, undefined)).toBe(true)
    expect(isSameFieldValue('', null)).toBe(true)
    expect(isSameFieldValue(new Date('2026-01-01T00:00:00.000Z'), '2026-01-01T00:00:00.000Z')).toBe(true)
    expect(isSameFieldValue('5', 5)).toBe(true)
    expect(isSameFieldValue(5, { id: 5, title: 'Set' })).toBe(true)
    expect(isSameFieldValue({ id: 6 }, 5)).toBe(false)
    expect(isSameFieldValue(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(isSameFieldValue('# New', '# Old')).toBe(false)
    expect(isSameFieldValue('x', undefined)).toBe(false)
  })

  it('accepts static defaults Payload fills in for missing stored values', () => {
    const field = {
      name: 'sync',
      flattenedFields: [
        { name: 'archived', defaultValue: false },
        { name: 'managedBy', defaultValue: MANAGED_BY },
        { name: 'sourceId' },
      ],
    }

    expect(isSameFieldValue({ archived: false, managedBy: MANAGED_BY }, undefined, field)).toBe(true)
    expect(isSameFieldValue({ archived: false, managedBy: MANAGED_BY }, { sourceId: null }, field)).toBe(true)
    expect(isSameFieldValue({ archived: true }, {}, field)).toBe(false)
    expect(isSameFieldValue({ sourceId: 'other' }, { sourceId: 'docs' }, field)).toBe(false)
  })
})

describe('isAgentRequest', () => {
  it('detects plugin-mcp requests and requests marked by withPayloadMarkdownDocsMcp()', () => {
    expect(isAgentRequest({ payloadAPI: 'MCP' } as never)).toBe(true)
    expect(isAgentRequest({ context: { [PAYLOAD_MARKDOWN_DOCS_MCP_CONTEXT_KEY]: { permissions: {} } }, payloadAPI: 'REST' })).toBe(true)
    expect(isAgentRequest({ context: {}, payloadAPI: 'REST' })).toBe(false)
    expect(isAgentRequest({ payloadAPI: 'local' })).toBe(false)
    expect(isAgentRequest(undefined)).toBe(false)
  })
})

describe('docs guard', () => {
  it('rejects agent changes to Git-owned fields and names them', async () => {
    const error = await rejection(
      runBeforeChange({ data: { ...storedDoc, content: '# Rewritten\n', title: 'Other' } }),
    )

    expect(error.status).toBe(403)
    expect(error.isPublic).toBe(true)
    expect(error.data).toMatchObject({ code: 'sync_owned', collection: 'docs', fields: ['title', 'content'] })
    expect(error.message).toContain('owned by payload-markdown-docs Git sync')
  })

  it('allows admin-owned fields, publishing, and unchanged Git-owned values', async () => {
    const data = {
      ...storedDoc,
      _status: 'draft',
      heroImage: 3,
      overrides: { hideFromNav: true, navTitle: 'Setup' },
      publishedAt: '2026-10-01T00:00:00.000Z',
      sync: { ...storedDoc.sync, managedBy: MANAGED_BY },
    }

    await expect(runBeforeChange({ data })).resolves.toBe(data)
  })

  it('leaves the sync endpoint, the admin and REST clients alone', async () => {
    const data = { ...storedDoc, content: '# From Git\n' }

    await expect(runBeforeChange({ data, req: { context: {}, payloadAPI: 'local' } })).resolves.toBe(data)
    await expect(runBeforeChange({ data, req: { context: {}, payloadAPI: 'REST' } })).resolves.toBe(data)
  })

  it('lets the restore tool roll back to a Git snapshot', async () => {
    const data = { ...storedDoc, content: '# Older version from Git\n' }

    await expect(
      runBeforeChange({ data, req: mcpReq({ [PAYLOAD_MARKDOWN_DOCS_RESTORE_CONTEXT_KEY]: true }) }),
    ).resolves.toBe(data)
  })

  it('refuses agent creates and deletes of generated docs', async () => {
    const created = await rejection(runBeforeChange({ data: { title: 'New' }, operation: 'create', originalDoc: {} }))
    expect(created.message).toContain('created by payload-markdown-docs Git sync')

    const hook = collection('docs').hooks.beforeDelete[0]
    const deleted = await rejection(
      Promise.resolve().then(() => hook?.({ id: 7, collection: collection('docs'), context: {}, req: mcpReq() } as never)),
    )
    expect(deleted.message).toContain('removed by payload-markdown-docs Git sync')

    await expect(
      Promise.resolve().then(() =>
        hook?.({ id: 7, collection: collection('docs'), context: {}, req: { context: {}, payloadAPI: 'REST' } } as never),
      ),
    ).resolves.toBeUndefined()
  })
})

describe('docs sets, assets and audit collections', () => {
  const set = { id: 1, slug: 'docs', sync: { lastStatus: 'success', lastSyncedAt: '2026-10-01T00:00:00.000Z' }, title: 'Docs' }

  it('lets agents edit docs sets but not their sync status', async () => {
    const data = { ...set, description: 'All the docs', title: 'Product docs' }
    await expect(runBeforeChange({ slug: 'docs-sets', data, originalDoc: set })).resolves.toBe(data)

    const error = await rejection(
      runBeforeChange({ slug: 'docs-sets', data: { ...set, sync: { lastStatus: 'failed' } }, originalDoc: set }),
    )
    expect(error.data.fields).toEqual(['sync'])

    await expect(
      runBeforeChange({ slug: 'docs-sets', data: { slug: 'new', sync: {}, title: 'New' }, operation: 'create', originalDoc: {} }),
    ).resolves.toBeDefined()
    await rejection(
      runBeforeChange({ slug: 'docs-sets', data: { slug: 'new', sync: { lastStatus: 'success' }, title: 'New' }, operation: 'create', originalDoc: {} }),
    )
  })

  it('keeps synced assets and sync runs read-only for agents', async () => {
    for (const slug of ['payload-markdown-docs-assets', 'docs-sync-runs', 'docs-sync-nonces']) {
      const error = await rejection(runBeforeChange({ slug, data: { content: 'x' }, originalDoc: { content: 'y' } }))
      expect(error.data.code).toBe('sync_owned')
    }
  })
})
