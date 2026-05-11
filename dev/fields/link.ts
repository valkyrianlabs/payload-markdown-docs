import type { Field, NamedGroupField } from 'payload'

export type LinkAppearances = 'default' | 'outline'

export const appearanceOptions: Record<LinkAppearances, { label: string; value: string }> = {
  default: {
    label: 'Default',
    value: 'default',
  },
  outline: {
    label: 'Outline',
    value: 'outline',
  },
}

type LinkType = (options?: {
  appearances?: false | LinkAppearances[]
  disableLabel?: boolean
  overrides?: LinkGroupOverrides
}) => Field

type LinkGroupOverrides = Partial<Omit<NamedGroupField, 'admin' | 'fields' | 'name' | 'type'>> & {
  admin?: NamedGroupField['admin']
  fields?: NamedGroupField['fields']
}

const mergeGroupField = (field: NamedGroupField, overrides: LinkGroupOverrides): NamedGroupField => {
  const { admin, fields, ...rest } = overrides

  return {
    ...field,
    ...rest,
    name: field.name,
    type: field.type,
    admin: {
      ...field.admin,
      ...admin,
    },
    fields: fields ?? field.fields,
  } as NamedGroupField
}

export const link: LinkType = ({ appearances, disableLabel = false, overrides = {} } = {}) => {
  const linkResult: NamedGroupField = {
    name: 'link',
    type: 'group',
    admin: {
      hideGutter: true,
    },
    fields: [
      {
        type: 'row',
        fields: [
          {
            name: 'type',
            type: 'radio',
            admin: {
              layout: 'horizontal',
              width: '50%',
            },
            defaultValue: 'reference',
            options: [
              {
                label: 'Internal link',
                value: 'reference',
              },
              {
                label: 'Custom URL',
                value: 'custom',
              },
            ],
          },
          {
            name: 'newTab',
            type: 'checkbox',
            admin: {
              style: {
                alignSelf: 'flex-end',
              },
              width: '50%',
            },
            label: 'Open in new tab',
          },
        ],
      },
    ],
  }

  const linkTypes: Field[] = [
    {
      name: 'reference',
      type: 'relationship',
      admin: {
        condition: (_, siblingData) => siblingData?.type === 'reference',
      },
      label: 'Document to link to',
      relationTo: ['docs-groups', 'docs-sets'],
      required: true,
    },
    {
      name: 'url',
      type: 'text',
      admin: {
        condition: (_, siblingData) => siblingData?.type === 'custom',
      },
      label: 'Custom URL',
      required: true,
    },
  ]

  const linkFields: Field[] = !disableLabel
    ? linkTypes.map((linkType): Field => ({
        ...linkType,
        admin: {
          ...linkType.admin,
          width: '50%',
        },
      }) as Field)
    : linkTypes

  if (!disableLabel) {
    linkResult.fields.push({
      type: 'row',
      fields: [
        ...linkFields,
        {
          name: 'label',
          type: 'text',
          admin: {
            width: '50%',
          },
          label: 'Label',
          required: true,
        },
      ],
    })
  } else {
    linkResult.fields = [...linkResult.fields, ...linkFields]
  }

  if (appearances !== false) {
    let appearanceOptionsToUse = [appearanceOptions.default, appearanceOptions.outline]

    if (appearances) {
      appearanceOptionsToUse = appearances.map((appearance) => appearanceOptions[appearance])
    }

    linkResult.fields.push({
      name: 'appearance',
      type: 'select',
      admin: {
        description: 'Choose how the link should be rendered.',
      },
      defaultValue: 'default',
      options: appearanceOptionsToUse,
    })
  }

  return mergeGroupField(linkResult, overrides)
}
