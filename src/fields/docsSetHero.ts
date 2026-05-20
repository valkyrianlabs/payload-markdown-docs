import type { Field, GroupField, SelectField } from 'payload'

import type { DocsRelationship, DocsRelationshipID, DocsSetReference } from '../marketing/types.js'

import { DEFAULT_DOCS_SETS_COLLECTION_SLUG, DEFAULT_MEDIA_COLLECTION_SLUG } from '../constants.js'
import { getDocsRelationshipId, getDocsSetTitle, getText } from '../utilities/normalizeShared.js'
import { backgroundMediaFields } from './backgroundMedia.js'
import { ctaButtonsField } from './ctaButtons.js'
import { docsSetRelationshipField } from './docsReferences.js'
import { skillCTAFields } from './skills.js'

export const docsSetHeroTypes = [
  'docsSetFullWidth',
  'docsSetSideImage',
  'docsSetSideInfo',
] as const

export type DocsSetHeroType = (typeof docsSetHeroTypes)[number]

export type DocsHeroFieldOptions = {
  hero?: Field
  name?: string
}

type AdminCondition = NonNullable<NonNullable<Field['admin']>['condition']>

type FieldRecord = {
  admin?: {
    [key: string]: unknown
    condition?: AdminCondition
  }
  fields?: Field[]
  name?: string
  options?: SelectField['options']
  type?: string
  validate?: HeroFieldValidate
} & Field

type HeroValidationData = {
  docsSet?: unknown
  type?: unknown
}

type HeroFieldValidateResult = Promise<string | true> | string | true

type HeroFieldValidate = (
  value: unknown,
  options: { req?: unknown; siblingData: HeroValidationData },
) => HeroFieldValidateResult

type HeroValidationPayload = {
  payload?: {
    findByID?: (args: {
      collection: string
      depth?: number
      id: DocsRelationshipID
      overrideAccess?: boolean
    }) => Promise<DocsSetReference | null>
  }
}

const docsHeroTypeOptions = [
  {
    label: 'Docs set full width',
    value: 'docsSetFullWidth',
  },
  {
    label: 'Docs set side image',
    value: 'docsSetSideImage',
  },
  {
    label: 'Docs set side info',
    value: 'docsSetSideInfo',
  },
]

export const isDocsSetHeroType = (value: unknown): value is DocsSetHeroType =>
  typeof value === 'string' && docsSetHeroTypes.includes(value as DocsSetHeroType)

const docsHeroCondition: AdminCondition = (_data, siblingData) =>
  isDocsSetHeroType(siblingData?.type)

const sideImageCondition: AdminCondition = (_data, siblingData) =>
  siblingData?.type === 'docsSetSideImage'

const fullWidthCondition: AdminCondition = (_data, siblingData) =>
  siblingData?.type === 'docsSetFullWidth'

const nonDocsHeroCondition: AdminCondition = (_data, siblingData) =>
  !isDocsSetHeroType(siblingData?.type)

const mergeConditions =
  (first: AdminCondition | undefined, second: AdminCondition): AdminCondition =>
  (data, siblingData, options) => {
    if (first && !first(data, siblingData, options)) {
      return false
    }

    return second(data, siblingData, options)
  }

const withCondition = (field: Field, condition: AdminCondition): Field => {
  const fieldRecord = field as FieldRecord

  return {
    ...fieldRecord,
    admin: {
      ...fieldRecord.admin,
      condition: mergeConditions(fieldRecord.admin?.condition, condition),
    },
  } as Field
}

const normalizeOptionValue = (option: unknown): string | undefined => {
  if (typeof option === 'string') {
    return option
  }

  if (typeof option === 'object' && option !== null && 'value' in option) {
    const value = (option as { value?: unknown }).value

    return typeof value === 'string' ? value : undefined
  }

  return undefined
}

const mergeHeroTypeField = (field: Field): Field => {
  const fieldRecord = field as FieldRecord

  if (
    fieldRecord.name !== 'type' ||
    (fieldRecord.type !== 'select' && fieldRecord.type !== 'radio')
  ) {
    return field
  }

  const existingOptions = Array.isArray(fieldRecord.options) ? fieldRecord.options : []
  const existingValues = new Set(existingOptions.map(normalizeOptionValue).filter(Boolean))
  const missingOptions = docsHeroTypeOptions.filter((option) => !existingValues.has(option.value))

  return {
    ...fieldRecord,
    options: [...existingOptions, ...missingOptions],
  } as Field
}

const docsSetField = (): Field => {
  const field = docsSetRelationshipField()

  return withCondition(
    {
      ...(field as FieldRecord),
      validate: (value: unknown, { siblingData }: { siblingData: HeroValidationData }) => {
        if (!isDocsSetHeroType(siblingData?.type)) {
          return true
        }

        if (getDocsRelationshipId(value as DocsRelationship<{ id?: DocsRelationshipID }>)) {
          return true
        }

        return 'Select a docs set for this hero.'
      },
    } as Field,
    docsHeroCondition,
  )
}

const validateDocsHeroHeading: HeroFieldValidate = async (value, options) => {
  if (!isDocsSetHeroType(options.siblingData?.type)) {
    return true
  }

  if (getText(value as null | string | undefined)) {
    return true
  }

  if (getDocsSetTitle(options.siblingData.docsSet as DocsRelationship<DocsSetReference>)) {
    return true
  }

  const docsSetId = getDocsRelationshipId(
    options.siblingData.docsSet as DocsRelationship<{ id?: DocsRelationshipID }>,
  )

  if (!docsSetId) {
    return 'Add a heading or select a docs set with a title.'
  }

  const payload = (options.req as HeroValidationPayload | undefined)?.payload

  if (!payload?.findByID) {
    return true
  }

  const docsSet = await payload.findByID({
    id: docsSetId,
    collection: DEFAULT_DOCS_SETS_COLLECTION_SLUG,
    depth: 0,
    overrideAccess: true,
  })

  return getDocsSetTitle(docsSet) ? true : 'Add a heading or select a docs set with a title.'
}

const withDocsHeroHeadingValidation = (field: Field): Field => {
  const fieldRecord = field as FieldRecord
  const existingValidate = fieldRecord.validate

  return {
    ...fieldRecord,
    admin: {
      ...fieldRecord.admin,
      description:
        typeof fieldRecord.admin?.description === 'string'
          ? fieldRecord.admin.description
          : 'Required unless the selected docs set provides a title.',
    },
    validate: async (
      value: unknown,
      options: { req?: unknown; siblingData: HeroValidationData },
    ) => {
      const existingResult = existingValidate ? await existingValidate(value, options) : true

      if (existingResult !== true) {
        return existingResult
      }

      return validateDocsHeroHeading(value, options)
    },
  } as Field
}

const docsHeroHeadingField = (): Field =>
  withCondition(
    withDocsHeroHeadingValidation({
      name: 'heading',
      type: 'text',
    } as Field),
    docsHeroCondition,
  )

const createDocsHeroFields = (existingFieldNames = new Set<string>()): Field[] =>
  [
    docsSetField(),
    withCondition(
      {
        name: 'eyebrow',
        type: 'text',
        admin: {
          description: 'Small uppercase pre-heading text rendered above the main heading.',
        },
      } as Field,
      docsHeroCondition,
    ),
    withCondition(
      {
        name: 'badge',
        type: 'text',
        admin: {
          description:
            'Single pill label rendered near the hero heading for status, version, category, or launch metadata.',
        },
      } as Field,
      docsHeroCondition,
    ),
    docsHeroHeadingField(),
    withCondition(
      {
        name: 'description',
        type: 'textarea',
        admin: {
          description:
            'Optional description override. Defaults to the selected docs set description.',
        },
      } as Field,
      docsHeroCondition,
    ),
    withCondition(
      {
        name: 'docsLabel',
        type: 'text',
        admin: {
          description: 'Label for the fallback link to the selected docs set.',
        },
        defaultValue: 'Read the docs',
      } as Field,
      docsHeroCondition,
    ),
    withCondition(
      backgroundMediaFields({
        mediaRequired: false,
      }),
      fullWidthCondition,
    ),
    withCondition(
      {
        name: 'image',
        type: 'upload',
        admin: {
          description:
            'Optional side image. Defaults to the selected docs set SEO image when present.',
        },
        displayPreview: true,
        label: 'Image',
        maxDepth: 1,
        relationTo: DEFAULT_MEDIA_COLLECTION_SLUG,
      } as Field,
      sideImageCondition,
    ),
    withCondition(
      {
        name: 'imagePosition',
        type: 'select',
        admin: {
          description: 'Controls which side the image appears on for the side image hero.',
        },
        defaultValue: 'right',
        options: [
          {
            label: 'Left',
            value: 'left',
          },
          {
            label: 'Right',
            value: 'right',
          },
        ],
      } as Field,
      sideImageCondition,
    ),
    withCondition(
      ctaButtonsField({
        maxRows: 2,
      }),
      docsHeroCondition,
    ),
    withCondition(skillCTAFields(), docsHeroCondition),
  ].filter((field) => {
    const fieldRecord = field as FieldRecord

    return typeof fieldRecord.name !== 'string' || !existingFieldNames.has(fieldRecord.name)
  })

const createTypeField = (): Field => ({
  name: 'type',
  type: 'select',
  defaultValue: 'none',
  label: 'Type',
  options: [
    {
      label: 'None',
      value: 'none',
    },
    ...docsHeroTypeOptions,
  ],
  required: true,
})

const mergeLocalHeroFields = (hero: Field): Field[] => {
  const heroRecord = hero as FieldRecord

  return (heroRecord.fields ?? []).map((field) => {
    const fieldRecord = field as FieldRecord

    if (fieldRecord.name === 'type') {
      return mergeHeroTypeField(field)
    }

    if (fieldRecord.name === 'heading') {
      return withDocsHeroHeadingValidation(field)
    }

    if (fieldRecord.name === 'description') {
      return field
    }

    return withCondition(field, nonDocsHeroCondition)
  })
}

export const docsHeroField = ({ name = 'hero', hero }: DocsHeroFieldOptions = {}): GroupField => {
  const heroRecord = hero as FieldRecord | undefined
  const existingFieldNames =
    heroRecord?.type === 'group' && Array.isArray(heroRecord.fields)
      ? new Set(
          heroRecord.fields.flatMap((field) => {
            const fieldName = (field as FieldRecord).name

            return typeof fieldName === 'string' ? [fieldName] : []
          }),
        )
      : new Set<string>()
  const localFields =
    heroRecord?.type === 'group' && Array.isArray(heroRecord.fields)
      ? mergeLocalHeroFields(hero as Field)
      : [createTypeField()]

  return {
    name,
    type: 'group',
    admin: {
      ...(heroRecord?.type === 'group' ? heroRecord.admin : undefined),
      custom: {
        ...(heroRecord?.type === 'group' ? heroRecord.admin?.custom : undefined),
        payloadMarkdownDocsHero: true,
      },
      description:
        'Hero picker with docs set hero variants. Docs heroes derive title, description, links, and skill buttons from the selected docs set.',
    },
    fields: [...localFields, ...createDocsHeroFields(existingFieldNames)],
    label: heroRecord?.type === 'group' ? heroRecord.label : false,
  }
}
