import type { CollectionConfig, Field } from 'payload'

import { DOCS_GLOBALS_ADMIN_GROUP, DOCS_SET_MANAGER_COMPONENT } from '../constants.js'
import { populatePublishedAt } from '../payload/populatePublishedAt.js'

export type CreateDocsSetsCollectionOptions = {
  docsCollectionSlug?: string
  docsGroupsCollectionSlug: string
  openGraphMediaCollectionSlugs: string[]
  slug: string
}

const createOpenGraphImageField = (relationToSlugs: string[]): Field => {
  const fieldBase = {
    name: 'image',
    type: 'upload' as const,
    admin: {
      description: 'Social preview image used for OpenGraph and Twitter cards.',
    },
    displayPreview: true,
    label: 'Image',
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

export const createDocsSetsCollection = ({
  slug,
  docsCollectionSlug,
  docsGroupsCollectionSlug,
  openGraphMediaCollectionSlugs,
}: CreateDocsSetsCollectionOptions): CollectionConfig => ({
  slug,
  admin: {
    defaultColumns: ['title', 'slug', 'branch', 'updatedAt'],
    group: DOCS_GLOBALS_ADMIN_GROUP,
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'slug',
      type: 'text',
      admin: {
        position: 'sidebar',
      },
      index: true,
      required: true,
      unique: true,
    },
    {
      name: 'group',
      type: 'relationship',
      admin: {
        position: 'sidebar',
      },
      relationTo: docsGroupsCollectionSlug,
    },
    {
      name: 'routeMode',
      type: 'select',
      admin: {
        description:
          'docs-root serves docs at the docs set route. product-nested serves docs under /docs so the parent route can be used as a product page.',
        position: 'sidebar',
      },
      defaultValue: 'docs-root',
      options: [
        {
          label: 'Docs root',
          value: 'docs-root',
        },
        {
          label: 'Product nested',
          value: 'product-nested',
        },
      ],
    },
    {
      name: 'branch',
      type: 'text',
      admin: {
        description:
          'Git branch allowed to publish this docs set. The full Git ref is handled internally.',
        position: 'sidebar',
      },
      defaultValue: 'main',
    },
    {
      name: 'allowPullRequests',
      type: 'checkbox',
      admin: {
        description: 'Allow GitHub pull request events to dry-run or publish this docs set.',
        position: 'sidebar',
      },
      defaultValue: false,
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    {
      type: 'tabs',
      tabs: [
        {
          fields: [
            {
              name: 'title',
              type: 'text',
              required: true,
            },
            {
              name: 'description',
              type: 'textarea',
            },
          ],
          label: 'Info / Content',
        },
        {
          fields: [
            {
              name: 'openGraph',
              type: 'group',
              admin: {
                description: 'Social preview metadata for this docs set.',
              },
              fields: [
                {
                  name: 'title',
                  type: 'text',
                },
                {
                  name: 'description',
                  type: 'textarea',
                },
                createOpenGraphImageField(openGraphMediaCollectionSlugs),
              ],
              label: 'OpenGraph preview',
            },
          ],
          label: 'SEO / OpenGraph',
        },
        {
          fields: [
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
          ],
          label: 'Security',
        },
        {
          fields: [
            {
              name: 'sync',
              type: 'group',
              admin: {
                description: 'Latest successful docs set sync status.',
              },
              fields: [
                {
                  name: 'lastSyncedAt',
                  type: 'date',
                },
                {
                  name: 'lastStatus',
                  type: 'select',
                  options: ['failed', 'pending', 'success'],
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
                        docsGroupsCollectionSlug,
                        docsSetsCollectionSlug: slug,
                      },
                    },
                  },
                ]
              : []),
          ],
          label: 'Sync / Generated Docs',
        },
      ],
    },
  ],
  hooks: {
    beforeChange: [populatePublishedAt],
  },
  labels: {
    plural: 'Sets',
    singular: 'Set',
  },
  versions: {
    drafts: true,
  },
})
