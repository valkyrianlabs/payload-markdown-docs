import type { CollectionConfig, Config, Payload } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { PayloadMarkdownDocsConfig } from '../src/index.js'

import {
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_KEYS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
  DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG,
  DEFAULT_DOCS_SYNC_RUNS_COLLECTION_SLUG,
  DEFAULT_DOCS_TRUSTED_COLLECTION_SLUG,
  DEFAULT_MARKDOWN_FIELD_NAME,
  DOCS_GLOBALS_ADMIN_GROUP,
  DOCS_SET_MANAGER_COMPONENT,
  payloadMarkdownDocs,
} from '../src/index.js'

type NamedField = {
  admin?: {
    components?: {
      Field?: string
    }
    custom?: Record<string, unknown>
  }
  fields?: NamedField[]
  name?: string
  relationTo?: string | string[]
  type?: string
}

const getCollection = (configToSearch: Config, slug: string) =>
  configToSearch.collections?.find((collection) => collection.slug === slug)

const getField = (collection: CollectionConfig | undefined, fieldName: string) =>
  collection?.fields.find(
    (field): field is NamedField => 'name' in field && field.name === fieldName,
  )

const getGroupField = (collection: CollectionConfig | undefined, fieldName: string) => {
  const field = getField(collection, fieldName)

  return field?.type === 'group' ? field : undefined
}

const hasValidPostgresUrl = (): boolean => {
  if (process.env.PAYLOAD_MARKDOWN_DOCS_RUN_DB_TESTS !== '1') {
    return false
  }

  if (!process.env.DATABASE_URL) {
    return false
  }

  try {
    return new URL(process.env.DATABASE_URL).protocol.startsWith('postgres')
  } catch {
    return false
  }
}

const describeWithPostgres = hasValidPostgresUrl() ? describe : describe.skip

describe('payloadMarkdownDocs collection wiring', () => {
  test('exports the plugin factory', () => {
    expect(typeof payloadMarkdownDocs).toBe('function')
  })

  test('disabled plugin returns incoming config unchanged and adds no collections', () => {
    const incomingConfig = {
      collections: [
        {
          slug: 'posts',
          fields: [],
        },
      ],
    } as Config

    const transformedConfig = payloadMarkdownDocs({ enabled: false })(incomingConfig)

    expect(transformedConfig).toBe(incomingConfig)
    expect(transformedConfig.collections).toHaveLength(1)
    expect(transformedConfig.endpoints).toBeUndefined()
    expect(getCollection(transformedConfig, DEFAULT_DOCS_COLLECTION_SLUG)).toBeUndefined()
  })

  test('enabled plugin adds default docs infrastructure collections', () => {
    const transformedConfig = payloadMarkdownDocs({ enabled: true })({
      collections: [
        {
          slug: 'posts',
          fields: [],
        },
      ],
    } as Config)

    expect(getCollection(transformedConfig, 'posts')).toBeDefined()
    expect(getCollection(transformedConfig, DEFAULT_DOCS_GROUPS_COLLECTION_SLUG)).toBeDefined()
    expect(getCollection(transformedConfig, DEFAULT_DOCS_SETS_COLLECTION_SLUG)).toBeDefined()
    expect(getCollection(transformedConfig, DEFAULT_DOCS_COLLECTION_SLUG)).toBeDefined()
    expect(getCollection(transformedConfig, DEFAULT_DOCS_SYNC_RUNS_COLLECTION_SLUG)).toBeDefined()
    expect(getCollection(transformedConfig, DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG)).toBeDefined()
    expect(transformedConfig.endpoints).toContainEqual(
      expect.objectContaining({
        method: 'post',
        path: '/payload-markdown-docs/sync',
      }),
    )
  })

  test('uses low-noise default admin sidebar visibility', () => {
    const transformedConfig = payloadMarkdownDocs({ enabled: true })({
      collections: [],
    } as unknown as Config)
    const docsGroupsCollection = getCollection(
      transformedConfig,
      DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
    )
    const docsSetsCollection = getCollection(transformedConfig, DEFAULT_DOCS_SETS_COLLECTION_SLUG)
    const docsCollection = getCollection(transformedConfig, DEFAULT_DOCS_COLLECTION_SLUG)
    const docsKeysCollection = getCollection(transformedConfig, DEFAULT_DOCS_KEYS_COLLECTION_SLUG)
    const docsTrustedCollection = getCollection(
      transformedConfig,
      DEFAULT_DOCS_TRUSTED_COLLECTION_SLUG,
    )
    const syncRunsCollection = getCollection(
      transformedConfig,
      DEFAULT_DOCS_SYNC_RUNS_COLLECTION_SLUG,
    )
    const noncesCollection = getCollection(
      transformedConfig,
      DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG,
    )

    expect(docsSetsCollection?.admin).toMatchObject({
      group: DOCS_GLOBALS_ADMIN_GROUP,
      useAsTitle: 'title',
    })
    expect(docsSetsCollection?.admin?.hidden).not.toBe(true)
    expect(docsGroupsCollection?.admin).toMatchObject({
      group: DOCS_GLOBALS_ADMIN_GROUP,
      useAsTitle: 'title',
    })
    expect(docsGroupsCollection?.admin?.hidden).not.toBe(true)
    expect(docsKeysCollection?.admin).toMatchObject({
      group: DOCS_GLOBALS_ADMIN_GROUP,
      useAsTitle: 'title',
    })
    expect(docsTrustedCollection?.admin).toMatchObject({
      group: DOCS_GLOBALS_ADMIN_GROUP,
      useAsTitle: 'title',
    })
    expect(docsCollection?.admin).toMatchObject({
      hidden: true,
      useAsTitle: 'title',
    })
    expect(syncRunsCollection?.admin).toMatchObject({
      hidden: true,
      useAsTitle: 'sourceId',
    })
    expect(noncesCollection?.admin).toMatchObject({
      hidden: true,
      useAsTitle: 'nonce',
    })
  })

  test('custom docs collection slug and markdown field name work', () => {
    const transformedConfig = payloadMarkdownDocs({
      enabled: true,
      target: {
        slug: 'knowledge-base',
        type: 'docsCollection',
        markdownField: 'body',
      },
    })({ collections: [] } as unknown as Config)

    const docsCollection = getCollection(transformedConfig, 'knowledge-base')
    const markdownField = getField(docsCollection, 'body')

    expect(docsCollection).toBeDefined()
    expect(markdownField?.type).toBe('text')
    expect(markdownField?.admin?.components?.Field).toBe(
      '@valkyrianlabs/payload-markdown/server#PayloadMarkdownField',
    )
  })

  test('custom infrastructure collection slugs work', () => {
    const transformedConfig = payloadMarkdownDocs({
      collections: {
        docsGroups: {
          slug: 'kb-docs-groups',
        },
        docsSets: {
          slug: 'kb-docs-sets',
        },
        nonces: {
          slug: 'kb-sync-nonces',
        },
        syncRuns: {
          slug: 'kb-sync-runs',
        },
      },
      enabled: true,
    })({ collections: [] } as unknown as Config)

    expect(getCollection(transformedConfig, 'kb-docs-groups')).toBeDefined()
    expect(getCollection(transformedConfig, 'kb-docs-sets')).toBeDefined()
    expect(getCollection(transformedConfig, DEFAULT_DOCS_KEYS_COLLECTION_SLUG)).toBeDefined()
    expect(getCollection(transformedConfig, DEFAULT_DOCS_TRUSTED_COLLECTION_SLUG)).toBeDefined()
    expect(getCollection(transformedConfig, 'kb-sync-runs')).toBeDefined()
    expect(getCollection(transformedConfig, 'kb-sync-nonces')).toBeDefined()
    expect(getCollection(transformedConfig, 'kb-docs-groups')?.admin?.group).toBe(
      DOCS_GLOBALS_ADMIN_GROUP,
    )
    expect(getCollection(transformedConfig, 'kb-docs-sets')?.admin?.group).toBe(
      DOCS_GLOBALS_ADMIN_GROUP,
    )
    expect(getCollection(transformedConfig, 'kb-sync-runs')?.admin?.hidden).toBe(true)
    expect(getCollection(transformedConfig, 'kb-sync-nonces')?.admin?.hidden).toBe(true)
  })

  test('collection disabling is respected', () => {
    const transformedConfig = payloadMarkdownDocs({
      collections: {
        nonces: {
          enabled: false,
        },
        syncRuns: {
          enabled: false,
        },
      },
      enabled: true,
    })({ collections: [] } as unknown as Config)

    expect(getCollection(transformedConfig, DEFAULT_DOCS_COLLECTION_SLUG)).toBeDefined()
    expect(getCollection(transformedConfig, DEFAULT_DOCS_SYNC_RUNS_COLLECTION_SLUG)).toBeUndefined()
    expect(
      getCollection(transformedConfig, DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG),
    ).toBeUndefined()
  })

  test('duplicate collection slug conflicts throw clear errors', () => {
    expect(() =>
      payloadMarkdownDocs({ enabled: true })({
        collections: [
          {
            slug: DEFAULT_DOCS_COLLECTION_SLUG,
            fields: [],
          },
        ],
      } as Config),
    ).toThrow(/already exists/)
  })

  test('unsupported existing collection target throws a clear error', () => {
    expect(() =>
      payloadMarkdownDocs({
        enabled: true,
        target: {
          type: 'existingCollection',
          collection: 'pages',
          markdownField: 'content',
        },
      })({ collections: [] } as unknown as Config),
    ).toThrow(/existingCollection/)
  })

  test('docs collection contains expected fields', () => {
    const transformedConfig = payloadMarkdownDocs({ enabled: true })({
      collections: [],
    } as unknown as Config)
    const docsCollection = getCollection(transformedConfig, DEFAULT_DOCS_COLLECTION_SLUG)
    const syncField = getGroupField(docsCollection, 'sync')
    const syncFieldNames = syncField?.fields?.map((field) => field.name)
    const sourcePathField = getField(docsCollection, 'sourcePath')

    expect(docsCollection?.admin?.hidden).toBe(true)
    expect(getField(docsCollection, 'title')?.type).toBe('text')
    expect(getField(docsCollection, 'navTitle')?.type).toBe('text')
    expect(getField(docsCollection, 'description')?.type).toBe('textarea')
    expect(getField(docsCollection, 'route')?.type).toBe('text')
    expect(sourcePathField?.type).toBe('text')
    expect(sourcePathField).toMatchObject({
      index: true,
    })
    expect(sourcePathField).not.toMatchObject({
      unique: true,
    })
    expect(getField(docsCollection, 'docsSet')?.relationTo).toBe(DEFAULT_DOCS_SETS_COLLECTION_SLUG)
    expect(getField(docsCollection, 'sourceHash')?.type).toBe('text')
    expect(getField(docsCollection, 'depth')?.type).toBe('number')
    expect(getField(docsCollection, 'order')?.type).toBe('number')
    expect(getField(docsCollection, 'parent')?.relationTo).toBe(DEFAULT_DOCS_COLLECTION_SLUG)
    expect(getField(docsCollection, 'publishedAt')).toMatchObject({
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    })
    expect(getField(docsCollection, 'heroImage')).toMatchObject({
      type: 'upload',
      relationTo: 'media',
    })
    expect(getField(docsCollection, DEFAULT_MARKDOWN_FIELD_NAME)?.type).toBe('text')
    expect(getGroupField(docsCollection, 'overrides')).toBeDefined()
    expect(syncFieldNames).toEqual([
      'sourceId',
      'sourcePath',
      'sourceHashAtLastSync',
      'contentHashAtLastSync',
      'lastSyncedAt',
      'lastSyncRunId',
      'managedBy',
      'archived',
      'archivedAt',
    ])
  })

  test('docs collection can add extra hero image media collections', () => {
    const transformedConfig = payloadMarkdownDocs({
      enabled: true,
      target: {
        heroImage: {
          additionalMediaCollections: ['docs-media'],
        },
      },
    })({
      collections: [],
    } as unknown as Config)
    const docsCollection = getCollection(transformedConfig, DEFAULT_DOCS_COLLECTION_SLUG)

    expect(getField(docsCollection, 'heroImage')).toMatchObject({
      type: 'upload',
      relationTo: ['media', 'docs-media'],
    })
  })

  test('docs groups collection contains expected fields', () => {
    const transformedConfig = payloadMarkdownDocs({ enabled: true })({
      collections: [],
    } as unknown as Config)
    const docsGroupsCollection = getCollection(
      transformedConfig,
      DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
    )

    expect(getField(docsGroupsCollection, 'title')?.type).toBe('text')
    expect(getField(docsGroupsCollection, 'slug')?.type).toBe('text')
    expect(getField(docsGroupsCollection, 'parent')?.relationTo).toBe(
      DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
    )
    expect(getField(docsGroupsCollection, 'routePath')).toBeUndefined()
    expect(getField(docsGroupsCollection, 'serveIndex')?.type).toBe('checkbox')
    expect(docsGroupsCollection?.admin?.group).toBe(DOCS_GLOBALS_ADMIN_GROUP)
  })

  test('docs sets collection contains expected fields', () => {
    const transformedConfig = payloadMarkdownDocs({ enabled: true })({
      collections: [],
    } as unknown as Config)
    const docsSetsCollection = getCollection(transformedConfig, DEFAULT_DOCS_SETS_COLLECTION_SLUG)
    const advancedSecurityField = getGroupField(docsSetsCollection, 'advancedSecurity')
    const syncField = getGroupField(docsSetsCollection, 'sync')

    expect(getField(docsSetsCollection, 'title')?.type).toBe('text')
    expect(getField(docsSetsCollection, 'slug')?.type).toBe('text')
    expect(getField(docsSetsCollection, 'sourceId')).toBeUndefined()
    expect(getField(docsSetsCollection, 'sourceRoot')).toBeUndefined()
    expect(getField(docsSetsCollection, 'group')?.relationTo).toBe(
      DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
    )
    expect(getField(docsSetsCollection, 'branch')?.type).toBe('text')
    expect(getField(docsSetsCollection, 'allowPullRequests')?.type).toBe('checkbox')
    expect(getField(docsSetsCollection, 'routeBase')).toBeUndefined()
    expect(getField(docsSetsCollection, 'publishedAt')).toMatchObject({
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    })
    expect(getField(docsSetsCollection, 'aiExport')?.type).toBe('json')
    expect(docsSetsCollection?.versions).toMatchObject({
      drafts: true,
    })
    expect(docsSetsCollection?.admin?.group).toBe(DOCS_GLOBALS_ADMIN_GROUP)
    expect(getGroupField(docsSetsCollection, 'auth')).toBeUndefined()
    expect(getGroupField(docsSetsCollection, 'defaults')).toBeUndefined()
    expect(advancedSecurityField?.fields?.map((field) => field.name)).toEqual([
      'enabled',
      'allowedWorkflowRefs',
    ])
    expect(syncField?.fields?.map((field) => field.name)).toEqual([
      'lastSyncedAt',
      'lastSyncRunId',
      'lastStatus',
      'docsCount',
    ])
    expect(getField(docsSetsCollection, 'docsSetManager')).toMatchObject({
      type: 'ui',
      admin: {
        components: {
          Field: DOCS_SET_MANAGER_COMPONENT,
        },
        custom: {
          docsCollectionSlug: DEFAULT_DOCS_COLLECTION_SLUG,
          docsSetsCollectionSlug: DEFAULT_DOCS_SETS_COLLECTION_SLUG,
        },
      },
    })
  })

  test('docs set manager respects custom docs and docs set slugs', () => {
    const transformedConfig = payloadMarkdownDocs({
      collections: {
        docsSets: {
          slug: 'knowledge-sets',
        },
      },
      enabled: true,
      target: {
        slug: 'generated-docs',
        type: 'docsCollection',
      },
    })({
      collections: [],
    } as unknown as Config)
    const docsSetsCollection = getCollection(transformedConfig, 'knowledge-sets')

    expect(getField(docsSetsCollection, 'docsSetManager')).toMatchObject({
      admin: {
        custom: {
          docsCollectionSlug: 'generated-docs',
          docsSetsCollectionSlug: 'knowledge-sets',
        },
      },
    })
  })

  test('sync runs collection contains expected fields', () => {
    const transformedConfig = payloadMarkdownDocs({ enabled: true })({
      collections: [],
    } as unknown as Config)
    const syncRunsCollection = getCollection(
      transformedConfig,
      DEFAULT_DOCS_SYNC_RUNS_COLLECTION_SLUG,
    )

    expect(syncRunsCollection?.fields.map((field) => ('name' in field ? field.name : ''))).toEqual([
      'sourceId',
      'repository',
      'branch',
      'commit',
      'actor',
      'keyId',
      'mode',
      'status',
      'publishRequested',
      'deleteBehavior',
      'bodyHash',
      'fileCount',
      'totalBytes',
      'summary',
      'warnings',
      'errors',
      'startedAt',
      'completedAt',
    ])
  })

  test('nonces collection contains expected fields', () => {
    const transformedConfig = payloadMarkdownDocs({ enabled: true })({
      collections: [],
    } as unknown as Config)
    const noncesCollection = getCollection(
      transformedConfig,
      DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG,
    )

    expect(noncesCollection?.fields.map((field) => ('name' in field ? field.name : ''))).toEqual([
      'keyId',
      'nonce',
      'sourceId',
      'bodyHash',
      'syncRunId',
      'expiresAt',
      'usedAt',
    ])
  })

  test('accepts the public Phase 2 config shape', () => {
    const pluginConfig = {
      collections: {
        docs: {
          slug: 'docs',
        },
        nonces: {
          slug: 'docs-sync-nonces',
        },
        syncRuns: {
          slug: 'docs-sync-runs',
        },
      },
      enabled: true,
      target: {
        slug: 'docs',
        type: 'docsCollection',
        enableDrafts: true,
        markdownField: 'content',
      },
    } satisfies PayloadMarkdownDocsConfig

    expect(pluginConfig.target.type).toBe('docsCollection')
  })
})

describeWithPostgres('payloadMarkdownDocs dev app integration', () => {
  let payload: Payload | undefined

  afterAll(async () => {
    await payload?.destroy()
  })

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  test('registers Phase 2 collections in the dev app', () => {
    expect(payload?.collections[DEFAULT_DOCS_COLLECTION_SLUG]).toBeDefined()
    expect(payload?.collections[DEFAULT_DOCS_GROUPS_COLLECTION_SLUG]).toBeDefined()
    expect(payload?.collections[DEFAULT_DOCS_SETS_COLLECTION_SLUG]).toBeDefined()
    expect(payload?.collections[DEFAULT_DOCS_SYNC_RUNS_COLLECTION_SLUG]).toBeDefined()
    expect(payload?.collections[DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG]).toBeDefined()
  })

  test('enables the draft-capable generated docs collection in the dev app', () => {
    const docsCollection = payload?.config
      ? getCollection(payload.config, DEFAULT_DOCS_COLLECTION_SLUG)
      : undefined

    expect(docsCollection?.versions).toMatchObject({
      drafts: expect.any(Object),
    })
  })

  test('registers sync endpoint without template behavior in the dev app', () => {
    expect(payload?.collections['plugin-collection']).toBeUndefined()
    expect(payload?.config.endpoints).toContainEqual(
      expect.objectContaining({
        method: 'post',
        path: '/payload-markdown-docs/sync',
      }),
    )
    expect(payload?.config.endpoints).not.toContainEqual(
      expect.objectContaining({
        path: '/my-plugin-endpoint',
      }),
    )
  })
})
