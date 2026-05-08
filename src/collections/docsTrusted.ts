import type { CollectionConfig } from 'payload'

import { DOCS_GLOBALS_ADMIN_GROUP } from '../constants.js'

export type CreateDocsTrustedCollectionOptions = {
  slug: string
}

export const createDocsTrustedCollection = ({
  slug,
}: CreateDocsTrustedCollectionOptions): CollectionConfig => ({
  slug,
  admin: {
    defaultColumns: ['title', 'owner', 'limitRepos', 'updatedAt'],
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
      name: 'owner',
      type: 'text',
      admin: {
        description:
          'GitHub owner or organization trusted to publish docs through OIDC.',
      },
      index: true,
      required: true,
      unique: true,
    },
    {
      name: 'limitRepos',
      type: 'checkbox',
      admin: {
        description:
          'Leave off to trust every repository owned by this GitHub owner. Enable to list specific repositories.',
      },
      defaultValue: false,
    },
    {
      name: 'repositories',
      type: 'array',
      admin: {
        condition: (_data, siblingData) => siblingData?.limitRepos === true,
        description:
          'Repository names or owner/repository pairs allowed when repo limiting is enabled.',
      },
      fields: [
        {
          name: 'value',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
  labels: {
    plural: 'Trusted',
    singular: 'Trusted',
  },
})
