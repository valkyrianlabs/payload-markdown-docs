import type { CollectionConfig } from 'payload'

import { DOCS_GLOBALS_ADMIN_GROUP } from '../constants.js'

export type CreateDocsKeysCollectionOptions = {
  slug: string
}

export const createDocsKeysCollection = ({
  slug,
}: CreateDocsKeysCollectionOptions): CollectionConfig => ({
  slug,
  admin: {
    defaultColumns: ['title', 'keyId', 'updatedAt'],
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
      name: 'keyId',
      type: 'text',
      admin: {
        description:
          'Identifier sent by signed docs sync requests. Keep this stable for each publishing environment.',
      },
      index: true,
      required: true,
      unique: true,
    },
    {
      name: 'publicKey',
      type: 'textarea',
      admin: {
        description:
          'Ed25519 public key allowed to publish docs. Private keys never belong in Payload.',
      },
      required: true,
    },
  ],
  labels: {
    plural: 'Keys',
    singular: 'Key',
  },
})
