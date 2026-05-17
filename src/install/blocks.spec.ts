import type { Block, CollectionConfig, Config, Field } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import {
  backgroundMediaFields,
  ctaButtonsField,
  DocsCTABlock,
  docsPageRelationshipField,
  DocsPreviewBlock,
  DocsBannerBlock as PublicDocsBannerBlock,
  DocsCalloutBlock as PublicDocsCalloutBlock,
  skillCTAFields,
} from '../blocks/index.js'
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

const getNamedNestedField = (fields: Field[], name: string): Field | undefined =>
  getNestedFields(fields).find(
    (field) => 'name' in field && typeof field.name === 'string' && field.name === name,
  )

type FindByIDArgs = {
  collection: string
  id: number | string
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

describe('docs marketing block field shapes', () => {
  it('keeps DocsPreview docsSet-first and removes broad item modes', () => {
    expect(getTopLevelFieldNames(DocsPreviewBlock)).toEqual([
      'docsSet',
      'heading',
      'description',
      'ctaButtons',
      'skills',
    ])
    expect(getNestedFieldNames(DocsPreviewBlock.fields)).not.toEqual(
      expect.arrayContaining(['mode', 'items', 'docs', 'maxItems', 'viewAllUrl']),
    )
    expect(getNestedFieldNames(DocsPreviewBlock.fields)).toContain('viewAllLabel')
  })

  it('keeps DocsCTA badges and removes manual docs URL', () => {
    const names = getTopLevelFieldNames(DocsCTABlock)

    expect(names).toContain('docsSet')
    expect(names).toContain('badges')
    expect(names).not.toContain('docsUrl')
  })

  it('keeps DocsBanner badge and removes no retained visual controls', () => {
    const names = getTopLevelFieldNames(PublicDocsBannerBlock)

    expect(names).toContain('docsSet')
    expect(names).toContain('badge')
    expect(getNestedFieldNames(PublicDocsBannerBlock.fields)).toEqual(
      expect.arrayContaining(['textAlign', 'size', 'theme']),
    )
  })

  it('keeps DocsCallout scoped to docs pages in the selected docs set', () => {
    const names = getNestedFieldNames(PublicDocsCalloutBlock.fields)

    expect(names).toEqual(expect.arrayContaining(['docsSet', 'docsPage', 'ctaLabel']))
    expect(names).not.toEqual(
      expect.arrayContaining(['manualHref', 'routeReference', 'calloutType']),
    )
  })

  it('hides advanced background controls and removes decorative alt and captions', () => {
    const backgroundField = backgroundMediaFields()
    const names = getNestedFieldNames(backgroundField.fields)

    expect(names).toEqual(expect.arrayContaining(['media', 'position', 'advancedControls']))
    expect(names).not.toEqual(expect.arrayContaining(['alt', 'caption']))

    for (const name of ['fit', 'overlay', 'overlayOpacity', 'overlayVariant', 'gradient']) {
      const field = getNamedNestedField(backgroundField.fields, name) as
        | ({
            admin?: {
              condition?: (data: unknown, siblingData: Record<string, unknown>) => boolean
            }
          } & Field)
        | undefined

      expect(field?.admin?.condition?.({}, {})).toBe(false)
      expect(field?.admin?.condition?.({}, { advancedControls: true })).toBe(true)
    }
  })

  it('keeps CTA buttons scoped to docs sets without polymorphic references', () => {
    const names = getNestedFieldNames(ctaButtonsField().fields)

    expect(names).toEqual(expect.arrayContaining(['label', 'variant', 'target', 'page', 'url']))
    expect(names).not.toEqual(expect.arrayContaining(['type', 'reference', 'description']))
  })

  it('keeps skills automatic without author-managed item arrays', () => {
    const names = getNestedFieldNames(skillCTAFields().fields)

    expect(names).toEqual(expect.arrayContaining(['enabled', 'display', 'heading', 'description']))
    expect(names).not.toEqual(
      expect.arrayContaining(['items', 'href', 'routeReference', 'downloadLabel']),
    )
  })

  it('filters docs page choices by the selected docs set', () => {
    const field = docsPageRelationshipField() as {
      filterOptions: (args: {
        blockData?: Record<string, unknown>
        siblingData?: Record<string, unknown>
      }) => unknown
    } & Field

    expect(field.filterOptions({ blockData: { docsSet: 'set-1' } })).toEqual({
      docsSet: {
        equals: 'set-1',
      },
    })
    expect(field.filterOptions({ siblingData: { docsSet: { id: 'set-2' } } })).toEqual({
      docsSet: {
        equals: 'set-2',
      },
    })
    expect(field.filterOptions({})).toBe(false)
  })

  it('validates heading overrides against available docs relationship titles', async () => {
    const ctaHeadingField = getNamedNestedField(DocsCTABlock.fields, 'heading') as
      | ({
          validate?: (
            value: unknown,
            options: { req?: unknown; siblingData: Record<string, unknown> },
          ) => Promise<string | true> | string | true
        } & Field)
      | undefined
    const calloutHeadingField = getNamedNestedField(PublicDocsCalloutBlock.fields, 'heading') as
      | ({
          validate?: (
            value: unknown,
            options: { req?: unknown; siblingData: Record<string, unknown> },
          ) => Promise<string | true> | string | true
        } & Field)
      | undefined
    const req = {
      payload: {
        findByID: vi.fn((args: FindByIDArgs) => {
          const collection = args.collection
          const id = args.id

          return Promise.resolve(
            id === 'with-title'
              ? {
                  id,
                  collection,
                  title: collection === 'docs' ? 'Configuration' : 'Payload Markdown',
                }
              : {
                  id,
                  collection,
                },
          )
        }),
      },
    }

    expect(await ctaHeadingField?.validate?.(undefined, { req, siblingData: {} })).toBe(
      'Add a heading or select a docs set with a title.',
    )
    expect(
      await ctaHeadingField?.validate?.(undefined, {
        req,
        siblingData: {
          docsSet: {
            title: 'Payload Markdown',
          },
        },
      }),
    ).toBe(true)
    expect(
      await ctaHeadingField?.validate?.('Override heading', {
        req,
        siblingData: {},
      }),
    ).toBe(true)
    expect(
      await calloutHeadingField?.validate?.(undefined, {
        req,
        siblingData: {
          docsPage: {
            title: 'Configuration',
          },
        },
      }),
    ).toBe(true)
    expect(
      await ctaHeadingField?.validate?.(undefined, {
        req,
        siblingData: {
          docsSet: 'with-title',
        },
      }),
    ).toBe(true)
    expect(
      await ctaHeadingField?.validate?.(undefined, {
        req,
        siblingData: {
          docsSet: 'missing-title',
        },
      }),
    ).toBe('Add a heading or select a docs set with a title.')
  })
})
