import type { Block } from 'payload'

import { backgroundMediaFields } from '../../fields/backgroundMedia.js'
import { ctaButtonsField } from '../../fields/ctaButtons.js'
import { skillCTAFields } from '../../fields/skills.js'

export const DocsBannerBlock: Block = {
  slug: 'docsBanner',
  fields: [
    {
      name: 'eyebrow',
      type: 'text',
    },
    {
      name: 'badge',
      type: 'text',
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
