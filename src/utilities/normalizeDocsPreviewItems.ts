import type { NormalizedDocsPreviewItem } from '../marketing/types.js'

import {
  getRouteLikeDescription,
  getRouteLikeHref,
  getRouteLikeTitle,
  getString,
  isRecord,
} from './normalizeShared.js'

const getPreviewItemSource = (input: unknown): unknown => {
  if (isRecord(input)) {
    return input.routeReference ?? input.reference ?? input
  }

  return input
}

const normalizePreviewItem = (input: unknown): NormalizedDocsPreviewItem | undefined => {
  if (!isRecord(input)) {
    return undefined
  }

  const source = getPreviewItemSource(input)
  const title = getString(input.title) ?? getRouteLikeTitle(source)

  if (!title) {
    return undefined
  }

  return {
    badge: getString(input.badge),
    excerpt:
      getString(input.excerpt) ??
      getString(input.description) ??
      getRouteLikeDescription(source),
    href:
      getString(input.href) ??
      getString(input.url) ??
      getString(input.route) ??
      getRouteLikeHref(source),
    icon: getString(input.icon),
    title,
  }
}

const getPreviewInputArray = (input: unknown): unknown[] => {
  if (Array.isArray(input)) {
    return input
  }

  if (!isRecord(input)) {
    return []
  }

  if (Array.isArray(input.manualItems)) {
    return input.manualItems
  }

  if (Array.isArray(input.items)) {
    return input.items
  }

  if (Array.isArray(input.pages)) {
    return input.pages
  }

  if (Array.isArray(input.docs)) {
    return input.docs
  }

  return []
}

export const normalizeDocsPreviewItems = (
  input: unknown,
  options: { maxItems?: null | number } = {},
): NormalizedDocsPreviewItem[] => {
  const items = getPreviewInputArray(input)
    .map(normalizePreviewItem)
    .filter((item): item is NormalizedDocsPreviewItem => item !== undefined)

  if (typeof options.maxItems === 'number' && options.maxItems > 0) {
    return items.slice(0, options.maxItems)
  }

  return items
}
