import type { ArrayField, Field } from 'payload'

import type { LinkAppearances } from './link.js'

import { link } from './link.js'

type LinkGroupType = (options?: {
  appearances?: false | LinkAppearances[]
  overrides?: Partial<ArrayField>
}) => Field

const mergeArrayField = (field: Field, overrides: Partial<ArrayField>): Field => ({
  ...field,
  ...overrides,
  admin: {
    ...('admin' in field ? field.admin : {}),
    ...overrides.admin,
  },
  fields: overrides.fields ?? ('fields' in field ? field.fields : []),
})

export const linkGroup: LinkGroupType = ({ appearances, overrides = {} } = {}) => {
  const generatedLinkGroup: Field = {
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
