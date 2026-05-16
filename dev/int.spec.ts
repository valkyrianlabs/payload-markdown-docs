import type { CollectionConfig, Config, Payload } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { PayloadMarkdownDocsConfig } from '../dist'

import { payloadMarkdownDocs } from '../dist'
import {
  DEFAULT_DOCS_ACCESS_COLLECTION_SLUG,
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
  DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG,
  DEFAULT_DOCS_SYNC_RUNS_COLLECTION_SLUG,
  DEFAULT_MARKDOWN_FIELD_NAME,
  DOCS_GLOBALS_ADMIN_GROUP,
  DOCS_SET_MANAGER_COMPONENT,
} from '../src/constants.js'

type NamedField = {
  admin?: {
    components?: {
      Field?: string
    }
    condition?: (data: unknown, siblingData?: Record<string, unknown>) => boolean
    custom?: Record<string, unknown>
    hidden?: boolean
    position?: string
  }
  defaultValue?: unknown
  fields?: NamedField[]
  index?: boolean
  label?: string
  name?: string
  options?: Array<{ label?: string; value?: string }> | string[]
  relationTo?: string | string[]
  required?: boolean
  tabs?: Array<{
    fields?: NamedField[]
    label?: string
  }>
  type?: string
  unique?: boolean
  validate?: (value: unknown, options: { siblingData: Record<string, unknown> }) => string | true
}

const payloadMarkdownDocsSync =
  (pluginConfig: PayloadMarkdownDocsConfig) =>
  (incomingConfig: Config): Config =>
    payloadMarkdownDocs(pluginConfig)(incomingConfig) as Config

const isNamedField = (field: unknown, fieldName: string): field is NamedField =>
  typeof field === 'object' && field !== null && 'name' in field && field.name === fieldName

const getCollection = (
  configToSearch: { collections?: ReadonlyArray<{ slug: string }> } | undefined,
  slug: string,
) =>
  configToSearch?.collections?.find((collection) => collection.slug === slug) as
    | CollectionConfig
    | undefined

const getField = (collection: CollectionConfig | undefined, fieldName: string) =>
  getNamedFields(collection?.fields).find((field) => isNamedField(field, fieldName))

const getNamedFields = (
  fields: CollectionConfig['fields'] | NamedField[] | undefined,
): NamedField[] =>
  (fields ?? []).flatMap((field) => {
    const namedField = field as NamedField
    const childFields = [
      ...getNamedFields(namedField.fields),
      ...(namedField.tabs ?? []).flatMap((tab) => getNamedFields(tab.fields)),
    ]

    return [namedField, ...childFields]
  })

const getGroupField = (collection: CollectionConfig | undefined, fieldName: string) => {
  const field = getField(collection, fieldName)

  return field?.type === 'group' ? field : undefined
}

const getTopLevelFieldContaining = (collection: CollectionConfig | undefined, fieldName: string) =>
  collection?.fields.find((field) =>
    (field as NamedField).fields?.some((child) => isNamedField(child, fieldName)),
  ) as NamedField | undefined

const getTabsField = (collection: CollectionConfig | undefined) =>
  collection?.fields.find((field) => (field as NamedField).type === 'tabs') as
    | NamedField
    | undefined

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
    } as unknown as Config

    const transformedConfig = payloadMarkdownDocsSync({ enabled: false })(incomingConfig)

    expect(transformedConfig).toBe(incomingConfig)
    expect(transformedConfig.collections).toHaveLength(1)
    expect(transformedConfig.endpoints).toBeUndefined()
    expect(getCollection(transformedConfig, DEFAULT_DOCS_COLLECTION_SLUG)).toBeUndefined()
  })

  test('enabled plugin adds default docs infrastructure collections', () => {
    const transformedConfig = payloadMarkdownDocsSync({ enabled: true })({
      collections: [
        {
          slug: 'posts',
          fields: [],
        },
      ],
    } as unknown as Config)

    expect(getCollection(transformedConfig, 'posts')).toBeDefined()
    expect(getCollection(transformedConfig, DEFAULT_DOCS_GROUPS_COLLECTION_SLUG)).toBeDefined()
    expect(getCollection(transformedConfig, DEFAULT_DOCS_SETS_COLLECTION_SLUG)).toBeDefined()
    expect(getCollection(transformedConfig, DEFAULT_DOCS_ACCESS_COLLECTION_SLUG)).toBeDefined()
    expect(getCollection(transformedConfig, DEFAULT_DOCS_COLLECTION_SLUG)).toBeDefined()
    expect(getCollection(transformedConfig, DEFAULT_DOCS_SYNC_RUNS_COLLECTION_SLUG)).toBeDefined()
    expect(getCollection(transformedConfig, DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG)).toBeDefined()
    expect(transformedConfig.endpoints).toContainEqual(
      expect.objectContaining({
        method: 'post',
        path: '/documentation/sync',
      }),
    )
  })

  test('uses low-noise default admin sidebar visibility', () => {
    const transformedConfig = payloadMarkdownDocsSync({ enabled: true })({
      collections: [],
    } as unknown as Config)
    const docsGroupsCollection = getCollection(
      transformedConfig,
      DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
    )
    const docsSetsCollection = getCollection(transformedConfig, DEFAULT_DOCS_SETS_COLLECTION_SLUG)
    const docsCollection = getCollection(transformedConfig, DEFAULT_DOCS_COLLECTION_SLUG)
    const docsAccessCollection = getCollection(
      transformedConfig,
      DEFAULT_DOCS_ACCESS_COLLECTION_SLUG,
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
    expect(docsAccessCollection?.admin).toMatchObject({
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
    const transformedConfig = payloadMarkdownDocsSync({
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
    const transformedConfig = payloadMarkdownDocsSync({
      collections: {
        docsAccess: {
          slug: 'kb-docs-access',
        },
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
    expect(getCollection(transformedConfig, 'kb-docs-access')).toBeDefined()
    expect(getCollection(transformedConfig, 'kb-sync-runs')).toBeDefined()
    expect(getCollection(transformedConfig, 'kb-sync-nonces')).toBeDefined()
    expect(getCollection(transformedConfig, 'kb-docs-groups')?.admin?.group).toBe(
      DOCS_GLOBALS_ADMIN_GROUP,
    )
    expect(getCollection(transformedConfig, 'kb-docs-sets')?.admin?.group).toBe(
      DOCS_GLOBALS_ADMIN_GROUP,
    )
    expect(getCollection(transformedConfig, 'kb-docs-access')?.admin?.group).toBe(
      DOCS_GLOBALS_ADMIN_GROUP,
    )
    expect(getCollection(transformedConfig, 'kb-sync-runs')?.admin?.hidden).toBe(true)
    expect(getCollection(transformedConfig, 'kb-sync-nonces')?.admin?.hidden).toBe(true)
  })

  test('collection disabling is respected', () => {
    const transformedConfig = payloadMarkdownDocsSync({
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
      payloadMarkdownDocsSync({ enabled: true })({
        collections: [
          {
            slug: DEFAULT_DOCS_COLLECTION_SLUG,
            fields: [],
          },
        ],
      } as unknown as Config),
    ).toThrow(/already exists/)
  })

  test('unsupported existing collection target throws a clear error', () => {
    expect(() =>
      payloadMarkdownDocsSync({
        enabled: true,
        target: {
          type: 'existingCollection',
          collection: 'pages',
          markdownField: 'content',
        },
      } as unknown as PayloadMarkdownDocsConfig)({ collections: [] } as unknown as Config),
    ).toThrow(/existingCollection/)
  })

  test('docs collection contains expected fields', () => {
    const transformedConfig = payloadMarkdownDocsSync({ enabled: true })({
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
    const transformedConfig = payloadMarkdownDocsSync({
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
    const transformedConfig = payloadMarkdownDocsSync({ enabled: true })({
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
    expect(getField(docsGroupsCollection, 'generateSlug')?.type).toBe('checkbox')
    expect(getTopLevelFieldContaining(docsGroupsCollection, 'slug')?.admin?.position).toBe(
      'sidebar',
    )
    expect(getField(docsGroupsCollection, 'parent')?.admin?.position).toBe('sidebar')
    expect(getField(docsGroupsCollection, 'navTitle')?.admin?.position).toBe('sidebar')
    expect(getField(docsGroupsCollection, 'order')?.admin?.position).toBe('sidebar')
    expect(getField(docsGroupsCollection, 'pageMode')?.admin?.position).toBe('sidebar')
    expect(getField(docsGroupsCollection, 'routePath')).toBeUndefined()
    expect(getField(docsGroupsCollection, 'serveIndex')).toBeUndefined()
    expect(docsGroupsCollection?.admin?.group).toBe(DOCS_GLOBALS_ADMIN_GROUP)
  })

  test('docs access collection contains selector-driven auth fields', () => {
    const transformedConfig = payloadMarkdownDocsSync({ enabled: true })({
      collections: [],
    } as unknown as Config)
    const docsAccessCollection = getCollection(
      transformedConfig,
      DEFAULT_DOCS_ACCESS_COLLECTION_SLUG,
    )
    const accessTypeField = getField(docsAccessCollection, 'accessType')
    const identityKeyField = getField(docsAccessCollection, 'identityKey')
    const keyIdField = getField(docsAccessCollection, 'keyId')
    const publicKeyField = getField(docsAccessCollection, 'publicKey')
    const ownerField = getField(docsAccessCollection, 'owner')
    const limitReposField = getField(docsAccessCollection, 'limitRepos')
    const repositoriesField = getField(docsAccessCollection, 'repositories')

    expect(docsAccessCollection?.labels).toEqual({
      plural: 'Access',
      singular: 'Access',
    })
    expect(docsAccessCollection?.admin?.defaultColumns).toContain('accessType')
    expect(docsAccessCollection?.admin).toMatchObject({
      group: DOCS_GLOBALS_ADMIN_GROUP,
      useAsTitle: 'title',
    })
    expect(accessTypeField).toMatchObject({
      type: 'select',
      defaultValue: 'githubOidc',
      index: true,
      label: 'Type',
      required: true,
    })
    expect(accessTypeField?.options).toEqual([
      {
        label: 'Ed25519 Key',
        value: 'ed25519',
      },
      {
        label: 'GitHub OIDC',
        value: 'githubOidc',
      },
    ])
    expect(identityKeyField).toMatchObject({
      type: 'text',
      admin: {
        hidden: true,
      },
      index: true,
      unique: true,
    })
    expect(keyIdField).toMatchObject({
      type: 'text',
      index: true,
    })
    expect(publicKeyField).toMatchObject({
      type: 'textarea',
    })
    expect(ownerField).toMatchObject({
      type: 'text',
      index: true,
    })
    expect(limitReposField).toMatchObject({
      type: 'checkbox',
      defaultValue: false,
    })
    expect(typeof keyIdField?.validate).toBe('function')
    expect(typeof publicKeyField?.validate).toBe('function')
    expect(typeof ownerField?.validate).toBe('function')
    expect(keyIdField?.validate?.('', { siblingData: { accessType: 'ed25519' } })).toBe(
      'Key ID is required for this access type.',
    )
    expect(keyIdField?.validate?.('', { siblingData: { accessType: 'githubOidc' } })).toBe(true)
    expect(publicKeyField?.validate?.('', { siblingData: { accessType: 'ed25519' } })).toBe(
      'Public key is required for this access type.',
    )
    expect(ownerField?.validate?.('', { siblingData: { accessType: 'githubOidc' } })).toBe(
      'Owner is required for this access type.',
    )
    expect(ownerField?.validate?.('', { siblingData: { accessType: 'ed25519' } })).toBe(true)
    expect(keyIdField?.admin?.condition?.({}, { accessType: 'ed25519' })).toBe(true)
    expect(keyIdField?.admin?.condition?.({}, { accessType: 'githubOidc' })).toBe(false)
    expect(publicKeyField?.admin?.condition?.({}, { accessType: 'ed25519' })).toBe(true)
    expect(ownerField?.admin?.condition?.({}, { accessType: 'githubOidc' })).toBe(true)
    expect(limitReposField?.admin?.condition?.({}, { accessType: 'githubOidc' })).toBe(true)
    expect(
      repositoriesField?.admin?.condition?.(
        {},
        {
          accessType: 'githubOidc',
          limitRepos: true,
        },
      ),
    ).toBe(true)
    expect(
      repositoriesField?.admin?.condition?.(
        {},
        {
          accessType: 'githubOidc',
          limitRepos: false,
        },
      ),
    ).toBe(false)
    expect(
      repositoriesField?.admin?.condition?.(
        {},
        {
          accessType: 'ed25519',
          limitRepos: true,
        },
      ),
    ).toBe(false)
  })

  test('docs sets collection contains expected fields', () => {
    const transformedConfig = payloadMarkdownDocsSync({ enabled: true })({
      collections: [],
    } as unknown as Config)
    const docsSetsCollection = getCollection(transformedConfig, DEFAULT_DOCS_SETS_COLLECTION_SLUG)
    const advancedSecurityField = getGroupField(docsSetsCollection, 'advancedSecurity')
    const metaField = getGroupField(docsSetsCollection, 'meta')
    const syncField = getGroupField(docsSetsCollection, 'sync')
    const tabsField = getTabsField(docsSetsCollection)

    expect(getField(docsSetsCollection, 'title')?.type).toBe('text')
    expect(getField(docsSetsCollection, 'slug')?.type).toBe('text')
    expect(tabsField?.tabs?.map((tab) => tab.label)).toEqual(['Content', 'SEO', 'Security', 'Sync'])
    expect(getField(docsSetsCollection, 'sourceId')).toBeUndefined()
    expect(getField(docsSetsCollection, 'sourceRoot')).toBeUndefined()
    expect(getField(docsSetsCollection, 'group')?.relationTo).toBe(
      DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
    )
    expect(getField(docsSetsCollection, 'branch')?.type).toBe('text')
    expect(getField(docsSetsCollection, 'allowPullRequests')?.type).toBe('checkbox')
    expect(getField(docsSetsCollection, 'generateSlug')?.type).toBe('checkbox')
    expect(getTopLevelFieldContaining(docsSetsCollection, 'slug')?.admin?.position).toBe('sidebar')
    expect(getField(docsSetsCollection, 'group')?.admin?.position).toBe('sidebar')
    expect(getField(docsSetsCollection, 'routeMode')?.admin?.position).toBe('sidebar')
    expect(getField(docsSetsCollection, 'branch')?.admin?.position).toBe('sidebar')
    expect(getField(docsSetsCollection, 'allowPullRequests')?.admin?.position).toBe('sidebar')
    expect(getField(docsSetsCollection, 'routeBase')).toBeUndefined()
    expect(metaField?.label).toBe('SEO')
    expect(metaField?.fields?.map((field) => field.name)).toEqual(['title', 'description', 'image'])
    expect(metaField?.fields?.find((field) => field.name === 'image')).toMatchObject({
      type: 'upload',
      relationTo: 'media',
    })
    expect(getField(docsSetsCollection, 'publishedAt')).toMatchObject({
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    })
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
    expect(syncField?.fields?.map((field) => field.name)).toEqual(['lastSyncedAt', 'lastStatus'])
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

  test('docs sets SEO fields can be disabled', () => {
    const transformedConfig = payloadMarkdownDocsSync({
      enabled: true,
      seo: false,
    })({
      collections: [],
    } as unknown as Config)
    const docsSetsCollection = getCollection(transformedConfig, DEFAULT_DOCS_SETS_COLLECTION_SLUG)
    const tabsField = getTabsField(docsSetsCollection)

    expect(getGroupField(docsSetsCollection, 'meta')).toBeUndefined()
    expect(tabsField?.tabs?.map((tab) => tab.label)).toEqual(['Content', 'Security', 'Sync'])
  })

  test('docs set manager respects custom docs and docs set slugs', () => {
    const transformedConfig = payloadMarkdownDocsSync({
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
    const transformedConfig = payloadMarkdownDocsSync({ enabled: true })({
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
    const transformedConfig = payloadMarkdownDocsSync({ enabled: true })({
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
    expect(payload?.collections[DEFAULT_DOCS_ACCESS_COLLECTION_SLUG]).toBeDefined()
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
    expect(
      (payload?.collections as Record<string, unknown> | undefined)?.['plugin-collection'],
    ).toBeUndefined()
    expect(payload?.config.endpoints).toContainEqual(
      expect.objectContaining({
        method: 'post',
        path: '/documentation/sync',
      }),
    )
    expect(payload?.config.endpoints).not.toContainEqual(
      expect.objectContaining({
        path: '/my-plugin-endpoint',
      }),
    )
  })
})
