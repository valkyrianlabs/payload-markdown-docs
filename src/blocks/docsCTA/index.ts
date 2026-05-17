import type { Block } from 'payload'

import {
  backgroundMediaFields,
  ctaButtonsField,
  docsSetRelationshipField,
  validateDocsSetHeadingFallback,
} from '../../fields/index.js'
import { skillCTAFields } from '../../fields/skills.js'

export const DocsCTABlock: Block = {
  slug: 'docsCTA',
  fields: [
    docsSetRelationshipField(),
    {
      name: 'eyebrow',
      type: 'text',
      admin: {
        description: 'Small uppercase pre-heading text rendered above the main heading.',
      },
    },
    {
      name: 'badges',
      type: 'array',
      admin: {
        description:
          'Small pill labels rendered near the heading for status, version, category, or launch metadata.',
        initCollapsed: true,
      },
      fields: [
        {
          name: 'label',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'heading',
      type: 'text',
      admin: {
        description: 'Required unless the selected docs set provides a title.',
      },
      validate: validateDocsSetHeadingFallback(),
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
          defaultValue: 'centered',
          options: [
            {
              label: 'Centered',
              value: 'centered',
            },
            {
              label: 'Split',
              value: 'split',
            },
            {
              label: 'Inline',
              value: 'inline',
            },
            {
              label: 'Card',
              value: 'card',
            },
          ],
        },
        {
          name: 'theme',
          type: 'select',
          admin: {
            width: '50%',
          },
          defaultValue: 'default',
          options: [
            {
              label: 'Default',
              value: 'default',
            },
            {
              label: 'Muted',
              value: 'muted',
            },
            {
              label: 'Dark',
              value: 'dark',
            },
            {
              label: 'Brand',
              value: 'brand',
            },
          ],
        },
      ],
    },
    {
      name: 'docsLabel',
      type: 'text',
      admin: {
        description: 'Label for the fallback link to the selected docs set.',
      },
      defaultValue: 'Read the docs',
    },
    ctaButtonsField(),
    backgroundMediaFields(),
    skillCTAFields(),
  ],
  interfaceName: 'DocsCTABlock',
  labels: {
    plural: 'Docs CTAs',
    singular: 'Docs CTA',
  },
}
