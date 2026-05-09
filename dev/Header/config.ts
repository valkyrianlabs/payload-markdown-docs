import type { Field, GlobalConfig } from 'payload'

import type { DocsGroup, DocsSet } from '../payload-types.ts'

import { link } from '../fields/link.js'
import { populateNavItems } from './hooks/populateNavItems.js'
import { revalidateHeader } from './hooks/revalidateHeader.js'

export type HeaderLinkReference =
  | {
      relationTo: 'docs-groups'
      value: DocsGroup | number | string
    }
  | {
      relationTo: 'docs-sets'
      value: DocsSet | number | string
    }

export type HeaderLink = {
  label?: null | string
  newTab?: boolean | null
  reference?: HeaderLinkReference | null
  type?: 'custom' | 'reference' | null
  url?: null | string
}

export type HeaderChildItem = {
  link?: HeaderLink | null
}

export type HeaderSubItem = {
  childItems?: HeaderChildItem[] | null
  populateChildren?: boolean | null
} & HeaderChildItem

export type HeaderNavItem = {
  subItems?: HeaderSubItem[] | null
} & HeaderChildItem

export type HeaderData = {
  navItems?: HeaderNavItem[] | null
}

const thirdLevelFields: Field[] = [
  link({
    appearances: false,
  }),
]

const secondLevelFields: Field[] = [
  link({
    appearances: false,
  }),
  {
    name: 'populateChildren',
    type: 'checkbox',
    admin: {
      condition: (_, siblingData) => siblingData?.link?.type === 'reference',
      description: "Populate child items from the linked docs group's child groups and docs sets.",
    },
    defaultValue: false,
  },
  {
    name: 'childItems',
    type: 'array',
    admin: {
      initCollapsed: true,
    },
    fields: thirdLevelFields,
  },
]

export const Header: GlobalConfig = {
  slug: 'header',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'navItems',
      type: 'array',
      admin: {
        components: {
          RowLabel: './Header/RowLabel#RowLabel',
        },
        initCollapsed: true,
      },
      fields: [
        link({
          appearances: false,
        }),
        {
          name: 'subItems',
          type: 'array',
          admin: {
            initCollapsed: true,
          },
          fields: secondLevelFields,
        },
      ],
      maxRows: 12,
    },
  ],
  hooks: {
    afterChange: [revalidateHeader],
    beforeChange: [populateNavItems],
  },
}
