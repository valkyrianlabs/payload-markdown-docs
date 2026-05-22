import type { CollectionConfig } from 'payload'

import { MANAGED_BY } from '../constants.js'

export type CreateDocsAssetsCollectionOptions = {
  docsSetsCollectionSlug?: string
  slug: string
  syncRunsCollectionSlug?: string
}

export const createDocsAssetsCollection = ({
  slug,
  docsSetsCollectionSlug,
  syncRunsCollectionSlug,
}: CreateDocsAssetsCollectionOptions): CollectionConfig => ({
  slug,
  admin: {
    defaultColumns: ['sourceId', 'kind', 'route', 'sourcePath', 'updatedAt'],
    hidden: true,
    useAsTitle: 'sourcePath',
  },
  fields: [
    {
      name: 'sourceId',
      type: 'text',
      index: true,
      required: true,
    },
    ...(docsSetsCollectionSlug
      ? [
          {
            name: 'docsSet',
            type: 'relationship' as const,
            index: true,
            relationTo: docsSetsCollectionSlug,
          },
        ]
      : []),
    {
      name: 'kind',
      type: 'select',
      options: ['llms', 'llms-full', 'skill', 'static'],
      required: true,
    },
    {
      name: 'sourcePath',
      type: 'text',
      index: true,
      required: true,
    },
    {
      name: 'route',
      type: 'text',
      index: true,
    },
    {
      name: 'contentType',
      type: 'text',
      defaultValue: 'text/plain; charset=utf-8',
      required: true,
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
    },
    {
      name: 'sourceHash',
      type: 'text',
      index: true,
    },
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
          name: 'contentHashAtLastSync',
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
})
