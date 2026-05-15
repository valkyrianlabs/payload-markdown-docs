import type { ArrayField, Field, GroupField } from 'payload'

import {
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
} from '../constants.js'

export type DocsCTAButtonFieldOptions = {
  maxRows?: number
  minRows?: number
  name?: string
  relationTo?: string[]
  required?: boolean
}

export type DocsLinkFieldOptions = {
  name?: string
  relationTo?: string[]
  required?: boolean
}

const defaultReferenceCollections = [
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
]

const variantOptions = [
  { label: 'Primary', value: 'primary' },
  { label: 'Secondary', value: 'secondary' },
  { label: 'Outline', value: 'outline' },
  { label: 'Ghost', value: 'ghost' },
  { label: 'Link', value: 'link' },
]

const createReferenceField = ({
  relationTo = defaultReferenceCollections,
  required = false,
}: Pick<DocsLinkFieldOptions, 'relationTo' | 'required'> = {}): Field => {
  const fieldBase = {
    name: 'reference',
    type: 'relationship' as const,
    admin: {
      condition: (_data: Partial<unknown>, siblingData: Partial<Record<string, unknown>>) =>
        siblingData?.type === 'reference',
      description: 'Optional populated docs, group, or set reference.',
    },
    label: 'Internal reference',
    maxDepth: 1,
    required,
  }

  if (relationTo.length === 1) {
    return {
      ...fieldBase,
      relationTo: relationTo[0] ?? DEFAULT_DOCS_COLLECTION_SLUG,
    }
  }

  return {
    ...fieldBase,
    relationTo,
  }
}

const createLinkFields = ({
  relationTo = defaultReferenceCollections,
  required = false,
}: Pick<DocsLinkFieldOptions, 'relationTo' | 'required'> = {}): Field[] => [
  {
    type: 'row',
    fields: [
      {
        name: 'label',
        type: 'text',
        admin: {
          width: '50%',
        },
        required,
      },
      {
        name: 'variant',
        type: 'select',
        admin: {
          width: '50%',
        },
        defaultValue: 'primary',
        options: variantOptions,
      },
    ],
  },
  {
    type: 'row',
    fields: [
      {
        name: 'type',
        type: 'radio',
        admin: {
          layout: 'horizontal',
          width: '50%',
        },
        defaultValue: 'custom',
        options: [
          {
            label: 'Custom URL',
            value: 'custom',
          },
          {
            label: 'Internal reference',
            value: 'reference',
          },
        ],
      },
      {
        name: 'newTab',
        type: 'checkbox',
        admin: {
          style: {
            alignSelf: 'flex-end',
          },
          width: '50%',
        },
        label: 'Open in new tab',
      },
    ],
  },
  {
    name: 'url',
    type: 'text',
    admin: {
      condition: (_data, siblingData) => siblingData?.type !== 'reference',
      description: 'Use a docs route, product skills route, or external URL.',
    },
    label: 'URL',
    required,
  },
  createReferenceField({
    relationTo,
    required,
  }),
  {
    type: 'row',
    fields: [
      {
        name: 'icon',
        type: 'text',
        admin: {
          description: 'Optional icon name for user renderers that support icons.',
          width: '50%',
        },
      },
      {
        name: 'description',
        type: 'text',
        admin: {
          width: '50%',
        },
      },
    ],
  },
]

export const linkField = ({
  name = 'link',
  relationTo,
  required,
}: DocsLinkFieldOptions = {}): GroupField => ({
  name,
  type: 'group',
  admin: {
    hideGutter: true,
  },
  fields: createLinkFields({
    relationTo,
    required,
  }),
})

export const buttonField = linkField

export const ctaButtonsField = ({
  name = 'ctaButtons',
  maxRows,
  minRows,
  relationTo,
  required = false,
}: DocsCTAButtonFieldOptions = {}): ArrayField => ({
  name,
  type: 'array',
  admin: {
    initCollapsed: true,
  },
  fields: createLinkFields({
    relationTo,
    required,
  }),
  label: 'CTA Buttons',
  maxRows,
  minRows,
  required,
})

export const linksArrayField = ctaButtonsField
