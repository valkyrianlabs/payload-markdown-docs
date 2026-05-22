import type {
  DocsActionVariant,
  DocsCTAButtonInput,
  DocsRelationship,
  DocsSetReference,
  NormalizedDocsCTAButton,
} from '../marketing/types.js'

import { getBoolean, getDocsPageHref, getDocsSetPublicHref, getString } from './normalizeShared.js'

const variants: DocsActionVariant[] = ['primary', 'secondary', 'outline', 'ghost', 'link']

type CTAButtonCollectionInput =
  | (DocsCTAButtonInput | null | undefined)[]
  | {
      ctaButtons?: DocsCTAButtonInput[] | null
    }
  | null
  | undefined

const getVariant = (value: DocsActionVariant | null | undefined): DocsActionVariant =>
  typeof value === 'string' && variants.includes(value)
    ? (value)
    : 'primary'

const normalizeCTAButton = (
  input: DocsCTAButtonInput | null | undefined,
  options: { docsSet?: DocsRelationship<DocsSetReference> | null } = {},
): NormalizedDocsCTAButton | undefined => {
  if (!input) {
    return undefined
  }

  const target = input.target
  const docsSet = input.docsSet ?? options.docsSet
  const href =
    target === 'set'
      ? getDocsSetPublicHref(docsSet)
      : target === 'setPage'
        ? getDocsPageHref(input.page)
        : target === 'custom'
          ? getString(input.url) ?? getString(input.href)
          : (getString(input.href) ??
            getString(input.url) ??
            getDocsPageHref(input.page) ??
            getDocsSetPublicHref(docsSet))
  const label = getString(input.label)

  if (!href || !label) {
    return undefined
  }

  return {
    href,
    icon: getString(input.icon),
    label,
    newTab: getBoolean(input.newTab),
    variant: getVariant(input.variant),
  }
}

const getInputArray = (
  input: CTAButtonCollectionInput,
): (DocsCTAButtonInput | null | undefined)[] => {
  if (Array.isArray(input)) {
    return input
  }

  if (!input) {
    return []
  }

  if (Array.isArray(input.ctaButtons)) {
    return input.ctaButtons
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
