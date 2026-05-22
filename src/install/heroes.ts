import type { CollectionConfig, Field } from 'payload'

import type {
  DocsHeroInstallSelection,
  PayloadMarkdownDocsCollectionsConfig,
} from '../types.js'

import { docsHeroField } from '../fields/index.js'

type DocsHeroInstallConfig = {
  enabled?: boolean
  fieldName?: string
  installIfMissing?: boolean
}

type InstallDocsHeroFieldsResult = {
  collections: CollectionConfig[]
  installedCollectionSlugs: string[]
}

type InstallFieldsResult = {
  changed: boolean
  fields: Field[]
  heroFieldFound: boolean
}

type FieldRecord = {
  admin?: {
    custom?: Record<string, unknown>
  }
  fields?: Field[]
  name?: string
  tabs?: ({ fields?: Field[] } & Record<string, unknown>)[]
  type?: string
} & Field

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isSelected = (
  selection: DocsHeroInstallSelection | undefined,
): selection is DocsHeroInstallSelection => {
  if (selection === undefined || selection === false) {
    return false
  }

  if (selection === true) {
    return true
  }

  return selection.enabled !== false
}

const normalizeSelection = (
  selection: DocsHeroInstallSelection | undefined,
): DocsHeroInstallConfig | undefined => {
  if (!isSelected(selection) || selection === false) {
    return undefined
  }

  return selection === true ? {} : selection
}

const isDocsHeroField = (field: FieldRecord): boolean =>
  field.admin?.custom?.payloadMarkdownDocsHero === true

const installDocsHeroIntoFields = ({
  fieldName,
  fields,
}: {
  fieldName: string
  fields: Field[]
}): InstallFieldsResult => {
  let changed = false
  let heroFieldFound = false

  const nextFields = fields.map((field): Field => {
    const fieldRecord = field as FieldRecord

    if (fieldRecord.name === fieldName && fieldRecord.type === 'group') {
      heroFieldFound = true

      if (isDocsHeroField(fieldRecord)) {
        return field
      }

      changed = true

      return docsHeroField({
        name: fieldName,
        hero: field,
      }) as Field
    }

    if (Array.isArray(fieldRecord.fields)) {
      const result = installDocsHeroIntoFields({
        fieldName,
        fields: fieldRecord.fields,
      })
      heroFieldFound = heroFieldFound || result.heroFieldFound
      changed = changed || result.changed

      return result.changed
        ? ({
            ...fieldRecord,
            fields: result.fields,
          } as Field)
        : field
    }

    if (Array.isArray(fieldRecord.tabs)) {
      let tabsChanged = false
      const nextTabs = fieldRecord.tabs.map((tab) => {
        if (!Array.isArray(tab.fields)) {
          return tab
        }

        const result = installDocsHeroIntoFields({
          fieldName,
          fields: tab.fields,
        })
        heroFieldFound = heroFieldFound || result.heroFieldFound
        tabsChanged = tabsChanged || result.changed

        return result.changed
          ? {
              ...tab,
              fields: result.fields,
            }
          : tab
      })

      if (tabsChanged) {
        changed = true

        return {
          ...fieldRecord,
          tabs: nextTabs,
        } as Field
      }
    }

    return field
  })

  return {
    changed,
    fields: changed ? nextFields : fields,
    heroFieldFound,
  }
}

const getCollectionHeroSelection = ({
  collectionConfig,
  collectionSlug,
  defaultPagesCollectionSlug,
  globalSelection,
  pagesSelection,
}: {
  collectionConfig: unknown
  collectionSlug: string
  defaultPagesCollectionSlug: string
  globalSelection?: DocsHeroInstallSelection
  pagesSelection?: DocsHeroInstallSelection
}): DocsHeroInstallSelection | undefined => {
  if (isRecord(collectionConfig)) {
    const collectionHeroSelection = collectionConfig.heroes

    if (collectionHeroSelection !== undefined) {
      return collectionHeroSelection as DocsHeroInstallSelection
    }
  }

  if (collectionSlug === defaultPagesCollectionSlug) {
    return pagesSelection ?? globalSelection
  }

  return undefined
}

export const installDocsHeroFields = ({
  collectionConfigs,
  collections,
  defaultPagesCollectionSlug,
  globalSelection,
  pagesSelection,
}: {
  collectionConfigs?: PayloadMarkdownDocsCollectionsConfig
  collections: CollectionConfig[]
  defaultPagesCollectionSlug: string
  globalSelection?: DocsHeroInstallSelection
  pagesSelection?: DocsHeroInstallSelection
}): InstallDocsHeroFieldsResult => {
  const installedCollectionSlugs: string[] = []
  const nextCollections = collections.map((collection) => {
    const selection = normalizeSelection(
      getCollectionHeroSelection({
        collectionConfig: collectionConfigs?.[collection.slug],
        collectionSlug: collection.slug,
        defaultPagesCollectionSlug,
        globalSelection,
        pagesSelection,
      }),
    )

    if (!selection) {
      return collection
    }

    const fieldName = selection.fieldName ?? 'hero'
    const installIfMissing = selection.installIfMissing ?? true
    const result = installDocsHeroIntoFields({
      fieldName,
      fields: collection.fields,
    })

    if (result.heroFieldFound) {
      installedCollectionSlugs.push(collection.slug)

      return result.changed
        ? {
            ...collection,
            fields: result.fields,
          }
        : collection
    }

    if (!installIfMissing) {
      return collection
    }

    installedCollectionSlugs.push(collection.slug)

    return {
      ...collection,
      fields: [
        ...collection.fields,
        docsHeroField({
          name: fieldName,
        }),
      ],
    }
  })

  return {
    collections: nextCollections,
    installedCollectionSlugs,
  }
}
