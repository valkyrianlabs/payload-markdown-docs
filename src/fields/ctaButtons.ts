import type { ArrayField, Field, GroupField } from 'payload'

import { docsPageRelationshipField } from './docsReferences.js'

export type DocsCTAButtonFieldOptions = {
  maxRows?: number
  minRows?: number
  name?: string
  required?: boolean
}

export type DocsLinkFieldOptions = {
  name?: string
  required?: boolean
}

const variantOptions = [
  { label: 'Primary', value: 'primary' },
  { label: 'Secondary', value: 'secondary' },
  { label: 'Outline', value: 'outline' },
  { label: 'Ghost', value: 'ghost' },
  { label: 'Link', value: 'link' },
]

const createLinkFields = ({
  required = false,
}: Pick<DocsLinkFieldOptions, 'required'> = {}): Field[] => [
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
        name: 'target',
        type: 'radio',
        admin: {
          layout: 'horizontal',
          width: '50%',
        },
        defaultValue: 'set',
        options: [
          {
            label: 'Selected docs set docs route',
            value: 'set',
          },
          {
            label: 'Page in selected docs set',
            value: 'setPage',
          },
          {
            label: 'Custom URL',
            value: 'custom',
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
  docsPageRelationshipField({
    name: 'page',
    condition: (_data, siblingData) => siblingData?.target === 'setPage',
  }),
  {
    name: 'url',
    type: 'text',
    admin: {
      condition: (_data, siblingData) => siblingData?.target === 'custom',
      description: 'Custom URL used only when the button target is Custom URL.',
    },
    label: 'URL',
    required,
  },
  {
    name: 'icon',
    type: 'text',
    admin: {
      description: 'Optional icon name. SVG/icon rendering requires renderer or plugin icon support.',
      width: '50%',
    },
  },
]

export const linkField = ({
  name = 'link',
  required,
}: DocsLinkFieldOptions = {}): GroupField => ({
  name,
  type: 'group',
  admin: {
    hideGutter: true,
  },
  fields: createLinkFields({
    required,
  }),
})

export const ctaButtonsField = ({
  name = 'ctaButtons',
  maxRows,
  minRows,
  required = false,
}: DocsCTAButtonFieldOptions = {}): ArrayField => ({
  name,
  type: 'array',
  admin: {
    initCollapsed: true,
  },
  fields: createLinkFields({
    required,
  }),
  label: 'CTA Buttons',
  maxRows,
  minRows,
  required,
})
