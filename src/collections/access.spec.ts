import type { CollectionConfig, Config } from 'payload'

import { describe, expect, it } from 'vitest'

import { payloadMarkdownDocs } from '../plugin.js'

const pluginSlugs = [
  'docs',
  'docs-access',
  'docs-groups',
  'docs-sets',
  'docs-sync-nonces',
  'docs-sync-runs',
  'payload-markdown-docs-assets',
]

const buildConfig = (options: Parameters<typeof payloadMarkdownDocs>[0] = {}) =>
  payloadMarkdownDocs(options)({
    collections: [{ slug: 'media', fields: [], upload: true }],
  } as unknown as Config)

const getCollection = (config: Config, slug: string): CollectionConfig => {
  const collection = config.collections?.find((candidate) => candidate.slug === slug)

  if (!collection) {
    throw new Error(`missing ${slug}`)
  }

  return collection
}

const reqFor = (user: null | Record<string, unknown>) =>
  ({
    req: {
      payload: { config: { admin: { user: 'users' } } },
      user,
    },
  }) as never

const admin = reqFor({ id: 1, collection: 'users' })
const customer = reqFor({ id: 2, collection: 'customers' })
const anonymous = reqFor(null)

const run = async (
  collection: CollectionConfig,
  operation: 'create' | 'delete' | 'read' | 'update',
  args: never,
) => {
  const fn = collection.access?.[operation]

  if (typeof fn !== 'function') {
    throw new Error(`missing ${operation} access on ${collection.slug}`)
  }

  return fn(args)
}

describe('plugin collection default access (DOCS-6)', () => {
  it('limits every plugin collection to admin users', async () => {
    const config = buildConfig()

    for (const slug of pluginSlugs) {
      const collection = getCollection(config, slug)

      for (const operation of ['read'] as const) {
        expect(await run(collection, operation, admin)).toBe(true)
        expect(await run(collection, operation, customer)).toBe(false)
        expect(await run(collection, operation, anonymous)).toBe(false)
      }
    }
  })

  it('lets admins manage keys and docs but not customers', async () => {
    const config = buildConfig()

    for (const slug of ['docs', 'docs-access', 'docs-groups', 'docs-sets']) {
      const collection = getCollection(config, slug)

      for (const operation of ['create', 'update', 'delete'] as const) {
        expect(await run(collection, operation, admin)).toBe(true)
        expect(await run(collection, operation, customer)).toBe(false)
      }
    }
  })

  it('keeps nonces and sync runs read-only for humans', async () => {
    const config = buildConfig()

    for (const slug of ['docs-sync-nonces', 'docs-sync-runs']) {
      const collection = getCollection(config, slug)

      for (const operation of ['create', 'update', 'delete'] as const) {
        expect(await run(collection, operation, admin)).toBe(false)
      }
    }
  })

  it('supports a custom admin rule and per-collection overrides', async () => {
    const config = buildConfig({
      access: {
        admin: ({ req }) => (req.user as { role?: string } | null)?.role === 'docs-admin',
      },
      collections: {
        syncRuns: {
          access: {
            delete: () => true,
          },
        },
      },
    })
    const docsAccess = getCollection(config, 'docs-access')

    expect(await run(docsAccess, 'create', reqFor({ collection: 'users', role: 'docs-admin' }))).toBe(
      true,
    )
    expect(await run(docsAccess, 'create', admin)).toBe(false)
    expect(await run(getCollection(config, 'docs-sync-runs'), 'delete', admin)).toBe(true)
  })
})
