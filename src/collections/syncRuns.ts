import type { CollectionConfig } from 'payload'

export type CreateSyncRunsCollectionOptions = {
  slug: string
}

export const createSyncRunsCollection = ({
  slug,
}: CreateSyncRunsCollectionOptions): CollectionConfig => ({
  slug,
  admin: {
    defaultColumns: ['sourceId', 'mode', 'status', 'startedAt', 'completedAt'],
    hidden: true,
    useAsTitle: 'sourceId',
  },
  fields: [
    {
      name: 'sourceId',
      type: 'text',
      index: true,
      required: true,
    },
    {
      name: 'repository',
      type: 'text',
    },
    {
      name: 'branch',
      type: 'text',
    },
    {
      name: 'commit',
      type: 'text',
      index: true,
    },
    {
      name: 'actor',
      type: 'text',
    },
    {
      name: 'keyId',
      type: 'text',
      index: true,
    },
    {
      name: 'mode',
      type: 'select',
      options: ['dry-run', 'sync'],
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      options: ['pending', 'success', 'failed'],
      required: true,
    },
    {
      name: 'publishRequested',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'deleteBehavior',
      type: 'select',
      options: ['archive', 'delete', 'draft', 'ignore'],
    },
    {
      name: 'bodyHash',
      type: 'text',
      index: true,
    },
    {
      name: 'fileCount',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'totalBytes',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'summary',
      type: 'json',
    },
    {
      name: 'warnings',
      type: 'array',
      fields: [
        {
          name: 'message',
          type: 'textarea',
        },
      ],
    },
    {
      name: 'errors',
      type: 'array',
      fields: [
        {
          name: 'message',
          type: 'textarea',
        },
      ],
    },
    {
      name: 'startedAt',
      type: 'date',
      index: true,
      required: true,
    },
    {
      name: 'completedAt',
      type: 'date',
    },
  ],
})
