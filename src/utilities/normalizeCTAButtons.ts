import type {
  DocsActionVariant,
  DocsCTAButtonInput,
  NormalizedDocsCTAButton,
} from '../marketing/types.js'

import {
  getBoolean,
  getDocsPageHref,
  getDocsSetPublicHref,
  getRouteLikeHref,
  getString,
  isRecord,
} from './normalizeShared.js'

const variants: DocsActionVariant[] = ['primary', 'secondary', 'outline', 'ghost', 'link']

const getVariant = (value: unknown): DocsActionVariant =>
  typeof value === 'string' && variants.includes(value as DocsActionVariant)
    ? (value as DocsActionVariant)
    : 'primary'

const normalizeCTAButton = (
  input: unknown,
  options: { docsSet?: unknown } = {},
): NormalizedDocsCTAButton | undefined => {
  const candidate = isRecord(input) && isRecord(input.link) ? input.link : input

  if (!isRecord(candidate)) {
    return undefined
  }

  const target = candidate.target
  const docsSet = candidate.docsSet ?? options.docsSet
  const href =
    target === 'set'
      ? getDocsSetPublicHref(docsSet)
      : target === 'setPage'
        ? getDocsPageHref(candidate.page)
        : target === 'custom'
          ? getString(candidate.url) ?? getString(candidate.href)
          : (getString(candidate.href) ??
            getString(candidate.url) ??
            getDocsPageHref(candidate.page) ??
            getDocsSetPublicHref(docsSet) ??
            getRouteLikeHref(candidate.routeReference) ??
            getRouteLikeHref(candidate.reference))
  const label = getString(candidate.label)

  if (!href || !label) {
    return undefined
  }

  return {
    href,
    icon: getString(candidate.icon),
    label,
    newTab: getBoolean(candidate.newTab),
    variant: getVariant(candidate.variant ?? candidate.appearance),
  }
}

const getInputArray = (input: unknown): unknown[] => {
  if (Array.isArray(input)) {
    return input
  }

  if (!isRecord(input)) {
    return []
  }

  if (Array.isArray(input.ctaButtons)) {
    return input.ctaButtons
  }

  if (Array.isArray(input.actions)) {
    return input.actions
  }

  if (Array.isArray(input.links)) {
    return input.links
  }

  return []
}

export const normalizeCTAButtons = (
  input: unknown,
  fallback?: DocsCTAButtonInput,
  options: { docsSet?: unknown } = {},
): NormalizedDocsCTAButton[] => {
  const buttons = getInputArray(input)
    .map((button) => normalizeCTAButton(button, options))
    .filter((button): button is NormalizedDocsCTAButton => button !== undefined)

  const fallbackButton = normalizeCTAButton(fallback, options)

  if (buttons.length === 0 && fallbackButton) {
    return [fallbackButton]
  }

  return buttons
}
