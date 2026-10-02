import type { CollectionConfig, Config, Field } from 'payload'

import { buildConfig } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { payloadMarkdownDocs } from './plugin.js'

const fakeDb = { defaultIDType: 'number', init: () => ({}) } as never

const baseCollections = (withMedia: boolean): CollectionConfig[] => [
  { slug: 'users', auth: true, fields: [] },
  {
    slug: 'pages',
    fields: [
      { name: 'layout', type: 'blocks', blocks: [] },
      { name: 'hero', type: 'group', fields: [] },
    ],
  },
  ...(withMedia ? [{ slug: 'media', fields: [], upload: true }] : []),
]

const collectUploadTargets = (fields: Field[] | undefined, targets: string[] = []): string[] => {
  for (const field of fields ?? []) {
    const record = field as {
      blocks?: { fields: Field[] }[]
      fields?: Field[]
      relationTo?: string | string[]
      tabs?: { fields?: Field[] }[]
      type?: string
    }

    if (record.type === 'upload' && record.relationTo) {
      targets.push(...(Array.isArray(record.relationTo) ? record.relationTo : [record.relationTo]))
    }

    collectUploadTargets(record.fields, targets)
    record.tabs?.forEach((tab) => collectUploadTargets(tab.fields, targets))
    record.blocks?.forEach((block) => collectUploadTargets(block.fields, targets))
  }

  return targets
}

const pluginOptions = { collections: { pages: { blocks: true, heroes: true } } }

describe('apps without a media upload collection (X-17)', () => {
  it('builds a valid config and omits media fields with one warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const config = await buildConfig({
      collections: baseCollections(false),
      db: fakeDb,
      plugins: [payloadMarkdownDocs(pluginOptions)],
      secret: 'test',
    })

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('"media" not found')
    warn.mockRestore()

    for (const collection of config.collections) {
      expect(collectUploadTargets(collection.fields)).not.toContain('media')
    }
  })

  it('leaves the config unchanged for apps that define media', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const config = payloadMarkdownDocs(pluginOptions)({
      collections: baseCollections(true),
    } as unknown as Config)

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()

    const targetsBySlug = Object.fromEntries(
      (config.collections ?? []).map((collection) => [
        collection.slug,
        collectUploadTargets(collection.fields),
      ]),
    )

    expect(targetsBySlug['docs-sets']).toEqual(['media'])
    expect(targetsBySlug.docs).toEqual(['media'])
    expect(targetsBySlug.pages?.filter((slug) => slug === 'media').length).toBeGreaterThan(0)
  })
})
