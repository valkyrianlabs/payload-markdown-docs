import type { Field } from 'payload'

export const hero: Field = {
  name: 'hero',
  type: 'group',
  access: {
    create: () => true,
    read: () => true,
    update: () => true,
  },
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
