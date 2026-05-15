import type { CollectionConfig } from 'payload'

import { DOCS_GLOBALS_ADMIN_GROUP } from '../constants.js'

export type CreateDocsGroupsCollectionOptions = {
  slug: string
}

export const createDocsGroupsCollection = ({
  slug,
}: CreateDocsGroupsCollectionOptions): CollectionConfig => ({
  slug,
  admin: {
    defaultColumns: ['title', 'slug', 'pageMode', 'updatedAt'],
    group: DOCS_GLOBALS_ADMIN_GROUP,
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      index: true,
      required: true,
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: slug,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'navTitle',
      type: 'text',
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'pageMode',
      type: 'select',
      admin: {
        description:
          'auto generates a docs group landing page. custom lets the site own this group route.',
      },
      defaultValue: 'auto',
      options: [
        {
          label: 'Auto generated',
          value: 'auto',
        },
        {
          label: 'Custom',
          value: 'custom',
        },
      ],
    },
  ],
  labels: {
    plural: 'Groups',
    singular: 'Group',
  },
})
