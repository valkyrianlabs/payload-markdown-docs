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
    defaultColumns: ['title', 'slug', 'serveIndex', 'updatedAt'],
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
      name: 'serveIndex',
      type: 'checkbox',
      defaultValue: false,
    },
  ],
  labels: {
    plural: 'Groups',
    singular: 'Group',
  },
})
