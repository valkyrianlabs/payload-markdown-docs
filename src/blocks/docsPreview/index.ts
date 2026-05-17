import type { Block } from 'payload'

import { ctaButtonsField, docsSetRelationshipField } from '../../fields/index.js'
import { skillCTAFields } from '../../fields/skills.js'

export const DocsPreviewBlock: Block = {
  slug: 'docsPreview',
  fields: [
    docsSetRelationshipField(),
    {
      name: 'heading',
      type: 'text',
      admin: {
        description: 'Optional heading override. Defaults to the selected docs set title.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: 'Optional description override. Defaults to the selected docs set description.',
      },
    },
    {
      type: 'row',
      fields: [
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
        {
          name: 'viewAllLabel',
          type: 'text',
          admin: {
            description: 'Label for the fallback link to the selected docs set.',
            width: '50%',
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
