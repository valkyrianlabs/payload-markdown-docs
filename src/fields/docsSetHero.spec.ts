import type { Config, Field } from 'payload'

import { describe, expect, it } from 'vitest'

import { payloadMarkdownDocs } from '../plugin.js'
import { docsHeroField } from './docsSetHero.js'

type FieldRecord = {
  admin?: {
    condition?: (data: unknown, siblingData: Record<string, unknown>) => boolean
    custom?: Record<string, unknown>
  }
  fields?: Field[]
  name?: string
  options?: ({ label: string; value: string } | string)[]
  tabs?: ({ fields?: Field[] } & Record<string, unknown>)[]
  type?: string
} & Field

const getNestedFields = (fields: Field[]): FieldRecord[] =>
  fields.flatMap((field): FieldRecord[] => {
    const record = field as FieldRecord
    const childFields = Array.isArray(record.fields) ? getNestedFields(record.fields) : []
    const tabFields = Array.isArray(record.tabs)
      ? record.tabs.flatMap((tab) => (Array.isArray(tab.fields) ? getNestedFields(tab.fields) : []))
      : []

    return [record, ...childFields, ...tabFields]
  })

const getField = (fields: Field[], name: string): FieldRecord | undefined =>
  getNestedFields(fields).find((field) => field.name === name)

const optionValues = (field: FieldRecord | undefined): string[] =>
  (field?.options ?? []).flatMap((option) =>
    typeof option === 'string' ? [option] : [option.value],
  )

const localHeroField = (): Field =>
  ({
    name: 'hero',
    type: 'group',
    fields: [
      {
        name: 'type',
        type: 'select',
        defaultValue: 'none',
        options: [
          {
            label: 'None',
            value: 'none',
          },
          {
            label: 'High Impact',
            value: 'highImpact',
          },
        ],
      },
      {
        name: 'richText',
        type: 'richText',
      },
    ],
  }) as Field

describe('docsHeroField', () => {
  it('creates a standalone docs hero picker when no local hero is provided', () => {
    const field = docsHeroField()
    const typeField = getField(field.fields, 'type')

    expect(field).toMatchObject({
      name: 'hero',
      type: 'group',
      admin: {
        custom: {
          payloadMarkdownDocsHero: true,
        },
      },
    })
    expect(optionValues(typeField)).toEqual([
      'none',
      'docsSetFullWidth',
      'docsSetSideImage',
      'docsSetSideInfo',
    ])
    expect(getField(field.fields, 'docsSet')).toBeDefined()
    expect(getField(field.fields, 'skills')).toBeDefined()
  })

  it('merges docs hero variants into a local hero field and hides local fields for docs variants', () => {
    const field = docsHeroField({
      hero: localHeroField(),
    })
    const typeField = getField(field.fields, 'type')
    const richTextField = getField(field.fields, 'richText')

    expect(optionValues(typeField)).toEqual([
      'none',
      'highImpact',
      'docsSetFullWidth',
      'docsSetSideImage',
      'docsSetSideInfo',
    ])
    expect(richTextField?.admin?.condition?.({}, { type: 'highImpact' })).toBe(true)
    expect(richTextField?.admin?.condition?.({}, { type: 'docsSetFullWidth' })).toBe(false)
    expect(
      getField(field.fields, 'docsSet')?.admin?.condition?.({}, { type: 'docsSetFullWidth' }),
    ).toBe(true)
  })

  it('reuses common local hero heading and description fields instead of duplicating them', () => {
    const field = docsHeroField({
      hero: {
        ...localHeroField(),
        fields: [
          ...((localHeroField() as FieldRecord).fields ?? []),
          {
            name: 'heading',
            type: 'text',
          },
          {
            name: 'description',
            type: 'textarea',
          },
        ],
      } as Field,
    })
    const fieldNames = field.fields.flatMap((candidate) => {
      const name = (candidate as FieldRecord).name

      return typeof name === 'string' ? [name] : []
    })

    expect(fieldNames.filter((name) => name === 'heading')).toHaveLength(1)
    expect(fieldNames.filter((name) => name === 'description')).toHaveLength(1)
    expect(getField(field.fields, 'heading')?.admin?.condition).toBeUndefined()
    expect(getField(field.fields, 'description')?.admin?.condition).toBeUndefined()
  })

  it('plugin heros option wraps an existing pages hero field and installs the resolver hook', () => {
    const plugin = payloadMarkdownDocs({
      heros: true,
    })
    const config = plugin({
      collections: [
        {
          slug: 'pages',
          fields: [
            {
              type: 'tabs',
              tabs: [
                {
                  fields: [localHeroField()],
                  label: 'Hero',
                },
              ],
            },
          ],
        },
      ],
    } as Config) as Config
    const pages = config.collections?.find((collection) => collection.slug === 'pages')
    const hero = pages ? getField(pages.fields, 'hero') : undefined

    expect(hero?.admin?.custom?.payloadMarkdownDocsHero).toBe(true)
    expect(optionValues(getField(hero?.fields ?? [], 'type'))).toContain('docsSetSideImage')
    expect(optionValues(getField(hero?.fields ?? [], 'type'))).toContain('docsSetSideInfo')
    expect(pages?.hooks?.afterRead).toHaveLength(1)
  })
})
