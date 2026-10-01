import type { CollectionConfig } from 'payload'

export type CreateNoncesCollectionOptions = {
  slug: string
  syncRunsCollectionSlug?: string
}

export const createNoncesCollection = ({
  slug,
  syncRunsCollectionSlug,
}: CreateNoncesCollectionOptions): CollectionConfig => ({
  slug,
  admin: {
    defaultColumns: ['keyId', 'nonce', 'sourceId', 'expiresAt', 'usedAt'],
    hidden: true,
    useAsTitle: 'nonce',
  },
  // Replay protection relies on this: concurrent requests with the same nonce cannot
  // both insert (DOCS-8). Existing installs must remove duplicate rows before migrating.
  fields: [
    {
      name: 'keyId',
      type: 'text',
      index: true,
      required: true,
    },
    {
      name: 'nonce',
      type: 'text',
      index: true,
      required: true,
    },
    {
      name: 'sourceId',
      type: 'text',
      index: true,
    },
    {
      name: 'bodyHash',
      type: 'text',
      index: true,
    },
    ...(syncRunsCollectionSlug
      ? [
          {
            name: 'syncRunId',
            type: 'relationship' as const,
            relationTo: syncRunsCollectionSlug,
          },
        ]
      : []),
    {
      name: 'expiresAt',
      type: 'date',
      index: true,
      required: true,
    },
    {
      name: 'usedAt',
      type: 'date',
    },
  ],
  indexes: [
    {
      fields: ['keyId', 'nonce'],
      unique: true,
    },
  ],
})
