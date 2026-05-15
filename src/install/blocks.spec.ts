import type { Block, CollectionConfig, Config, Field } from 'payload'

import { describe, expect, it } from 'vitest'

import { DocsCTABlock, DocsPreviewBlock } from '../blocks/index.js'
import {
  ctaButtonsField,
  DocsBannerBlock as PublicDocsBannerBlock,
  DocsCalloutBlock as PublicDocsCalloutBlock,
} from '../index.js'
import { payloadMarkdownDocs } from '../plugin.js'
import { installBlocksIntoCollection } from './blocks.js'
import {
  getSelectedBlockKeys,
  resolveBlockSelection,
  resolveCollectionBlockSelection,
} from './resolveBlockSelection.js'

const selectedKeys = (selection: ReturnType<typeof resolveBlockSelection>) =>
  getSelectedBlockKeys(selection).sort()

const layoutField = (blocks: Block[] = []): Field =>
  ({
    name: 'layout',
    type: 'blocks',
    blocks,
  }) as Field

const getBlockFieldSlugs = (collection: CollectionConfig): string[] => {
  const field = collection.fields.find(
    (candidate) => 'type' in candidate && candidate.type === 'blocks',
  ) as ({ blocks?: Block[] } & Field) | undefined

  return field?.blocks?.map((block) => block.slug) ?? []
}

describe('docs marketing block selection', () => {
  it('selects all blocks with blocks true', () => {
    expect(selectedKeys(resolveBlockSelection(true))).toEqual([
      'banner',
      'callout',
      'cta',
      'preview',
    ])
  })

  it('selects only enabled blocks from a partial global object', () => {
    expect(selectedKeys(resolveBlockSelection({ cta: true }))).toEqual(['cta'])
  })

  it('supports terse collection true form', () => {
    expect(
      selectedKeys(
        resolveCollectionBlockSelection({
          collectionConfig: true,
        }),
      ),
    ).toEqual(['banner', 'callout', 'cta', 'preview'])
  })

  it('supports explicit collection object form', () => {
    expect(
      selectedKeys(
        resolveCollectionBlockSelection({
          collectionConfig: {
            blocks: true,
          },
        }),
      ),
    ).toEqual(['banner', 'callout', 'cta', 'preview'])
  })

  it('selects only scoped block keys when no global selection exists', () => {
    expect(
      selectedKeys(
        resolveCollectionBlockSelection({
          collectionConfig: {
            blocks: {
              cta: true,
            },
          },
        }),
      ),
    ).toEqual(['cta'])
  })

  it('lets collection config disable one globally selected block', () => {
    expect(
      selectedKeys(
        resolveCollectionBlockSelection({
          collectionConfig: {
            blocks: {
              banner: false,
            },
          },
          globalSelection: true,
        }),
      ),
    ).toEqual(['callout', 'cta', 'preview'])
  })

  it('lets collection true override a partial global selection', () => {
    expect(
      selectedKeys(
        resolveCollectionBlockSelection({
          collectionConfig: {
            blocks: true,
          },
          globalSelection: {
            cta: true,
            preview: true,
          },
        }),
      ),
    ).toEqual(['banner', 'callout', 'cta', 'preview'])
  })
})

describe('docs marketing block installer', () => {
  it('exports manual block configs and reusable fields from the main package', () => {
    expect(PublicDocsBannerBlock.slug).toBe('docsBanner')
    expect(PublicDocsCalloutBlock.slug).toBe('docsCallout')
    expect(ctaButtonsField().type).toBe('array')
  })

  it('appends blocks to existing block fields without duplicating slugs', () => {
    const existingCTA = {
      slug: DocsCTABlock.slug,
      fields: [],
    } as Block
    const collection: CollectionConfig = {
      slug: 'pages',
      fields: [layoutField([existingCTA])],
    }

    const result = installBlocksIntoCollection(collection, [DocsCTABlock, DocsPreviewBlock])

    expect(result.blockFieldFound).toBe(true)
    expect(result.changed).toBe(true)
    expect(getBlockFieldSlugs(result.collection)).toEqual(['docsCTA', 'docsPreview'])
  })

  it('does not change collections without compatible block fields', () => {
    const collection: CollectionConfig = {
      slug: 'pages',
      fields: [
        {
          name: 'title',
          type: 'text',
        },
      ],
    }

    const result = installBlocksIntoCollection(collection, [DocsCTABlock])

    expect(result.blockFieldFound).toBe(false)
    expect(result.changed).toBe(false)
    expect(result.collection).toBe(collection)
  })

  it('applies global and scoped plugin selections deterministically', () => {
    const plugin = payloadMarkdownDocs({
      blocks: {
        cta: true,
      },
      collections: {
        pages: {
          blocks: {
            banner: true,
          },
        },
      },
    })
    const config = plugin({
      collections: [
        {
          slug: 'pages',
          fields: [layoutField()],
        },
        {
          slug: 'posts',
          fields: [layoutField()],
        },
      ],
    } as Config) as Config

    const pages = config.collections?.find((collection) => collection.slug === 'pages')
    const posts = config.collections?.find((collection) => collection.slug === 'posts')

    expect(pages ? getBlockFieldSlugs(pages) : []).toEqual(['docsCTA', 'docsBanner'])
    expect(posts ? getBlockFieldSlugs(posts) : []).toEqual(['docsCTA'])
  })
})
