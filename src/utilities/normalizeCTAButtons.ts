import type {
  DocsActionVariant,
  DocsCTAButtonInput,
  DocsPageReference,
  DocsRelationship,
  DocsSetReference,
  NormalizedDocsCTAButton,
} from '../marketing/types.js'

import {
  getBoolean,
  getDocsPageHref,
  getDocsSetPublicHref,
  getRouteLikeHref,
  getString,
} from './normalizeShared.js'

const variants: DocsActionVariant[] = ['primary', 'secondary', 'outline', 'ghost', 'link']

type LegacyCTAButtonInput = {
  appearance?: DocsActionVariant | null
  link?: LegacyCTAButtonInput | null
  reference?: DocsRelationship<DocsPageReference | DocsSetReference> | null
  routeReference?: DocsRelationship<DocsPageReference> | null
} & DocsCTAButtonInput

type CTAButtonCollectionInput =
  | (LegacyCTAButtonInput | null | undefined)[]
  | {
      actions?: LegacyCTAButtonInput[] | null
      ctaButtons?: LegacyCTAButtonInput[] | null
      links?: LegacyCTAButtonInput[] | null
    }
  | null
  | undefined

const getVariant = (value: DocsActionVariant | null | undefined): DocsActionVariant =>
  typeof value === 'string' && variants.includes(value)
    ? (value)
    : 'primary'

const normalizeCTAButton = (
  input: LegacyCTAButtonInput | null | undefined,
  options: { docsSet?: DocsRelationship<DocsSetReference> | null } = {},
): NormalizedDocsCTAButton | undefined => {
  if (!input) {
    return undefined
  }

  const candidate = input.link ?? input
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

const getInputArray = (
  input: CTAButtonCollectionInput,
): (LegacyCTAButtonInput | null | undefined)[] => {
  if (Array.isArray(input)) {
    return input
  }

  if (!input) {
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
  input: CTAButtonCollectionInput,
  fallback?: DocsCTAButtonInput,
  options: { docsSet?: DocsRelationship<DocsSetReference> | null } = {},
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
