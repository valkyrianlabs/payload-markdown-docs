import type { Field, GroupField } from 'payload'

import { DEFAULT_MEDIA_COLLECTION_SLUG } from '../constants.js'

export type DocsBackgroundMediaFieldOptions = {
  mediaRequired?: boolean
  name?: string
  relationTo?: string[]
}

const createMediaField = ({
  mediaRequired,
  relationTo,
}: {
  mediaRequired: boolean
  relationTo?: string[]
}): Field => {
  const slugs = relationTo?.length ? relationTo : [DEFAULT_MEDIA_COLLECTION_SLUG]
  const fieldBase = {
    name: 'media',
    type: 'upload' as const,
    admin: {
      width: '50%',
    },
    displayPreview: true,
    label: 'Media',
    maxDepth: 1,
    required: mediaRequired,
  }

  if (slugs.length === 1) {
    return {
      ...fieldBase,
      relationTo: slugs[0] ?? DEFAULT_MEDIA_COLLECTION_SLUG,
    }
  }

  return {
    ...fieldBase,
    relationTo: slugs,
  }
}

export const backgroundMediaFields = ({
  name = 'background',
  mediaRequired = false,
  relationTo,
}: DocsBackgroundMediaFieldOptions = {}): GroupField => ({
  name,
  type: 'group',
  admin: {
    description: 'Optional background media and overlay controls.',
  },
  fields: [
    {
      type: 'row',
      fields: [
        createMediaField({
          mediaRequired,
          relationTo,
        }),
        {
          name: 'alt',
          type: 'text',
          admin: {
            description: 'Optional alt text when this image is also rendered as content.',
            width: '50%',
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'overlay',
          type: 'checkbox',
          admin: {
            width: '33%',
          },
          defaultValue: true,
        },
        {
          name: 'overlayOpacity',
          type: 'number',
          admin: {
            description: '0 to 95.',
            width: '33%',
          },
          defaultValue: 45,
          max: 95,
          min: 0,
        },
        {
          name: 'overlayVariant',
          type: 'select',
          admin: {
            width: '33%',
          },
          defaultValue: 'dark',
          options: [
            {
              label: 'Dark',
              value: 'dark',
            },
            {
              label: 'Light',
              value: 'light',
            },
            {
              label: 'Brand',
              value: 'brand',
            },
            {
              label: 'Gradient',
              value: 'gradient',
            },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'position',
          type: 'select',
          admin: {
            width: '33%',
          },
          defaultValue: 'center',
          options: [
            'center',
            'top',
            'bottom',
            'left',
            'right',
          ].map((value) => ({
            label: value.charAt(0).toUpperCase() + value.slice(1),
            value,
          })),
        },
        {
          name: 'fit',
          type: 'select',
          admin: {
            width: '33%',
          },
          defaultValue: 'cover',
          options: [
            {
              label: 'Cover',
              value: 'cover',
            },
            {
              label: 'Contain',
              value: 'contain',
            },
            {
              label: 'Fill',
              value: 'fill',
            },
          ],
        },
        {
          name: 'gradient',
          type: 'select',
          admin: {
            width: '33%',
          },
          defaultValue: 'none',
          options: [
            {
              label: 'None',
              value: 'none',
            },
            {
              label: 'Subtle',
              value: 'subtle',
            },
            {
              label: 'Brand',
              value: 'brand',
            },
          ],
        },
      ],
    },
    {
      name: 'caption',
      type: 'text',
    },
  ] satisfies Field[],
})
