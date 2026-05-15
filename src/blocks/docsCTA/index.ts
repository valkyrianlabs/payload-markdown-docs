import type { Block } from 'payload'

import { backgroundMediaFields } from '../../fields/backgroundMedia.js'
import { ctaButtonsField } from '../../fields/ctaButtons.js'
import { skillCTAFields } from '../../fields/skills.js'

export const DocsCTABlock: Block = {
  slug: 'docsCTA',
  fields: [
    {
      name: 'eyebrow',
      type: 'text',
    },
    {
      name: 'badges',
      type: 'array',
      admin: {
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
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
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
      type: 'row',
      fields: [
        {
          name: 'docsUrl',
          type: 'text',
          admin: {
            description: 'Optional docs URL used when no CTA buttons are configured.',
            width: '50%',
          },
          label: 'Docs URL',
        },
        {
          name: 'docsLabel',
          type: 'text',
          admin: {
            width: '50%',
          },
          defaultValue: 'Read the docs',
        },
      ],
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
