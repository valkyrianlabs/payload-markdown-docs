import type { CollectionConfig } from 'payload'

import { DOCS_SET_MANAGER_COMPONENT } from '../constants.js'

export type CreateDocsSetsCollectionOptions = {
  docsCollectionSlug?: string
  docsGroupsCollectionSlug: string
  slug: string
  syncRunsCollectionSlug?: string
}

export const createDocsSetsCollection = ({
  slug,
  docsCollectionSlug,
  docsGroupsCollectionSlug,
  syncRunsCollectionSlug,
}: CreateDocsSetsCollectionOptions): CollectionConfig => ({
  slug,
  admin: {
    defaultColumns: ['title', 'sourceId', 'routeBase', 'updatedAt'],
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
      name: 'sourceId',
      type: 'text',
      index: true,
      required: true,
      unique: true,
    },
    {
      name: 'sourceRoot',
      type: 'text',
      defaultValue: 'docs',
    },
    {
      name: 'group',
      type: 'relationship',
      relationTo: docsGroupsCollectionSlug,
    },
    {
      name: 'routeBase',
      type: 'text',
      index: true,
      required: true,
      unique: true,
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
      name: 'defaults',
      type: 'group',
      fields: [
        {
          name: 'theme',
          type: 'text',
        },
        {
          name: 'heroEyebrow',
          type: 'text',
        },
        {
          name: 'heroTitle',
          type: 'text',
        },
        {
          name: 'heroDescription',
          type: 'textarea',
        },
        {
          name: 'seoTitle',
          type: 'text',
        },
        {
          name: 'seoDescription',
          type: 'textarea',
        },
        {
          name: 'sidebarMode',
          type: 'select',
          options: ['auto', 'manual', 'hidden'],
        },
      ],
    },
    {
      name: 'sync',
      type: 'group',
      fields: [
        {
          name: 'lastSyncedAt',
          type: 'date',
        },
        ...(syncRunsCollectionSlug
          ? [
              {
                name: 'lastSyncRunId',
                type: 'relationship' as const,
                relationTo: syncRunsCollectionSlug,
              },
            ]
          : []),
        {
          name: 'lastStatus',
          type: 'select',
          options: ['failed', 'pending', 'success'],
        },
        {
          name: 'docsCount',
          type: 'number',
          defaultValue: 0,
        },
      ],
    },
    ...(docsCollectionSlug
      ? [
          {
            name: 'docsSetManager',
            type: 'ui' as const,
            admin: {
              components: {
                Field: DOCS_SET_MANAGER_COMPONENT,
              },
              custom: {
                docsCollectionSlug,
                docsSetsCollectionSlug: slug,
              },
            },
          },
        ]
      : []),
  ],
})
