import type { Block } from 'payload'

import { DEFAULT_DOCS_COLLECTION_SLUG } from '../../constants.js'
import { ctaButtonsField } from '../../fields/ctaButtons.js'
import { skillCTAFields } from '../../fields/skills.js'

export const DocsPreviewBlock: Block = {
  slug: 'docsPreview',
  fields: [
    {
      name: 'heading',
      type: 'text',
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      type: 'row',
      fields: [
        {
          name: 'mode',
          type: 'select',
          admin: {
            width: '50%',
          },
          defaultValue: 'manual',
          options: [
            {
              label: 'Manual',
              value: 'manual',
            },
            {
              label: 'Set',
              value: 'set',
            },
            {
              label: 'Group',
              value: 'group',
            },
            {
              label: 'Pages',
              value: 'pages',
            },
            {
              label: 'Route',
              value: 'route',
            },
          ],
        },
        {
          name: 'layout',
          type: 'select',
          admin: {
            width: '50%',
          },
          defaultValue: 'cards',
          options: [
            {
              label: 'Cards',
              value: 'cards',
            },
            {
              label: 'List',
              value: 'list',
            },
            {
              label: 'Featured',
              value: 'featured',
            },
            {
              label: 'Compact',
              value: 'compact',
            },
          ],
        },
      ],
    },
    {
      name: 'items',
      type: 'array',
      admin: {
        description: 'Manual preview items. These render even without docs references.',
        initCollapsed: true,
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'title',
              type: 'text',
              admin: {
                width: '50%',
              },
              required: true,
            },
            {
              name: 'href',
              type: 'text',
              admin: {
                width: '50%',
              },
            },
          ],
        },
        {
          name: 'excerpt',
          type: 'textarea',
        },
        {
          type: 'row',
          fields: [
            {
              name: 'icon',
              type: 'text',
              admin: {
                width: '50%',
              },
            },
            {
              name: 'badge',
              type: 'text',
              admin: {
                width: '50%',
              },
            },
          ],
        },
      ],
    },
    {
      name: 'docs',
      type: 'relationship',
      admin: {
        description:
          'Optional selected docs records. Unresolved relationships are ignored by renderers.',
      },
      hasMany: true,
      label: 'Docs references',
      maxDepth: 1,
      relationTo: DEFAULT_DOCS_COLLECTION_SLUG,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'maxItems',
          type: 'number',
          admin: {
            width: '33%',
          },
          min: 1,
        },
        {
          name: 'viewAllUrl',
          type: 'text',
          admin: {
            width: '33%',
          },
          label: 'View all URL',
        },
        {
          name: 'viewAllLabel',
          type: 'text',
          admin: {
            width: '33%',
          },
          defaultValue: 'View all docs',
        },
      ],
    },
    ctaButtonsField(),
    skillCTAFields(),
  ],
  interfaceName: 'DocsPreviewBlock',
  labels: {
    plural: 'Docs Previews',
    singular: 'Docs Preview',
  },
}
