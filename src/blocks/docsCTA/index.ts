import type { Block, Field } from 'payload'

import { backgroundMediaFields, docsSetRelationshipField } from '../../fields/index.js'

const docsLinkCondition = (_data: unknown, siblingData: Record<string, unknown>) =>
  siblingData?.actionType === 'docsLink'

const fullVariantCondition = (_data: unknown, siblingData: Record<string, unknown>) =>
  siblingData?.variant === 'full'

const gradientCondition = (_data: unknown, siblingData: Record<string, unknown>) =>
  siblingData?.variant === 'normal' || siblingData?.variant === 'full'

const overrideContentCondition = (_data: unknown, siblingData: Record<string, unknown>) =>
  siblingData?.overrideContent === true

const skillsCondition = (_data: unknown, siblingData: Record<string, unknown>) =>
  siblingData?.actionType === 'skills'

const ctaBackgroundField = (): Field => {
  const field = backgroundMediaFields()

  return {
    ...field,
    admin: {
      ...field.admin,
      condition: fullVariantCondition,
    },
  } as Field
}

export const DocsCTABlock: Block = {
  slug: 'docsCTA',
  fields: [
    docsSetRelationshipField({
      required: true,
    }),
    {
      name: 'actionType',
      type: 'radio',
      admin: {
        layout: 'horizontal',
      },
      defaultValue: 'docsLink',
      options: [
        {
          label: 'Link to docs',
          value: 'docsLink',
        },
        {
          label: 'Skill buttons',
          value: 'skills',
        },
      ],
      required: true,
    },
    {
      name: 'overrideContent',
      type: 'checkbox',
      defaultValue: false,
      label: 'Override title and description',
    },
    {
      name: 'heading',
      type: 'text',
      admin: {
        condition: overrideContentCondition,
      },
      label: 'Title override',
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        condition: overrideContentCondition,
      },
      label: 'Description override',
    },
    {
      name: 'docsLabel',
      type: 'text',
      admin: {
        condition: docsLinkCondition,
      },
      defaultValue: 'Read the docs',
    },
    {
      name: 'skillOverrides',
      type: 'array',
      admin: {
        condition: skillsCondition,
        description:
          'Optional label and description overrides keyed by detected skill agent. Skill buttons are derived from docs assets for the selected docs set.',
        initCollapsed: true,
      },
      fields: [
        {
          name: 'agent',
          type: 'text',
          admin: {
            description:
              'Must match a detected skill agent from the selected docs set, such as codex or claude. Do not hardcode options.',
          },
          required: true,
        },
        {
          name: 'label',
          type: 'text',
          admin: {
            description: 'Optional override for the detected skill label.',
          },
        },
        {
          name: 'description',
          type: 'textarea',
          admin: {
            description: 'Optional override for the detected skill description.',
          },
        },
      ] satisfies Field[],
      labels: {
        plural: 'Skill overrides',
        singular: 'Skill override',
      },
    },
    {
      name: 'variant',
      type: 'select',
      defaultValue: 'normal',
      options: [
        {
          label: 'Subtle',
          value: 'subtle',
        },
        {
          label: 'Normal',
          value: 'normal',
        },
        {
          label: 'Full',
          value: 'full',
        },
      ],
    },
    {
      name: 'gradient',
      type: 'select',
      admin: {
        condition: gradientCondition,
      },
      defaultValue: 'brand',
      options: [
        {
          label: 'None',
          value: 'none',
        },
        {
          label: 'Brand',
          value: 'brand',
        },
        {
          label: 'Cyan',
          value: 'cyan',
        },
        {
          label: 'Emerald',
          value: 'emerald',
        },
        {
          label: 'Violet',
          value: 'violet',
        },
      ],
    },
    ctaBackgroundField(),
  ],
  interfaceName: 'DocsCTABlock',
  labels: {
    plural: 'Docs CTAs',
    singular: 'Docs CTA',
  },
}
