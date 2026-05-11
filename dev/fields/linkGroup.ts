import type { ArrayField, Field } from 'payload'

import type { LinkAppearances } from './link'

import { link } from './link'

type LinkGroupType = (options?: {
  appearances?: false | LinkAppearances[]
  overrides?: LinkArrayOverrides
}) => Field

type LinkArrayOverrides = Partial<Omit<ArrayField, 'admin' | 'fields' | 'name' | 'type'>> & {
  admin?: ArrayField['admin']
  fields?: ArrayField['fields']
}

const mergeArrayField = (field: ArrayField, overrides: LinkArrayOverrides): Field => {
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
  } as Field
}

export const linkGroup: LinkGroupType = ({ appearances, overrides = {} } = {}) => {
  const generatedLinkGroup: ArrayField = {
    name: 'links',
    type: 'array',
    admin: {
      initCollapsed: true,
    },
    fields: [
      link({
        appearances,
      }),
    ],
  }

  return mergeArrayField(generatedLinkGroup, overrides)
}
