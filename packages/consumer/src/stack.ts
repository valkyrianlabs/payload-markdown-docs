import type { DocsProjectsStackCategory } from './contract.js'

/**
 * Display label for a stack category key: `-` and `_` become spaces and each word starts
 * upper case (`infrastructure` -> `Infrastructure`, `machine-learning` -> `Machine Learning`).
 */
export const formatStackCategory = (category: string): string =>
  category
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

/** Every technology name in stack order, for a single row of pills. */
export const flattenStack = (stack: DocsProjectsStackCategory[]): string[] =>
  stack.flatMap((category) => category.items.map((item) => item.name))
