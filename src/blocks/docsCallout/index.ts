import type { Block } from 'payload'

import {
  docsPageRelationshipField,
  docsSetRelationshipField,
  validateDocsPageHeadingFallback,
} from '../../fields/index.js'
import { skillCTAFields } from '../../fields/skills.js'

export const DocsCalloutBlock: Block = {
  slug: 'docsCallout',
  fields: [
    docsSetRelationshipField(),
    docsPageRelationshipField(),
    {
      type: 'row',
      fields: [
        {
          name: 'variant',
          type: 'select',
          admin: {
            width: '50%',
          },
          defaultValue: 'info',
          options: [
            {
              label: 'Info',
              value: 'info',
            },
            {
              label: 'Success',
              value: 'success',
            },
            {
              label: 'Warning',
              value: 'warning',
            },
            {
              label: 'Brand',
              value: 'brand',
            },
            {
              label: 'Neutral',
              value: 'neutral',
            },
          ],
        },
        {
          name: 'layout',
          type: 'select',
          admin: {
            width: '50%',
          },
          defaultValue: 'card',
          options: [
            {
              label: 'Card',
              value: 'card',
            },
            {
              label: 'Full width',
              value: 'fullWidth',
            },
            {
              label: 'Inline',
              value: 'inline',
            },
            {
              label: 'Sidebar',
              value: 'sidebar',
            },
          ],
        },
      ],
    },
    {
      name: 'heading',
      type: 'text',
      admin: {
        description: 'Required unless the selected docs page provides a title.',
      },
      validate: validateDocsPageHeadingFallback(),
    },
    {
      name: 'excerpt',
      type: 'textarea',
      admin: {
        description: 'Optional excerpt override. Defaults to the selected docs page description.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'ctaLabel',
          type: 'text',
          admin: {
            width: '50%',
          },
          defaultValue: 'Read more',
        },
        {
          name: 'icon',
          type: 'text',
          admin: {
            description:
              'Optional icon name. SVG/icon rendering requires app or plugin icon support.',
            width: '50%',
          },
        },
      ],
    },
    skillCTAFields(),
  ],
  interfaceName: 'DocsCalloutBlock',
  labels: {
    plural: 'Docs Callouts',
    singular: 'Docs Callout',
  },
}
