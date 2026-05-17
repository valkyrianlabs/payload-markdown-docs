import type { Block } from 'payload'

import {
  backgroundMediaFields,
  ctaButtonsField,
  docsSetRelationshipField,
} from '../../fields/index.js'
import { skillCTAFields } from '../../fields/skills.js'

export const DocsBannerBlock: Block = {
  slug: 'docsBanner',
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
      name: 'badge',
      type: 'text',
      admin: {
        description:
          'Single pill label rendered near the banner heading for status, version, category, or launch metadata.',
      },
    },
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
    backgroundMediaFields({
      mediaRequired: true,
    }),
    {
      type: 'row',
      fields: [
        {
          name: 'textAlign',
          type: 'select',
          admin: {
            description: 'Controls horizontal text and action alignment.',
            width: '33%',
          },
          defaultValue: 'center',
          options: [
            {
              label: 'Left',
              value: 'left',
            },
            {
              label: 'Center',
              value: 'center',
            },
            {
              label: 'Right',
              value: 'right',
            },
          ],
        },
        {
          name: 'size',
          type: 'select',
          admin: {
            description: 'Controls banner height and vertical spacing.',
            width: '33%',
          },
          defaultValue: 'md',
          options: [
            {
              label: 'Small',
              value: 'sm',
            },
            {
              label: 'Medium',
              value: 'md',
            },
            {
              label: 'Large',
              value: 'lg',
            },
            {
              label: 'Extra large',
              value: 'xl',
            },
          ],
        },
        {
          name: 'theme',
          type: 'select',
          admin: {
            description: 'Controls the banner color treatment used by the renderer.',
            width: '33%',
          },
          defaultValue: 'dark',
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
    ctaButtonsField(),
    skillCTAFields(),
  ],
  interfaceName: 'DocsBannerBlock',
  labels: {
    plural: 'Docs Banners',
    singular: 'Docs Banner',
  },
}
