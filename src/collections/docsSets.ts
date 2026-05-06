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
      name: 'auth',
      type: 'group',
      admin: {
        description:
          'Source-specific sync authentication policy. Use this instead of hardcoding docs sources in payload.config.ts.',
      },
      fields: [
        {
          name: 'ed25519',
          type: 'group',
          fields: [
            {
              name: 'keys',
              type: 'array',
              admin: {
                description:
                  'Public keys allowed to sync this docs set from local machines or non-GitHub CI.',
              },
              fields: [
                {
                  name: 'keyId',
                  type: 'text',
                  required: true,
                },
                {
                  name: 'publicKey',
                  type: 'textarea',
                  required: true,
                },
              ],
            },
            {
              name: 'maxSkewSeconds',
              type: 'number',
            },
            {
              name: 'nonceTtlSeconds',
              type: 'number',
            },
          ],
        },
        {
          name: 'githubOidc',
          type: 'group',
          fields: [
            {
              name: 'enabled',
              type: 'checkbox',
              defaultValue: false,
            },
            {
              name: 'audience',
              type: 'text',
              admin: {
                description:
                  'Optional override. Defaults to the plugin-level GitHub OIDC audience.',
              },
            },
            {
              name: 'allowedRepositories',
              type: 'array',
              admin: {
                description:
                  'GitHub repositories allowed to sync this docs set, for example valkyrianlabs/payload-markdown-docs.',
              },
              fields: [
                {
                  name: 'value',
                  type: 'text',
                  required: true,
                },
              ],
            },
            {
              name: 'allowedRepositoryOwners',
              type: 'array',
              fields: [
                {
                  name: 'value',
                  type: 'text',
                  required: true,
                },
              ],
            },
            {
              name: 'allowedRefs',
              type: 'array',
              admin: {
                description:
                  'Exact Git refs such as refs/heads/main or refs/tags/v0.2.1.',
              },
              fields: [
                {
                  name: 'value',
                  type: 'text',
                  required: true,
                },
              ],
            },
            {
              name: 'allowedWorkflows',
              type: 'array',
              fields: [
                {
                  name: 'value',
                  type: 'text',
                  required: true,
                },
              ],
            },
            {
              name: 'allowedWorkflowRefs',
              type: 'array',
              fields: [
                {
                  name: 'value',
                  type: 'text',
                  required: true,
                },
              ],
            },
            {
              name: 'allowedEnvironments',
              type: 'array',
              fields: [
                {
                  name: 'value',
                  type: 'text',
                  required: true,
                },
              ],
            },
            {
              name: 'allowPullRequests',
              type: 'checkbox',
              defaultValue: false,
            },
            {
              name: 'issuer',
              type: 'text',
            },
            {
              name: 'jwksUrl',
              type: 'text',
            },
            {
              name: 'maxSkewSeconds',
              type: 'number',
            },
          ],
        },
      ],
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
      name: 'aiExport',
      type: 'json',
      admin: {
        description:
          'Parsed index.ai.yml control data for the raw Markdown AI export route.',
      },
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
