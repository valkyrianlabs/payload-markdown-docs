import type { Block, CollectionConfig, Field } from 'payload'

import type {
  DocsBlockInstallSelection,
  DocsCollectionInstallConfig,
  DocsMarketingBlockKey,
  PayloadMarkdownDocsCollectionsConfig,
} from '../types.js'

import { DocsCTABlock } from '../blocks/index.js'
import {
  getSelectedBlockKeys,
  resolveCollectionBlockSelection,
} from './resolveBlockSelection.js'

export const docsMarketingBlocks: Record<DocsMarketingBlockKey, Block> = {
  docsCTA: DocsCTABlock,
}

type InstallFieldsResult = {
  blockFieldFound: boolean
  changed: boolean
  fields: Field[]
}

type InstallCollectionResult = {
  blockFieldFound: boolean
  changed: boolean
  collection: CollectionConfig
}

type InstallDocsMarketingBlocksResult = {
  collections: CollectionConfig[]
  installedCollectionSlugs: string[]
}

type FieldRecord = {
  blocks?: Block[]
  fields?: Field[]
  tabs?: ({ fields?: Field[] } & Record<string, unknown>)[]
} & Field

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getBlockSlug = (block: Block): string => block.slug

const appendMissingBlocks = (existingBlocks: Block[] = [], blocksToInstall: Block[]): Block[] => {
  const existingSlugs = new Set(existingBlocks.map(getBlockSlug))
  const missingBlocks = blocksToInstall.filter((block) => !existingSlugs.has(block.slug))

  return missingBlocks.length > 0 ? [...existingBlocks, ...missingBlocks] : existingBlocks
}

const installBlocksIntoFields = (fields: Field[], blocksToInstall: Block[]): InstallFieldsResult => {
  let blockFieldFound = false
  let changed = false

  const nextFields = fields.map((field): Field => {
    const fieldRecord = field as FieldRecord

    if (fieldRecord.type === 'blocks') {
      blockFieldFound = true
      const nextBlocks = appendMissingBlocks(fieldRecord.blocks, blocksToInstall)

      if (nextBlocks !== fieldRecord.blocks) {
        changed = true

        return {
          ...fieldRecord,
          blocks: nextBlocks,
        } as Field
      }

      return field
    }

    if (Array.isArray(fieldRecord.fields)) {
      const result = installBlocksIntoFields(fieldRecord.fields, blocksToInstall)
      blockFieldFound = blockFieldFound || result.blockFieldFound
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

        const result = installBlocksIntoFields(tab.fields, blocksToInstall)
        blockFieldFound = blockFieldFound || result.blockFieldFound
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
    blockFieldFound,
    changed,
    fields: changed ? nextFields : fields,
  }
}

export const installBlocksIntoCollection = (
  collection: CollectionConfig,
  blocksToInstall: Block[],
): InstallCollectionResult => {
  if (blocksToInstall.length === 0 || !Array.isArray(collection.fields)) {
    return {
      blockFieldFound: false,
      changed: false,
      collection,
    }
  }

  const result = installBlocksIntoFields(collection.fields, blocksToInstall)

  return {
    blockFieldFound: result.blockFieldFound,
    changed: result.changed,
    collection: result.changed
      ? {
          ...collection,
          fields: result.fields,
        }
      : collection,
  }
}

const isExplicitCollectionInstallConfig = (value: unknown): value is DocsCollectionInstallConfig => {
  if (typeof value === 'boolean') {
    return true
  }

  return isRecord(value) && 'blocks' in value
}

export const installDocsMarketingBlocks = ({
  collectionConfigs,
  collections,
  globalSelection,
}: {
  collectionConfigs?: PayloadMarkdownDocsCollectionsConfig
  collections: CollectionConfig[]
  globalSelection?: DocsBlockInstallSelection
}): InstallDocsMarketingBlocksResult => {
  if (globalSelection === undefined && !collectionConfigs) {
    return {
      collections,
      installedCollectionSlugs: [],
    }
  }

  const explicitCollectionSlugs = new Set(
    Object.entries(collectionConfigs ?? {}).flatMap(([slug, config]) =>
      isExplicitCollectionInstallConfig(config) ? [slug] : [],
    ),
  )

  const installedCollectionSlugs: string[] = []
  const nextCollections = collections.map((collection) => {
    const collectionConfig = collectionConfigs?.[collection.slug]
    const hasExplicitCollectionConfig = explicitCollectionSlugs.has(collection.slug)

    if (globalSelection === undefined && !hasExplicitCollectionConfig) {
      return collection
    }

    const selectedKeys = getSelectedBlockKeys(
      resolveCollectionBlockSelection({
        collectionConfig,
        globalSelection,
      }),
    )
    const blocksToInstall = selectedKeys.map((key) => docsMarketingBlocks[key])

    if (blocksToInstall.length === 0) {
      return collection
    }

    const result = installBlocksIntoCollection(collection, blocksToInstall)

    if (result.blockFieldFound) {
      installedCollectionSlugs.push(collection.slug)
    }

    return result.collection
  })

  return {
    collections: nextCollections,
    installedCollectionSlugs,
  }
}
