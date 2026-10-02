/**
 * Real-Postgres characterization snapshots for the public read side and the sync
 * endpoint (docs-b2 architecture hardening).
 *
 * The snapshots pin the exact bytes of llms.txt / llms-full.txt (root and per docs set),
 * sitemap entries, nav items, route resolution (including sidebars), docs-set manager
 * data, skill endpoints, and sync dry-run / error responses for a seeded site with
 * nested groups, both route modes, drafts, archived docs, and skill assets. They were
 * recorded before the read-side and sync modules were restructured, so any behavior
 * drift in those refactors fails here.
 *
 * Gated on PAYLOAD_MARKDOWN_DOCS_RUN_DB_TESTS=1 (and DATABASE_URL). The suite clears the
 * plugin's docs, docs sets, groups, and assets first so root outputs are deterministic;
 * record ids and timestamps are normalized. Handlers come from the dev config, which
 * imports `../dist`: run `pnpm build` first.
 */
import type { Payload } from 'payload'

import config from '@payload-config'
import { strFromU8, unzipSync } from 'fflate'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import { getDocsSetManagerData } from '../src/admin/docsSetManagerData.js'
import {
  getPayloadMarkdownDocsHeaderNavItems,
  getPayloadMarkdownDocsNavItems,
} from '../src/next/links.js'
import { resolvePayloadMarkdownDocsRoute } from '../src/next/route.js'
import { getPaginatedDocsForSitemap } from '../src/next/sitemap.js'
import { resolveDocsSetSkills } from '../src/utilities/normalizeSkills.js'
import {
  buildManifest,
  callGet,
  callSync,
  createSyncKey,
  registerSyncKey,
  runDbTests,
  type SyncKey,
} from './helpers/syncHarness.js'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

const describeDb = runDbTests ? describe : describe.skip

const DOCS = 'docs'
const DOCS_SETS = 'docs-sets'
const DOCS_GROUPS = 'docs-groups'
const DOCS_ASSETS = 'payload-markdown-docs-assets'
const ORIGIN = 'https://docs.example.com'

let payload: Payload
let key: SyncKey
const labels = {
  doc: new Map<string, string>(),
  group: new Map<string, string>(),
  set: new Map<string, string>(),
}

type IdKind = keyof typeof labels

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const ISO_DATE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g

const label = (kind: IdKind, id: unknown): unknown => {
  if (typeof id !== 'string' && typeof id !== 'number') {
    return id
  }

  return labels[kind].get(String(id)) ?? `<unknown ${kind} ${String(id)}>`
}

const childKind: Record<string, IdKind | undefined> = {
  childGroups: 'group',
  doc: 'doc',
  docs: 'doc',
  docsSet: 'set',
  docsSets: 'set',
  group: 'group',
  tree: 'doc',
}

/** Replaces record ids with stable labels and timestamps with a placeholder. */
const normalize = (value: unknown, kind?: IdKind): unknown => {
  if (typeof value === 'string') {
    return value
      .replace(ISO_DATE, '<date>')
      .replace(
        /^archived:([^:]+):/,
        (_match, id: string) => `archived:${String(label('doc', id))}:`,
      )
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalize(item, kind))
  }

  if (!isObject(value)) {
    return value
  }

  const navKind: IdKind | undefined =
    value.type === 'docsGroup' ? 'group' : value.type === 'docsSet' ? 'set' : undefined
  const ownKind = navKind ?? kind

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => {
      if (
        entryKey === 'id' &&
        ownKind &&
        !(typeof entryValue === 'string' && entryValue.startsWith('folder:'))
      ) {
        return [entryKey, label(ownKind, entryValue)]
      }

      if (entryKey === 'docsSetId') {
        return [entryKey, label('set', entryValue)]
      }

      if (entryKey === 'syncRunId') {
        return [entryKey, entryValue === undefined ? entryValue : '<sync-run>']
      }

      if (entryKey === 'adminURL' && typeof entryValue === 'string') {
        return [
          entryKey,
          entryValue.replace(/\/([^/]+)$/, (_match, id: string) => `/${String(label('doc', id))}`),
        ]
      }

      if (entryKey === 'reference' && isObject(entryValue)) {
        const referenceKind: IdKind = entryValue.relationTo === DOCS_GROUPS ? 'group' : 'set'

        return [entryKey, { ...entryValue, value: label(referenceKind, entryValue.value) }]
      }

      const nextKind =
        childKind[entryKey] ??
        (entryKey === 'children' || entryKey === 'subItems' ? ownKind : undefined)

      return [entryKey, normalize(entryValue, nextKind)]
    }),
  )
}

const sync = async (manifest: unknown) => {
  const result = await callSync({ key, manifest, payload })

  if (result.status !== 200) {
    throw new Error(`Seed sync failed (${result.status}): ${JSON.stringify(result.json)}`)
  }

  return result
}

const get = async ({
  path,
  routeParams,
  url,
}: {
  path: string
  routeParams?: Record<string, unknown>
  url: string
}) => {
  const response = await callGet({ path, payload, routeParams, url })

  return {
    contentType: response.headers.get('content-type'),
    status: response.status,
    text: await response.text(),
  }
}

const clearCollection = async (collection: string) => {
  await payload.delete({
    collection: collection as never,
    overrideAccess: true,
    where: { id: { exists: true } },
  })
}

const createGroup = (data: Record<string, unknown>) =>
  payload.create({
    collection: DOCS_GROUPS as never,
    data: data as never,
    overrideAccess: true,
  }) as Promise<Record<string, unknown>>

const createSet = (data: Record<string, unknown>) =>
  payload.create({
    collection: DOCS_SETS as never,
    data: {
      _status: 'published',
      branch: 'main',
      ...data,
    } as never,
    overrideAccess: true,
  }) as Promise<Record<string, unknown>>

const skill = (sourceId: string, agent: string, file: string, content: string) => ({
  content,
  contentType: 'text/markdown; charset=utf-8',
  kind: 'skill',
  path: `skills/${sourceId}/${agent}/${file}`,
})

const seed = async () => {
  // Children before parents is irrelevant for deletes; assets and docs reference sets.
  for (const collection of [DOCS_ASSETS, DOCS, DOCS_SETS, DOCS_GROUPS]) {
    await clearCollection(collection)
  }

  const platform = await createGroup({
    slug: 'platform',
    order: 1,
    pageMode: 'auto',
    title: 'Platform',
  })
  const sdk = await createGroup({
    slug: 'sdk',
    description: 'Software development kits.',
    navTitle: 'SDKs',
    order: 2,
    pageMode: 'auto',
    parent: platform.id,
    title: 'SDK',
  })
  const tools = await createGroup({
    slug: 'tools',
    order: 1,
    pageMode: 'auto',
    parent: platform.id,
    title: 'Tools',
  })
  const custom = await createGroup({
    slug: 'custom',
    order: 3,
    pageMode: 'custom',
    title: 'Custom Group',
  })

  await createSet({
    slug: 'alpha',
    description: 'The alpha product.\nSecond line.',
    title: 'Alpha Docs',
  })
  await createSet({
    slug: 'beta',
    description: 'Beta SDK reference.',
    group: sdk.id,
    routeMode: 'product-nested',
    title: 'Beta SDK',
  })
  await createSet({ slug: 'gamma', group: custom.id, title: 'Gamma' })
  await createSet({ slug: 'delta', _status: 'draft', title: 'Delta (draft set)' })
  await createSet({ slug: 'epsilon', description: 'Skills only.', title: 'Epsilon Skills' })
  await createSet({
    slug: 'zeta',
    group: tools.id,
    routeMode: 'product-nested',
    title: 'Zeta Tool',
  })

  await sync(
    buildManifest(
      'alpha',
      [
        {
          content:
            '---\ntitle: Alpha Home\ndescription: Start here.\n---\n# Alpha\n\nSee [guide](./guide.md) and [beta](/beta).\n',
          path: 'index.md',
        },
        {
          content:
            '---\ntitle: The Guide\nnavTitle: Guide\norder: 1\ndescription: A  guide   with\t spaces.\ndependencies:\n  - beta\n  - npm:@scope/epsilon@1.2.3\n---\n# Guide\n\nRead [deep](nested/deep.md).\n',
          path: 'guide.md',
        },
        {
          content: '---\norder: 2\n---\n# Deep Page\n\nBack to [guide](../guide.md).\n',
          path: 'nested/deep.md',
        },
        { content: '# Nested Index\n', path: 'nested/index.md' },
        { content: '# Hidden\n', path: 'hidden.md' },
        { content: '# Old Page\n', path: 'old.md' },
      ],
      {
        assets: [
          skill(
            'alpha',
            'claude',
            'SKILL.md',
            '---\nname: alpha\ndescription: Alpha skill.\n---\n# Alpha Claude Skill\n',
          ),
          skill('alpha', 'claude', 'reference/usage.md', '# Usage\n'),
          skill('alpha', 'codex', 'SKILL.md', '# Alpha Codex Skill\n'),
          {
            content: 'static text\n',
            contentType: 'text/plain; charset=utf-8',
            kind: 'static',
            path: 'static/notes.txt',
          },
        ],
      },
    ),
  )
  // Drop old.md (archived) and keep everything else.
  await sync(
    buildManifest(
      'alpha',
      [
        {
          content:
            '---\ntitle: Alpha Home\ndescription: Start here.\n---\n# Alpha\n\nSee [guide](./guide.md) and [beta](/beta).\n',
          path: 'index.md',
        },
        {
          content:
            '---\ntitle: The Guide\nnavTitle: Guide\norder: 1\ndescription: A  guide   with\t spaces.\ndependencies:\n  - beta\n  - npm:@scope/epsilon@1.2.3\n---\n# Guide\n\nRead [deep](nested/deep.md).\n',
          path: 'guide.md',
        },
        {
          content: '---\norder: 2\n---\n# Deep Page\n\nBack to [guide](../guide.md).\n',
          path: 'nested/deep.md',
        },
        { content: '# Nested Index\n', path: 'nested/index.md' },
        { content: '# Hidden\n', path: 'hidden.md' },
      ],
      {
        assets: [
          skill(
            'alpha',
            'claude',
            'SKILL.md',
            '---\nname: alpha\ndescription: Alpha skill.\n---\n# Alpha Claude Skill\n',
          ),
          skill('alpha', 'claude', 'reference/usage.md', '# Usage\n'),
          skill('alpha', 'codex', 'SKILL.md', '# Alpha Codex Skill\n'),
          {
            content: 'static text\n',
            contentType: 'text/plain; charset=utf-8',
            kind: 'static',
            path: 'static/notes.txt',
          },
        ],
      },
    ),
  )
  // A non-publish sync adds a never-published doc.
  await sync(
    buildManifest(
      'alpha',
      [
        {
          content:
            '---\ntitle: Alpha Home\ndescription: Start here.\n---\n# Alpha\n\nSee [guide](./guide.md) and [beta](/beta).\n',
          path: 'index.md',
        },
        {
          content:
            '---\ntitle: The Guide\nnavTitle: Guide\norder: 1\ndescription: A  guide   with\t spaces.\ndependencies:\n  - beta\n  - npm:@scope/epsilon@1.2.3\n---\n# Guide\n\nRead [deep](nested/deep.md).\n',
          path: 'guide.md',
        },
        {
          content: '---\norder: 2\n---\n# Deep Page\n\nBack to [guide](../guide.md).\n',
          path: 'nested/deep.md',
        },
        { content: '# Nested Index\n', path: 'nested/index.md' },
        { content: '# Hidden\n', path: 'hidden.md' },
        { content: '# Unreleased\n\nDRAFT-ONLY\n', path: 'unreleased.md' },
      ],
      {
        assets: [
          skill(
            'alpha',
            'claude',
            'SKILL.md',
            '---\nname: alpha\ndescription: Alpha skill.\n---\n# Alpha Claude Skill\n',
          ),
          skill('alpha', 'claude', 'reference/usage.md', '# Usage\n'),
          skill('alpha', 'codex', 'SKILL.md', '# Alpha Codex Skill\n'),
          {
            content: 'static text\n',
            contentType: 'text/plain; charset=utf-8',
            kind: 'static',
            path: 'static/notes.txt',
          },
        ],
        publish: false,
      },
    ),
  )

  const hidden = (
    await payload.find({
      collection: DOCS as never,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { route: { equals: '/alpha/hidden' } },
    })
  ).docs[0] as Record<string, unknown>
  await payload.update({
    id: hidden.id as number,
    collection: DOCS as never,
    data: {
      _status: 'published',
      overrides: { hideFromNav: true, navTitle: 'Secretly Hidden' },
    } as never,
    draft: false,
    overrideAccess: true,
  })

  await sync(
    buildManifest('beta', [
      {
        content: '---\ntitle: Beta Overview\n---\n# Beta\n\nSee [ref](api/ref.md).\n',
        path: 'index.md',
      },
      {
        content: '---\ntitle: API Reference\norder: 5\n---\n# API\n\n[Overview](../index.md)\n',
        path: 'api/ref.md',
      },
      { content: '---\ntitle: Install\norder: 1\n---\n# Install\n', path: 'install.md' },
    ]),
  )
  await sync(buildManifest('gamma', [{ content: '# Gamma Home\n', path: 'index.md' }]))
  await sync({
    ...buildManifest('delta', [{ content: '# Delta Draft\n\nDELTA-SECRET\n', path: 'index.md' }]),
    publish: false,
  })
  await sync(
    buildManifest('epsilon', [], {
      assets: [skill('epsilon', 'claude', 'SKILL.md', '# Epsilon Skill\n')],
    }),
  )
  await sync(
    buildManifest('zeta', [
      { content: '# Zeta\n', path: 'index.md' },
      { content: '# Zeta Usage\n', path: 'usage.md' },
    ]),
  )

  const [docs, sets, groups] = await Promise.all([
    payload.find({
      collection: DOCS as never,
      depth: 0,
      draft: true,
      overrideAccess: true,
      pagination: false,
    }),
    payload.find({
      collection: DOCS_SETS as never,
      depth: 0,
      draft: true,
      overrideAccess: true,
      pagination: false,
    }),
    payload.find({
      collection: DOCS_GROUPS as never,
      depth: 0,
      overrideAccess: true,
      pagination: false,
    }),
  ])

  for (const doc of docs.docs as unknown as Record<string, unknown>[]) {
    const sync = isObject(doc.sync) ? doc.sync : {}
    labels.doc.set(String(doc.id), `doc:${String(sync.sourceId)}:${String(doc.sourcePath)}`)
  }

  for (const set of sets.docs as unknown as Record<string, unknown>[]) {
    labels.set.set(String(set.id), `set:${String(set.slug)}`)
  }

  for (const group of groups.docs as unknown as Record<string, unknown>[]) {
    labels.group.set(String(group.id), `group:${String(group.slug)}`)
  }
}

const findSetId = async (slug: string): Promise<string> => {
  const result = await payload.find({
    collection: DOCS_SETS as never,
    depth: 0,
    draft: true,
    limit: 1,
    overrideAccess: true,
    where: { slug: { equals: slug } },
  })

  return String((result.docs[0] as unknown as Record<string, unknown>).id)
}

describeDb('read-side and sync characterization (docs-b2)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
    key = createSyncKey()
    await registerSyncKey(payload, key)
    await seed()
  }, 120_000)

  afterAll(async () => {
    await payload?.destroy()
  })

  describe('llms', () => {
    test.each([
      ['/llms.txt', '/llms.txt'],
      ['/llms-full.txt', '/llms-full.txt'],
    ])('root %s', async (path, url) => {
      expect(await get({ path, url: `${ORIGIN}${url}` })).toMatchSnapshot()
    })

    test.each([
      ['/alpha/llms.txt'],
      ['/alpha/llms-full.txt'],
      ['/platform/sdk/beta/llms.txt'],
      ['/platform/sdk/beta/docs/llms-full.txt'],
      ['/custom/gamma/llms-full.txt'],
      ['/delta/llms.txt'],
      ['/epsilon/llms.txt'],
      ['/epsilon/llms-full.txt'],
      ['/platform/tools/zeta/docs/llms.txt'],
      ['/missing/llms.txt'],
    ])('docs set %s', async (url) => {
      const file = url.endsWith('llms-full.txt') ? 'llms-full.txt' : 'llms.txt'

      expect(await get({ path: `/:routeBase*/${file}`, url: `${ORIGIN}${url}` })).toMatchSnapshot()
    })
  })

  describe('route adapter', () => {
    test.each([
      ['/alpha', false],
      ['/alpha/guide', false],
      ['/alpha/nested', false],
      ['/alpha/nested/deep', false],
      ['/alpha/old', false],
      ['/alpha/unreleased', false],
      ['/alpha/unreleased', true],
      ['/platform', false],
      ['/platform/sdk', false],
      ['/platform/sdk/beta', false],
      ['/platform/sdk/beta/docs', false],
      ['/platform/sdk/beta/docs/api/ref', false],
      ['/platform/sdk/beta/api/ref', false],
      ['/platform/sdk/beta/index.md', false],
      ['/custom', false],
      ['/custom/gamma', false],
      ['/delta', false],
      ['/delta', true],
      ['/epsilon', false],
      ['/platform/tools/zeta', false],
      ['/platform/tools/zeta/usage', false],
      ['/nope', false],
    ])('%s (includeDrafts=%s)', async (path, includeDrafts) => {
      const route = await resolvePayloadMarkdownDocsRoute({
        includeDrafts,
        path,
        payload: payload as never,
      })

      expect(normalize(route)).toMatchSnapshot()
    })
  })

  describe('navigation', () => {
    test.each([false, true])('nav items (includeDrafts=%s)', async (includeDrafts) => {
      expect(
        normalize(
          await getPayloadMarkdownDocsNavItems({ includeDrafts, payload: payload as never }),
        ),
      ).toMatchSnapshot()
    })

    test.each(['url', 'relationship'] as const)('header nav items (%s)', async (mode) => {
      expect(
        normalize(
          await getPayloadMarkdownDocsHeaderNavItems({
            maxItems: 3,
            mode,
            payload: payload as never,
          }),
        ),
      ).toMatchSnapshot()
    })
  })

  describe('sitemap', () => {
    test.each([
      ['defaults', {}],
      ['everything', { includeAssets: true, includeLlms: true, includeSkills: true }],
      ['non-recursive', { recursive: false }],
    ])('%s', async (_name, options) => {
      const result = await getPaginatedDocsForSitemap({
        payload: payload as never,
        siteUrl: `${ORIGIN}/`,
        ...options,
      })

      expect(normalize(result.docs)).toMatchSnapshot()
    })
  })

  describe('assets and skills', () => {
    test('skill directory index', async () => {
      expect(
        await get({
          path: '/:routeBase*/skills/:agent/:assetPath*',
          routeParams: { agent: 'claude', routeBase: ['alpha'] },
          url: `${ORIGIN}/alpha/skills/claude`,
        }),
      ).toMatchSnapshot()
    })

    test('skill file', async () => {
      expect(
        await get({
          path: '/:routeBase*/skills/:agent/:assetPath*',
          routeParams: {
            agent: 'claude',
            assetPath: ['reference', 'usage.md'],
            routeBase: ['alpha'],
          },
          url: `${ORIGIN}/alpha/skills/claude/reference/usage.md`,
        }),
      ).toMatchSnapshot()
    })

    test('skill archive', async () => {
      const response = await callGet({
        path: '/:routeBase*/skills/:agent.zip',
        payload,
        routeParams: { agent: 'claude.zip', routeBase: ['alpha'] },
        url: `${ORIGIN}/alpha/skills/claude.zip`,
      })
      const entries = unzipSync(new Uint8Array(await response.arrayBuffer()))

      expect({
        disposition: response.headers.get('content-disposition'),
        entries: Object.fromEntries(
          Object.entries(entries).map(([name, data]) => [name, strFromU8(data)]),
        ),
        status: response.status,
      }).toMatchSnapshot()
    })

    test('resolveDocsSetSkills', async () => {
      const alphaId = await findSetId('alpha')

      expect(
        normalize(
          await resolveDocsSetSkills({
            docsSet: alphaId,
            payload: payload as never,
            skills: { enabled: true, heading: 'Skills' } as never,
          }),
        ),
      ).toMatchSnapshot()
    })
  })

  describe('admin', () => {
    test('docs set manager data', async () => {
      const alphaId = await findSetId('alpha')

      expect(
        normalize(
          await getDocsSetManagerData({
            adminRoute: '/admin',
            docsSetId: alphaId,
            payload: payload as never,
          }),
        ),
      ).toMatchSnapshot()
    })
  })

  describe('sync responses', () => {
    test('dry-run plan', async () => {
      const result = await callSync({
        key,
        manifest: buildManifest(
          'beta',
          [
            {
              content: '---\ntitle: Beta Overview\n---\n# Beta\n\nSee [ref](api/ref.md).\n',
              path: 'index.md',
            },
            { content: '---\ntitle: Install v2\norder: 1\n---\n# Install\n', path: 'install.md' },
            { content: '# New\n', path: 'new.md' },
          ],
          { mode: 'dry-run' },
        ),
        payload,
      })

      expect({ json: normalize(result.json), status: result.status }).toMatchSnapshot()
    })

    test('route collision with another docs set', async () => {
      await createSet({ slug: 'platform', _status: 'draft', title: 'Platform Clash' })
      const result = await callSync({
        key,
        manifest: buildManifest(
          'platform',
          [{ content: '# Clash\n', path: 'sdk/beta/docs/install.md' }],
          { mode: 'dry-run' },
        ),
        payload,
      })

      expect({ json: normalize(result.json), status: result.status }).toMatchSnapshot()
    })

    test('route collision inside the manifest', async () => {
      const result = await callSync({
        key,
        manifest: buildManifest('gamma', [
          { content: '# A\n', path: 'a.md' },
          { content: '# A index\n', path: 'a/index.md' },
        ]),
        payload,
      })

      expect({ json: normalize(result.json), status: result.status }).toMatchSnapshot()
    })

    test('invalid manifest', async () => {
      const result = await callSync({
        key,
        manifest: buildManifest('gamma', [
          { content: '# A\n', path: '../escape.md' },
          { content: '# B\n', path: 'b.txt' },
        ]),
        payload,
      })

      expect({ json: normalize(result.json), status: result.status }).toMatchSnapshot()
    })

    test('unknown docs set', async () => {
      const result = await callSync({
        key,
        manifest: buildManifest('no-such-set', [{ content: '# A\n', path: 'a.md' }]),
        payload,
      })

      expect({ json: result.json, status: result.status }).toMatchSnapshot()
    })
  })
})
