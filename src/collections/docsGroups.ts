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
      admin: {
        position: 'sidebar',
      },
      index: true,
      required: true,
    },
    {
      name: 'parent',
      type: 'relationship',
      admin: {
        position: 'sidebar',
      },
      relationTo: slug,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'navTitle',
      type: 'text',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'order',
      type: 'number',
      admin: {
        position: 'sidebar',
      },
      defaultValue: 0,
    },
    {
      name: 'pageMode',
      type: 'select',
      admin: {
        description:
          'auto generates a docs group landing page. custom lets the site own this group route.',
        position: 'sidebar',
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
