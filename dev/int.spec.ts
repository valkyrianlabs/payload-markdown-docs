import type { PayloadMarkdownDocsConfig } from '@valkyrianlabs/payload-markdown-docs'
import type { Config, Payload } from 'payload'

import config from '@payload-config'
import { payloadMarkdownDocs } from '@valkyrianlabs/payload-markdown-docs'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('payloadMarkdownDocs plugin skeleton', () => {
  test('exports the plugin factory', () => {
    expect(typeof payloadMarkdownDocs).toBe('function')
  })

  test('disabled plugin returns incoming config unchanged', () => {
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
  })

  test('enabled plugin preserves existing collections without adding template fields', () => {
    const incomingConfig = {
      collections: [
        {
          slug: 'posts',
          fields: [
            {
              name: 'title',
              type: 'text',
            },
          ],
        },
      ],
    } as Config

    const transformedConfig = payloadMarkdownDocs({ enabled: true })(incomingConfig)
    const postsCollection = transformedConfig.collections?.find(
      (collection) => collection.slug === 'posts',
    )

    expect(transformedConfig).not.toBe(incomingConfig)
    expect(transformedConfig.collections).toHaveLength(1)
    expect(postsCollection?.fields).toEqual([
      {
        name: 'title',
        type: 'text',
      },
    ])
    expect(postsCollection?.fields).not.toContainEqual(
      expect.objectContaining({ name: 'addedByPlugin' }),
    )
  })

  test('accepts the public Phase 1 config shape', () => {
    const pluginConfig = {
      auth: {
        keys: [
          {
            id: 'github-actions-main',
            publicKey: 'test-public-key',
          },
        ],
        mode: 'ed25519',
      },
      enabled: true,
      endpoint: {
        maxBodyBytes: 5_000_000,
        path: '/payload-markdown-docs/sync',
      },
      sources: [
        {
          id: 'main-docs',
          root: 'docs',
          routeBase: '/docs',
        },
      ],
      sync: {
        defaultPublishMode: 'draft',
        deleteBehavior: 'archive',
        requireDryRunBeforeApply: false,
      },
      target: {
        slug: 'docs',
        type: 'docsCollection',
        enableDrafts: true,
        markdownField: 'content',
      },
    } satisfies PayloadMarkdownDocsConfig

    expect(pluginConfig.auth?.mode).toBe('ed25519')
  })
})

describe('payloadMarkdownDocs dev app integration', () => {
  let payload: Payload | undefined

  afterAll(async () => {
    await payload?.destroy()
  })

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  test('does not register template collections, fields, or endpoints in the dev app', () => {
    expect(payload).toBeDefined()
    expect(payload?.collections['plugin-collection']).toBeUndefined()

    const postsCollection = payload?.config.collections.find(
      (collection) => collection.slug === 'posts',
    )

    expect(postsCollection?.fields).not.toContainEqual(
      expect.objectContaining({ name: 'addedByPlugin' }),
    )
    expect(payload?.config.endpoints).not.toContainEqual(
      expect.objectContaining({
        path: '/my-plugin-endpoint',
      }),
    )
  })
})
