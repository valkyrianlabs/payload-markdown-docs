import type { CollectionConfig } from 'payload'

export type CreateDocsGroupsCollectionOptions = {
  slug: string
}

export const createDocsGroupsCollection = ({
  slug,
}: CreateDocsGroupsCollectionOptions): CollectionConfig => ({
  slug,
  admin: {
    defaultColumns: ['title', 'routePath', 'serveIndex', 'updatedAt'],
    group: 'Docs',
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
      name: 'routePath',
      type: 'text',
      index: true,
      required: true,
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
})
