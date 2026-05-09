import type { CollectionConfig } from 'payload'

import { DOCS_GLOBALS_ADMIN_GROUP, DOCS_SET_MANAGER_COMPONENT } from '../constants.js'
import { createPublishGeneratedDocsEndpoint } from '../endpoints/publishGeneratedDocs.js'

export type CreateDocsSetsCollectionOptions = {
  allowPublish?: boolean
  docsCollectionSlug?: string
  docsEnableDrafts?: boolean
  docsGroupsCollectionSlug: string
  markdownFieldName: string
  slug: string
  syncRunsCollectionSlug?: string
}

export const createDocsSetsCollection = ({
  slug,
  allowPublish = false,
  docsCollectionSlug,
  docsEnableDrafts = false,
  docsGroupsCollectionSlug,
  markdownFieldName,
  syncRunsCollectionSlug,
}: CreateDocsSetsCollectionOptions): CollectionConfig => ({
  slug,
  admin: {
    defaultColumns: ['title', 'slug', 'branch', 'updatedAt'],
    group: DOCS_GLOBALS_ADMIN_GROUP,
    useAsTitle: 'title',
  },
  endpoints:
    docsCollectionSlug && docsEnableDrafts && allowPublish
      ? [
          createPublishGeneratedDocsEndpoint({
            docsCollectionSlug,
            docsSetsCollectionSlug: slug,
            markdownFieldName,
          }),
        ]
      : undefined,
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
      unique: true,
    },
    {
      name: 'group',
      type: 'relationship',
      relationTo: docsGroupsCollectionSlug,
    },
    {
      name: 'branch',
      type: 'text',
      admin: {
        description:
          'Git branch allowed to publish this docs set. The full Git ref is handled internally.',
      },
      defaultValue: 'main',
    },
    {
      name: 'allowPullRequests',
      type: 'checkbox',
      admin: {
        description: 'Allow GitHub pull request events to dry-run or publish this docs set.',
      },
      defaultValue: false,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'advancedSecurity',
      type: 'group',
      admin: {
        description:
          'Optional workflow lock-down. Leave disabled to allow any workflow from a trusted GitHub owner/repository and branch.',
      },
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          admin: {
            description:
              'When enabled, only the workflow refs listed below can publish this docs set.',
          },
          defaultValue: false,
        },
        {
          name: 'allowedWorkflowRefs',
          type: 'array',
          admin: {
            condition: (_data, siblingData) => siblingData?.enabled === true,
            description:
              'Exact GitHub workflow refs, for example owner/repo/.github/workflows/publish-docs.yml@refs/heads/main.',
          },
          fields: [
            {
              name: 'value',
              type: 'text',
              required: true,
            },
          ],
          validate: (value, { siblingData }) => {
            const advancedSecurityData =
              typeof siblingData === 'object' && siblingData !== null
                ? (siblingData as { enabled?: unknown })
                : undefined

            if (
              advancedSecurityData?.enabled === true &&
              (!Array.isArray(value) || value.length === 0)
            ) {
              return 'Add at least one workflow ref or disable advanced security.'
            }

            return true
          },
        },
      ],
    },
    {
      name: 'aiExport',
      type: 'json',
      admin: {
        description: 'Parsed index.ai.yml control data for the raw Markdown AI export route.',
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
                allowPublish,
                docsCollectionSlug,
                docsEnableDrafts,
                docsGroupsCollectionSlug,
                docsSetsCollectionSlug: slug,
              },
            },
          },
        ]
      : []),
  ],
  labels: {
    plural: 'Sets',
    singular: 'Set',
  },
})
