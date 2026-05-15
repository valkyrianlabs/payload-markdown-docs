import type { Field, GroupField } from 'payload'

import {
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
} from '../constants.js'

export type DocsSkillCTAFieldOptions = {
  name?: string
  relationTo?: string[]
}

const createRouteReferenceField = (relationTo?: string[]): Field => {
  const slugs = relationTo?.length
    ? relationTo
    : [
        DEFAULT_DOCS_COLLECTION_SLUG,
        DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
        DEFAULT_DOCS_SETS_COLLECTION_SLUG,
      ]
  const fieldBase = {
    name: 'routeReference',
    type: 'relationship' as const,
    admin: {
      description: 'Optional populated reference if your renderer can resolve it.',
      width: '50%',
    },
    label: 'Route reference',
    maxDepth: 1,
  }

  if (slugs.length === 1) {
    return {
      ...fieldBase,
      relationTo: slugs[0] ?? DEFAULT_DOCS_COLLECTION_SLUG,
    }
  }

  return {
    ...fieldBase,
    relationTo: slugs,
  }
}

const enabledCondition = (_data: Partial<unknown>, siblingData: Partial<Record<string, unknown>>) =>
  siblingData?.enabled === true

export const skillCTAFields = ({
  name = 'skills',
  relationTo,
}: DocsSkillCTAFieldOptions = {}): GroupField => ({
  name,
  type: 'group',
  admin: {
    description: 'Feature downloadable Claude, Codex, or custom agent skills.',
  },
  fields: [
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'display',
          type: 'select',
          admin: {
            condition: enabledCondition,
            width: '33%',
          },
          defaultValue: 'buttons',
          options: [
            {
              label: 'Buttons',
              value: 'buttons',
            },
            {
              label: 'Tabs',
              value: 'tabs',
            },
            {
              label: 'Cards',
              value: 'cards',
            },
          ],
        },
        {
          name: 'heading',
          type: 'text',
          admin: {
            condition: enabledCondition,
            width: '33%',
          },
        },
        {
          name: 'description',
          type: 'text',
          admin: {
            condition: enabledCondition,
            width: '33%',
          },
        },
      ],
    },
    {
      name: 'items',
      type: 'array',
      admin: {
        condition: enabledCondition,
        initCollapsed: true,
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'label',
              type: 'text',
              admin: {
                width: '50%',
              },
              required: true,
            },
            {
              name: 'type',
              type: 'select',
              admin: {
                width: '50%',
              },
              defaultValue: 'custom',
              options: [
                {
                  label: 'Claude',
                  value: 'claude',
                },
                {
                  label: 'Codex',
                  value: 'codex',
                },
                {
                  label: 'Custom',
                  value: 'custom',
                },
              ],
            },
          ],
        },
        {
          name: 'description',
          type: 'textarea',
        },
        {
          type: 'row',
          fields: [
            {
              name: 'href',
              type: 'text',
              admin: {
                description:
                  'Custom download URL. Use this for product skills routes when route helpers are app-specific.',
                width: '50%',
              },
              label: 'Download URL',
            },
            createRouteReferenceField(relationTo),
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'downloadLabel',
              type: 'text',
              admin: {
                width: '50%',
              },
            },
            {
              name: 'icon',
              type: 'text',
              admin: {
                description: 'Optional icon name for user renderers that support icons.',
                width: '50%',
              },
            },
          ],
        },
      ] satisfies Field[],
    },
  ],
})
