import type { Block } from 'payload'

import {
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
} from '../../constants.js'
import { skillCTAFields } from '../../fields/skills.js'

export const DocsCalloutBlock: Block = {
  slug: 'docsCallout',
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'calloutType',
          type: 'select',
          admin: {
            width: '50%',
          },
          defaultValue: 'custom',
          options: [
            {
              label: 'Page',
              value: 'page',
            },
            {
              label: 'Section',
              value: 'section',
            },
            {
              label: 'Custom',
              value: 'custom',
            },
          ],
        },
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
      ],
    },
    {
      name: 'heading',
      type: 'text',
      required: true,
    },
    {
      name: 'excerpt',
      type: 'textarea',
    },
    {
      name: 'routeReference',
      type: 'relationship',
      admin: {
        description: 'Optional populated docs, group, or set reference.',
      },
      label: 'Docs reference',
      maxDepth: 1,
      relationTo: [
        DEFAULT_DOCS_COLLECTION_SLUG,
        DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
        DEFAULT_DOCS_SETS_COLLECTION_SLUG,
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'manualHref',
          type: 'text',
          admin: {
            width: '50%',
          },
          label: 'Manual URL',
        },
        {
          name: 'ctaLabel',
          type: 'text',
          admin: {
            width: '50%',
          },
          defaultValue: 'Read more',
        },
      ],
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
    skillCTAFields(),
  ],
  interfaceName: 'DocsCalloutBlock',
  labels: {
    plural: 'Docs Callouts',
    singular: 'Docs Callout',
  },
}
