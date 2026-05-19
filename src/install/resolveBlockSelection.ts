import type {
  DocsBlockInstallSelection,
  DocsCollectionInstallConfig,
  DocsMarketingBlockKey,
} from '../types.js'

export type ResolvedDocsBlockSelection = Record<DocsMarketingBlockKey, boolean>

export const docsMarketingBlockKeys = ['docsCTA'] as const

const emptySelection = (): ResolvedDocsBlockSelection => ({
  docsCTA: false,
})

const allSelection = (): ResolvedDocsBlockSelection => ({
  docsCTA: true,
})

const isSelectionObject = (
  selection: DocsBlockInstallSelection | undefined,
): selection is Exclude<DocsBlockInstallSelection, boolean> =>
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

  const legacyCTASelection = selection.cta

  const resolved = docsMarketingBlockKeys.reduce<ResolvedDocsBlockSelection>(
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

  if (typeof legacyCTASelection === 'boolean' && typeof selection.docsCTA !== 'boolean') {
    resolved.docsCTA = legacyCTASelection
  }

  return resolved
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
