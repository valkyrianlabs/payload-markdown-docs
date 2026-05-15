import type {
  DocsBlockInstallSelection,
  DocsCollectionInstallConfig,
  DocsMarketingBlockKey,
} from '../types.js'

export type ResolvedDocsBlockSelection = Record<DocsMarketingBlockKey, boolean>

export const docsMarketingBlockKeys = ['cta', 'preview', 'callout', 'banner'] as const

const emptySelection = (): ResolvedDocsBlockSelection => ({
  banner: false,
  callout: false,
  cta: false,
  preview: false,
})

const allSelection = (): ResolvedDocsBlockSelection => ({
  banner: true,
  callout: true,
  cta: true,
  preview: true,
})

const isSelectionObject = (
  selection: DocsBlockInstallSelection | undefined,
): selection is Partial<Record<DocsMarketingBlockKey, boolean>> =>
  typeof selection === 'object' && selection !== null && !Array.isArray(selection)

export const resolveBlockSelection = (
  selection: DocsBlockInstallSelection | undefined,
  base: ResolvedDocsBlockSelection = emptySelection(),
): ResolvedDocsBlockSelection => {
  if (selection === undefined) {
    return {
      ...base,
    }
  }

  if (selection === true) {
    return allSelection()
  }

  if (selection === false) {
    return emptySelection()
  }

  if (!isSelectionObject(selection)) {
    return {
      ...base,
    }
  }

  return docsMarketingBlockKeys.reduce<ResolvedDocsBlockSelection>(
    (resolved, key) => {
      if (typeof selection[key] === 'boolean') {
        resolved[key] = selection[key]
      }

      return resolved
    },
    {
      ...base,
    },
  )
}

export const resolveCollectionBlockSelection = ({
  collectionConfig,
  globalSelection,
}: {
  collectionConfig?: DocsCollectionInstallConfig
  globalSelection?: DocsBlockInstallSelection
}): ResolvedDocsBlockSelection => {
  const globalResolved = resolveBlockSelection(globalSelection)

  if (collectionConfig === undefined) {
    return globalResolved
  }

  if (collectionConfig === true) {
    return allSelection()
  }

  if (collectionConfig === false) {
    return emptySelection()
  }

  return resolveBlockSelection(collectionConfig.blocks, globalResolved)
}

export const getSelectedBlockKeys = (
  selection: ResolvedDocsBlockSelection,
): DocsMarketingBlockKey[] => docsMarketingBlockKeys.filter((key) => selection[key])
