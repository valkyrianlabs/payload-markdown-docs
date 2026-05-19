import type { Block, CollectionConfig, Config, Field } from 'payload'

import { describe, expect, it } from 'vitest'

import { DocsCTABlock } from '../blocks/index.js'
import { payloadMarkdownDocs } from '../plugin.js'
import { docsMarketingBlocks, installBlocksIntoCollection } from './blocks.js'
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

const getTopLevelFieldNames = (block: Block): string[] =>
  block.fields.flatMap((field) =>
    'name' in field && typeof field.name === 'string' ? [field.name] : [],
  )

const getNestedFields = (fields: Field[]): Field[] =>
  fields.flatMap((field) => {
    const candidate = field as {
      fields?: Field[]
      tabs?: { fields?: Field[] }[]
    } & Field
    const childFields = [
      ...(Array.isArray(candidate.fields) ? getNestedFields(candidate.fields) : []),
      ...(Array.isArray(candidate.tabs)
        ? candidate.tabs.flatMap((tab) => getNestedFields(tab.fields ?? []))
        : []),
    ]

    return [field, ...childFields]
  })

const getNestedFieldNames = (fields: Field[]): string[] =>
  getNestedFields(fields).flatMap((field) =>
    'name' in field && typeof field.name === 'string' ? [field.name] : [],
  )

const getFieldByName = (fields: Field[], name: string): ({ name: string } & Field) | undefined =>
  getNestedFields(fields).find(
    (field): field is { name: string } & Field =>
      'name' in field && typeof field.name === 'string' && field.name === name,
  )

const conditionResult = (field: Field | undefined, siblingData: Record<string, unknown>) => {
  const condition = (field as { admin?: { condition?: (data: unknown, siblingData: Record<string, unknown>) => boolean } } | undefined)
    ?.admin?.condition

  return condition ? condition({}, siblingData) : undefined
}

describe('docs in-page block selection', () => {
  it('installs only Docs CTA with blocks true', () => {
    expect(selectedKeys(resolveBlockSelection(true))).toEqual(['docsCTA'])
  })

  it('selects explicit docsCTA from a partial global object', () => {
    expect(selectedKeys(resolveBlockSelection({ docsCTA: true }))).toEqual(['docsCTA'])
  })

  it('maps legacy cta selection to docsCTA internally', () => {
    expect(selectedKeys(resolveBlockSelection({ cta: true }))).toEqual(['docsCTA'])
  })

  it('does not select removed block keys', () => {
    expect(
      selectedKeys(
        resolveBlockSelection({
          docsBanner: true,
          docsCallout: true,
          docsExcerpt: true,
          docsPreview: true,
          docsSnippetCallout: true,
        } as never),
      ),
    ).toEqual([])
  })

  it('supports terse collection true form', () => {
    expect(
      selectedKeys(
        resolveCollectionBlockSelection({
          collectionConfig: true,
        }),
      ),
    ).toEqual(['docsCTA'])
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
    ).toEqual(['docsCTA'])
  })

  it('lets collection config disable a globally selected Docs CTA', () => {
    expect(
      selectedKeys(
        resolveCollectionBlockSelection({
          collectionConfig: {
            blocks: {
              docsCTA: false,
            },
          },
          globalSelection: true,
        }),
      ),
    ).toEqual([])
  })
})

describe('docs in-page block installer', () => {
  it('exports only Docs CTA from the block registry', () => {
    expect(Object.keys(docsMarketingBlocks)).toEqual(['docsCTA'])
    expect(DocsCTABlock.slug).toBe('docsCTA')
    expect(DocsCTABlock.interfaceName).toBe('DocsCTABlock')
    expect(DocsCTABlock.labels).toEqual({
      plural: 'Docs CTAs',
      singular: 'Docs CTA',
    })
  })

  it('appends Docs CTA to existing block fields without duplicating slugs', () => {
    const existingCTA = {
      slug: DocsCTABlock.slug,
      fields: [],
    } as Block
    const collection: CollectionConfig = {
      slug: 'pages',
      fields: [layoutField([existingCTA])],
    }

    const result = installBlocksIntoCollection(collection, [DocsCTABlock])

    expect(result.blockFieldFound).toBe(true)
    expect(result.changed).toBe(false)
    expect(getBlockFieldSlugs(result.collection)).toEqual(['docsCTA'])
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
        docsCTA: true,
      },
      collections: {
        pages: {
          blocks: false,
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

    expect(pages ? getBlockFieldSlugs(pages) : []).toEqual([])
    expect(posts ? getBlockFieldSlugs(posts) : []).toEqual(['docsCTA'])
    expect(pages?.hooks?.afterRead).toBeUndefined()
    expect(posts?.hooks?.afterRead).toHaveLength(1)
  })
})

describe('docs in-page block field shapes', () => {
  it('keeps Docs CTA docs-set-first with one action mode', () => {
    expect(getTopLevelFieldNames(DocsCTABlock)).toEqual([
      'docsSet',
      'actionType',
      'overrideContent',
      'heading',
      'description',
      'docsLabel',
      'skillOverrides',
      'variant',
    ])
    expect(getNestedFieldNames(DocsCTABlock.fields)).toEqual(
      expect.arrayContaining(['docsSet', 'actionType', 'overrideContent', 'heading', 'description', 'docsLabel', 'skillOverrides', 'agent', 'label', 'variant']),
    )
    expect(getNestedFieldNames(DocsCTABlock.fields)).not.toEqual(
      expect.arrayContaining([
        'action',
        'background',
        'badges',
        'ctaButtons',
        'doc',
        'docsPage',
        'href',
        'layout',
        'page',
        'target',
        'theme',
        'url',
      ]),
    )
  })

  it('requires docsSet and actionType', () => {
    expect(getFieldByName(DocsCTABlock.fields, 'docsSet')).toMatchObject({
      type: 'relationship',
      maxDepth: 2,
      relationTo: 'docs-sets',
      required: true,
    })
    expect(getFieldByName(DocsCTABlock.fields, 'actionType')).toMatchObject({
      type: 'radio',
      defaultValue: 'docsLink',
      required: true,
    })
  })

  it('hides title and description overrides behind overrideContent', () => {
    expect(getFieldByName(DocsCTABlock.fields, 'overrideContent')).toMatchObject({
      type: 'checkbox',
      defaultValue: false,
    })
    expect(conditionResult(getFieldByName(DocsCTABlock.fields, 'heading'), {
      overrideContent: true,
    })).toBe(true)
    expect(conditionResult(getFieldByName(DocsCTABlock.fields, 'heading'), {
      overrideContent: false,
    })).toBe(false)
    expect(conditionResult(getFieldByName(DocsCTABlock.fields, 'description'), {
      overrideContent: true,
    })).toBe(true)
  })

  it('shows docsLabel only for docsLink mode and skillOverrides only for skills mode', () => {
    expect(getFieldByName(DocsCTABlock.fields, 'docsLabel')).toMatchObject({
      type: 'text',
      defaultValue: 'Read the docs',
    })
    expect(conditionResult(getFieldByName(DocsCTABlock.fields, 'docsLabel'), {
      actionType: 'docsLink',
    })).toBe(true)
    expect(conditionResult(getFieldByName(DocsCTABlock.fields, 'docsLabel'), {
      actionType: 'skills',
    })).toBe(false)
    expect(conditionResult(getFieldByName(DocsCTABlock.fields, 'skillOverrides'), {
      actionType: 'skills',
    })).toBe(true)
    expect(conditionResult(getFieldByName(DocsCTABlock.fields, 'skillOverrides'), {
      actionType: 'docsLink',
    })).toBe(false)
    expect(getFieldByName(DocsCTABlock.fields, 'agent')).toMatchObject({
      type: 'text',
      required: true,
    })
  })
})
