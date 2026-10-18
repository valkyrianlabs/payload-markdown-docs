import { isRecord } from './records.js'

export type StackCategory = {
  category: string
  items: Array<{ name: string }>
}

/** A stored docs set stack as normalized categories (anything malformed reads as empty). */
export const getStackCategories = (value: unknown): StackCategory[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.category !== 'string' || !Array.isArray(entry.items)) {
          return []
        }

        const items = entry.items.flatMap((item) =>
          isRecord(item) && typeof item.name === 'string' && item.name !== '' ? [{ name: item.name }] : [],
        )

        return items.length > 0 ? [{ category: entry.category, items }] : []
      })
    : []

/** Display label for a stack category key (`machine-learning` -> `Machine Learning`). */
export const formatStackCategory = (category: string): string =>
  category
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
