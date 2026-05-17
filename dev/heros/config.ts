import type { Field } from 'payload'

import { docsHeroField } from '../../dist/fields'

const localHero: Field = {
  name: 'hero',
  type: 'group',
  fields: [
    {
      name: 'type',
      type: 'select',
      defaultValue: 'none',
      label: 'Type',
      options: [
        {
          label: 'None',
          value: 'none',
        },
        {
          label: 'High Impact',
          value: 'highImpact',
        },
        {
          label: 'High Impact Card',
          value: 'highImpactCard',
        },
        {
          label: 'Medium Impact',
          value: 'mediumImpact',
        },
        {
          label: 'Low Impact',
          value: 'lowImpact',
        },
      ],
      required: true,
    },
    {
      name: 'heading',
      type: 'text',
      admin: {
        description: 'Local dev hero heading.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: 'Local dev hero description.',
      },
    },
    {
      name: 'media',
      type: 'upload',
      admin: {
        condition: (_data, siblingData) =>
          ['highImpact', 'highImpactCard', 'mediumImpact'].includes(String(siblingData?.type)),
      },
      relationTo: 'media',
    },
  ],
  label: false,
}

export const hero = docsHeroField({
  hero: localHero,
})
