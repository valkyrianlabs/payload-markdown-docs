import type { SanitizedConfig } from 'payload'

import { withPayloadMarkdownMcp } from '@valkyrianlabs/payload-markdown/mcp'
import { buildConfig } from 'payload'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { PAYLOAD_MARKDOWN_DOCS_MCP_CONTEXT_KEY } from '../payload/agentGuard.js'
import { payloadMarkdownDocs } from '../plugin.js'
import {
  getDocsGuide,
  PAYLOAD_MARKDOWN_DOCS_MCP_READ_ONLY_TOOLS,
  payloadMarkdownDocsMcpTools,
  withPayloadMarkdownDocsMcp,
} from './index.js'

const fakeDb = { defaultIDType: 'number', init: () => ({}) } as never

type Options = {
  collections: Record<string, { description?: string; enabled: unknown } | undefined>
  mcp: { prompts: Array<{ name: string }>; tools: Array<{ name: string }> }
  overrideAuth: (req: unknown, getDefault: () => Promise<unknown>) => Promise<Record<string, unknown>>
}

const DOCS_TOOLS = [
  'docsGuide',
  'docsStructure',
  'docsFind',
  'docsUpdate',
  'docsPublish',
  'docsVersions',
  'docsRestoreVersion',
  'docsSetSave',
  'docsGroupSave',
  'docsAccessList',
  'docsAccessSave',
  'docsAccessDelete',
  'docsSyncRuns',
]

let config: SanitizedConfig

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

const keySettings = () => ({
  docs: { find: true, update: true },
  docsGroups: { create: true, find: true, update: true },
  docsSets: { find: true, update: true },
  docsSyncRuns: { find: true },
  pages: { find: true, update: true },
  'payload-mcp-tool': { docsFind: true },
  payloadMarkdownDocsAssets: { find: true },
  user: { id: 1, collection: 'users' },
})

const fakeReq = (collections: unknown[] = []) => ({
  context: {} as Record<string, unknown>,
  payload: { config: { collections }, logger: { warn: vi.fn() } },
})

describe('withPayloadMarkdownDocsMcp', () => {
  it('adds the docs tools and prompt next to existing ones', () => {
    const existing = { name: 'custom', description: 'x', handler: vi.fn(), parameters: {} }
    const options = withPayloadMarkdownDocsMcp({ mcp: { tools: [existing] } }) as unknown as Options

    expect(options.mcp.tools.map((tool) => tool.name)).toEqual(['custom', ...DOCS_TOOLS])
    expect(options.mcp.prompts.map((prompt) => prompt.name)).toEqual(['docsManage'])
  })

  it('exposes the plugin collections and narrows Git-owned ones', () => {
    const options = withPayloadMarkdownDocsMcp({
      collections: {
        docs: { enabled: true },
        'docs-sync-runs': { enabled: { find: true, update: true } },
        pages: { enabled: true },
        'payload-markdown-docs-assets': { description: 'mine', enabled: { create: true, find: true } },
      },
    }) as unknown as Options

    expect(options.collections.pages).toEqual({ enabled: true })
    expect(options.collections.docs?.enabled).toEqual({ find: true, update: true })
    expect(options.collections['docs-sync-runs']?.enabled).toEqual({ find: true })
    expect(options.collections['payload-markdown-docs-assets']).toEqual({ description: 'mine', enabled: { find: true } })
    expect(options.collections['docs-sets']?.enabled).toEqual({ create: true, find: true, update: true })
    expect(options.collections['docs-groups']?.enabled).toEqual({ create: true, delete: true, find: true, update: true })
    expect(options.collections['docs-access']?.enabled).toEqual({ create: true, delete: true, find: true, update: true })
    expect(options.collections['docs-sync-nonces']).toBeUndefined()
  })

  it('honors custom slugs, exposeCollections, tools and prompts options', () => {
    const options = withPayloadMarkdownDocsMcp(
      { collections: { guides: { enabled: true } } },
      { collections: { docs: 'guides' }, exposeCollections: false, prompts: false, tools: PAYLOAD_MARKDOWN_DOCS_MCP_READ_ONLY_TOOLS },
    ) as unknown as Options

    expect(Object.keys(options.collections)).toEqual(['guides'])
    expect(options.collections.guides?.enabled).toEqual({ find: true, update: true })
    expect(options.mcp.tools.map((tool) => tool.name)).toEqual([
      'docsGuide',
      'docsStructure',
      'docsFind',
      'docsVersions',
      'docsAccessList',
      'docsSyncRuns',
    ])
    expect(options.mcp.prompts).toEqual([])
  })

  it('detects double application, also through payload-markdown\'s wrapper', () => {
    const once = withPayloadMarkdownDocsMcp({})

    expect(() => withPayloadMarkdownDocsMcp(once)).toThrow(/applied twice/)
    expect(() => withPayloadMarkdownDocsMcp(withPayloadMarkdownMcp(once))).toThrow(/applied twice/)
  })

  it('refuses tool names that are already taken', () => {
    expect(() =>
      withPayloadMarkdownDocsMcp({ mcp: { tools: [{ name: 'docsFind', description: '', handler: vi.fn(), parameters: {} }] } }),
    ).toThrow(/already define "docsFind"/)
  })

  it.each([
    ['payload-markdown outside', () => withPayloadMarkdownMcp(withPayloadMarkdownDocsMcp({}))],
    ['payload-markdown inside', () => withPayloadMarkdownDocsMcp(withPayloadMarkdownMcp({}))],
  ])(
    'masks built-in write tools of Git-owned collections for plugin-mcp and payload-markdown (%s)',
    async (_label, compose) => {
      const options = compose() as unknown as Options
      const req = fakeReq()
      const settings = await options.overrideAuth(req, () => Promise.resolve(keySettings()))

      // What plugin-mcp registers built-in tools from.
      expect(settings.docs).toEqual({ create: false, delete: false, find: true, update: false })
      expect(settings.payloadMarkdownDocsAssets).toEqual({ create: false, delete: false, find: true, update: false })
      expect(settings.docsSyncRuns).toMatchObject({ update: false })
      expect(settings.docsSets).toEqual({ find: true, update: true })
      expect(settings.pages).toEqual({ find: true, update: true })

      // What payload-markdown's markdownWrite / markdownPublish check.
      const markdownAccess = req.context.payloadMarkdownMcpAccess as Record<string, Record<string, unknown>>
      expect(markdownAccess.docs?.update).toBe(false)
      expect(markdownAccess.pages?.update).toBe(true)

      // What the docs tools check: the key's own grant.
      const state = req.context[PAYLOAD_MARKDOWN_DOCS_MCP_CONTEXT_KEY] as { permissions: Record<string, Record<string, unknown>> }
      expect(state.permissions.docs).toEqual({ find: true, update: true })
    },
  )

  it('masks the docs collection under its real slug and warns about a slug mismatch', async () => {
    const options = withPayloadMarkdownDocsMcp({}) as unknown as Options
    const req = fakeReq([{ slug: 'guides', custom: { payloadMarkdownDocs: { role: 'docs' } }, versions: false }])
    const settings = await options.overrideAuth(req, () =>
      Promise.resolve({ ...keySettings(), guides: { find: true, update: true } }),
    )

    expect(settings.guides).toMatchObject({ find: true, update: false })
    expect(req.payload.logger.warn).toHaveBeenCalledWith(expect.stringContaining("collections: { docs: 'guides' }"))
  })

  it('drops exposed collections the config does not have on the first request', async () => {
    const options = withPayloadMarkdownDocsMcp({ collections: { pages: { enabled: true } } }) as unknown as Options
    const req = fakeReq([{ slug: 'pages' }, { slug: 'docs' }, { slug: 'docs-sets' }])

    await options.overrideAuth(req, () => Promise.resolve(keySettings()))

    expect(Object.keys(options.collections).sort()).toEqual(['docs', 'docs-sets', 'pages'])
    expect(req.payload.logger.warn).toHaveBeenCalledWith(expect.stringContaining('"docs-access" is not in the Payload config'))
  })

  it('keeps a user overrideAuth', async () => {
    const overrideAuth = vi.fn(() => Promise.resolve(keySettings()))
    const options = withPayloadMarkdownDocsMcp({ overrideAuth }) as unknown as Options
    const settings = await options.overrideAuth(fakeReq(), () => Promise.reject(new Error('unused')))

    expect(overrideAuth).toHaveBeenCalledTimes(1)
    expect(settings.docs).toMatchObject({ update: false })
  })
})

describe('tool handlers', () => {
  const toolsByName = Object.fromEntries(payloadMarkdownDocsMcpTools().map((tool) => [tool.name, tool]))
  const userReq = (context: Record<string, unknown> = {}) =>
    ({ context, payload: { config }, user: { id: 1, collection: 'users' } }) as never
  const withKey = (permissions: Record<string, Record<string, boolean>>) =>
    userReq({ [PAYLOAD_MARKDOWN_DOCS_MCP_CONTEXT_KEY]: { permissions } })
  const call = async (name: string, args: Record<string, unknown>, req: unknown) => {
    const result = await toolsByName[name].handler(args, req as never, {})

    return { isError: Boolean(result.isError), json: JSON.parse(result.content[0].text) as Record<string, unknown> }
  }

  it('lists every tool once, with read-only presets', () => {
    expect(Object.keys(toolsByName)).toEqual(DOCS_TOOLS)
    expect(payloadMarkdownDocsMcpTools({ tools: ['guide'] }).map((tool) => tool.name)).toEqual(['docsGuide'])
  })

  it('reports errors as { error, message } with isError', async () => {
    const anonymous = await call('docsFind', {}, { context: {}, payload: { config } })
    expect(anonymous).toMatchObject({ isError: true, json: { error: 'forbidden' } })

    const noKey = await call('docsFind', {}, userReq())
    expect(noKey.json.message).toContain('withPayloadMarkdownDocsMcp()')

    const denied = await call('docsUpdate', { id: 1, data: { heroImage: 2 } }, withKey({ docs: { find: true } }))
    expect(denied.json).toMatchObject({ error: 'forbidden' })
    expect(denied.json.message).toContain('does not allow "update" on "docs"')
  })

  it('refuses Git-owned, system and unknown fields before touching the database', async () => {
    const req = withKey({ docs: { find: true, update: true } })

    const owned = await call('docsUpdate', { id: 1, data: { content: '# New', title: 'New' } }, req)
    expect(owned.json).toMatchObject({ details: { fields: ['content', 'title'] }, error: 'sync_owned' })
    expect(owned.json.message).toContain('overrides.navTitle')

    const status = await call('docsUpdate', { id: 1, data: { _status: 'published' } }, req)
    expect(status.json).toMatchObject({ error: 'invalid_input' })
    expect(status.json.message).toContain('docsPublish')

    const unknown = await call('docsUpdate', { id: 1, data: { bogus: true } }, req)
    expect(unknown.json.message).toContain('Unknown field(s) on "docs": "bogus"')

    const setSync = await call('docsSetSave', { id: 1, data: { sync: { lastStatus: 'success' } } }, withKey({ docsSets: { update: true } }))
    expect(setSync.json).toMatchObject({ error: 'sync_owned' })
  })

  it('refuses private keys for sync access', async () => {
    const result = await call(
      'docsAccessSave',
      { data: { accessType: 'ed25519', keyId: 'ci', publicKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----', title: 'CI' } },
      withKey({ docsAccess: { create: true } }),
    )

    expect(result.json).toMatchObject({ error: 'invalid_input' })
    expect(result.json.message).toContain('private key')
  })

  it('serves a guide that lists Git-owned and editable fields', async () => {
    const guide = getDocsGuide({ req: userReq() })

    expect(guide).toContain('`docs` (generated docs pages')
    expect(guide).toMatch(/Git-owned \(refused\): .*`content`/)
    expect(guide).toMatch(/Agent-editable: .*`heroImage`.*`overrides`/)
    expect(guide).toContain('`docs-sync-runs`')

    const viaTool = await toolsByName.docsGuide.handler({}, withKey({ docs: { find: true } }), {})
    expect(viaTool.content[0].text).toMatch(/`docs` .*This connection may: find\./)
  })
})
