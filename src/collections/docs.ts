import type { CollectionConfig, Field } from 'payload'

import { markdownField } from '@valkyrianlabs/payload-markdown'

import { MANAGED_BY } from '../constants.js'

export type CreateDocsCollectionOptions = {
  docsSetsCollectionSlug?: string
  enableDrafts?: boolean
  heroImageMediaCollectionSlugs?: string[]
  markdownFieldName: string
  slug: string
  syncRunsCollectionSlug?: string
}

const createHeroImageField = (relationToSlugs: string[]): Field => {
  const fieldBase = {
    name: 'heroImage',
    type: 'upload' as const,
    admin: {
      description: 'Optional hero image rendered above generated docs content.',
    },
    displayPreview: true,
    label: 'Hero Image',
    maxDepth: 1,
  }

  if (relationToSlugs.length === 1) {
    return {
      ...fieldBase,
      relationTo: relationToSlugs[0] ?? 'media',
    }
  }

  return {
    ...fieldBase,
    relationTo: relationToSlugs,
  }
}

export const createDocsCollection = ({
  slug,
  docsSetsCollectionSlug,
  enableDrafts = false,
  heroImageMediaCollectionSlugs,
  markdownFieldName,
  syncRunsCollectionSlug,
}: CreateDocsCollectionOptions): CollectionConfig => ({
  slug,
  admin: {
    defaultColumns: ['title', 'route', 'sourcePath', 'updatedAt'],
    hidden: true,
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
    ...(heroImageMediaCollectionSlugs?.length
      ? [createHeroImageField(heroImageMediaCollectionSlugs)]
      : []),
    markdownField({
      name: markdownFieldName,
      label: 'Content',
    }),
    {
      name: 'overrides',
      type: 'group',
      fields: [
        {
          name: 'navTitle',
          type: 'text',
        },
        {
          name: 'hideFromNav',
          type: 'checkbox',
          defaultValue: false,
        },
      ],
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
  ...(enableDrafts
    ? {
        versions: {
          drafts: true,
        },
      }
    : {}),
})
