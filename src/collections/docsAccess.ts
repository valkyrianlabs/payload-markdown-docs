import type { CollectionBeforeValidateHook, CollectionConfig, Validate } from 'payload'

import { DOCS_GLOBALS_ADMIN_GROUP } from '../constants.js'
import {
  buildDocsAccessIdentityKey,
  type DocsAccessType,
  isDocsAccessType,
} from '../payload/docsAccess.js'

export type CreateDocsAccessCollectionOptions = {
  slug: string
}

type DocsAccessData = {
  accessType?: unknown
  id: number | string
  identityKey?: unknown
  keyId?: unknown
  limitRepos?: unknown
  owner?: unknown
  publicKey?: unknown
}

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

const getAccessType = (value: unknown): DocsAccessType | undefined =>
  typeof value === 'string' && isDocsAccessType(value) ? value : undefined

const validateRequiredForAccessType =
  (accessType: DocsAccessType, label: string): Validate<string, DocsAccessData, DocsAccessData> =>
  (value, { siblingData }) => {
    if (getAccessType(siblingData.accessType) !== accessType) {
      return true
    }

    return getString(value) ? true : `${label} is required for this access type.`
  }

const populateIdentityKey: CollectionBeforeValidateHook<DocsAccessData> = ({
  data,
  originalDoc,
}) => {
  const nextData = data ?? {}
  const accessType =
    getAccessType(nextData.accessType) ?? getAccessType(originalDoc?.accessType) ?? 'githubOidc'
  const keyId = getString(nextData.keyId) ?? getString(originalDoc?.keyId)
  const owner = getString(nextData.owner) ?? getString(originalDoc?.owner)

  if (keyId) {
    nextData.keyId = keyId
  }

  if (typeof nextData.publicKey === 'string') {
    nextData.publicKey = nextData.publicKey.trim()
  }

  if (owner) {
    nextData.owner = owner
  }

  nextData.accessType = accessType
  nextData.identityKey = buildDocsAccessIdentityKey({
    accessType,
    keyId,
    owner,
  })

  return nextData
}

export const createDocsAccessCollection = ({
  slug,
}: CreateDocsAccessCollectionOptions): CollectionConfig => ({
  slug,
  admin: {
    defaultColumns: ['title', 'accessType', 'keyId', 'owner', 'updatedAt'],
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
      name: 'accessType',
      type: 'select',
      defaultValue: 'githubOidc',
      index: true,
      label: 'Type',
      options: [
        {
          label: 'Ed25519 Key',
          value: 'ed25519',
        },
        {
          label: 'GitHub OIDC',
          value: 'githubOidc',
        },
      ],
      required: true,
    },
    {
      name: 'identityKey',
      type: 'text',
      admin: {
        hidden: true,
      },
      index: true,
      unique: true,
    },
    {
      name: 'keyId',
      type: 'text',
      admin: {
        condition: (_data, siblingData) => siblingData?.accessType === 'ed25519',
        description:
          'Identifier sent by signed docs sync requests. Keep this stable for each publishing environment.',
      },
      index: true,
      validate: validateRequiredForAccessType('ed25519', 'Key ID'),
    },
    {
      name: 'publicKey',
      type: 'textarea',
      admin: {
        condition: (_data, siblingData) => siblingData?.accessType === 'ed25519',
        description:
          'Ed25519 public key allowed to publish docs. Private keys never belong in Payload.',
      },
      validate: validateRequiredForAccessType('ed25519', 'Public key'),
    },
    {
      name: 'owner',
      type: 'text',
      admin: {
        condition: (_data, siblingData) => siblingData?.accessType === 'githubOidc',
        description: 'GitHub owner or organization trusted to publish docs through OIDC.',
      },
      index: true,
      validate: validateRequiredForAccessType('githubOidc', 'Owner'),
    },
    {
      name: 'limitRepos',
      type: 'checkbox',
      admin: {
        condition: (_data, siblingData) => siblingData?.accessType === 'githubOidc',
        description:
          'Leave off to trust every repository owned by this GitHub owner. Enable to list specific repositories.',
      },
      defaultValue: false,
    },
    {
      name: 'repositories',
      type: 'array',
      admin: {
        condition: (_data, siblingData) =>
          siblingData?.accessType === 'githubOidc' && siblingData?.limitRepos === true,
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
  hooks: {
    beforeValidate: [populateIdentityKey],
  },
  labels: {
    plural: 'Access',
    singular: 'Access',
  },
})
