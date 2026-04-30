import type { CollectionConfig } from 'payload'

import { markdownField } from '@valkyrianlabs/payload-markdown'

import { MANAGED_BY } from '../constants.js'

export type CreateDocsCollectionOptions = {
  enableDrafts?: boolean
  markdownFieldName: string
  slug: string
  syncRunsCollectionSlug?: string
}

export const createDocsCollection = ({
  slug,
  enableDrafts = false,
  markdownFieldName,
  syncRunsCollectionSlug,
}: CreateDocsCollectionOptions): CollectionConfig => ({
  slug,
  admin: {
    defaultColumns: ['title', 'route', 'sourcePath', 'updatedAt'],
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'navTitle',
      type: 'text',
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'route',
      type: 'text',
      index: true,
      required: true,
      unique: true,
    },
    {
      name: 'sourcePath',
      type: 'text',
      index: true,
      required: true,
      unique: true,
    },
    {
      name: 'sourceHash',
      type: 'text',
      index: true,
    },
    {
      name: 'depth',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: slug,
    },
    markdownField({
      name: markdownFieldName,
      label: 'Content',
    }),
    {
      name: 'sync',
      type: 'group',
      fields: [
        {
          name: 'sourceId',
          type: 'text',
          index: true,
        },
        {
          name: 'sourcePath',
          type: 'text',
          index: true,
        },
        {
          name: 'sourceHashAtLastSync',
          type: 'text',
          index: true,
        },
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
          name: 'managedBy',
          type: 'text',
          defaultValue: MANAGED_BY,
        },
        {
          name: 'archived',
          type: 'checkbox',
          defaultValue: false,
          index: true,
        },
        {
          name: 'archivedAt',
          type: 'date',
        },
      ],
    },
  ],
  ...(enableDrafts
    ? {
        versions: {
          drafts: true,
        },
      }
    : {}),
})
