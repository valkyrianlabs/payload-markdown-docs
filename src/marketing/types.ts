import type { ReactNode } from 'react'

export type DocsActionVariant = 'ghost' | 'link' | 'outline' | 'primary' | 'secondary'
export type DocsCTAButtonTarget = 'custom' | 'set' | 'setPage'

export type DocsCTAButtonInput = {
  docsSet?: unknown
  href?: null | string
  icon?: null | string
  label?: null | string
  newTab?: boolean | null
  page?: unknown
  target?: DocsCTAButtonTarget | null
  url?: null | string
  variant?: DocsActionVariant | null
}

export type NormalizedDocsCTAButton = {
  href: string
  icon?: string
  label: string
  newTab?: boolean
  variant: DocsActionVariant
}

export type DocsBackgroundFit = 'contain' | 'cover' | 'fill'

export type DocsBackgroundPosition =
  | 'bottom'
  | 'center'
  | 'left'
  | 'right'
  | 'top'

export type DocsBackgroundOverlayVariant = 'brand' | 'dark' | 'gradient' | 'light'

export type DocsBackgroundMediaInput = {
  advancedControls?: boolean | null
  fit?: DocsBackgroundFit | null
  gradient?: 'brand' | 'none' | 'subtle' | null
  media?: unknown
  overlay?: boolean | null
  overlayOpacity?: null | number
  overlayVariant?: DocsBackgroundOverlayVariant | null
  position?: DocsBackgroundPosition | null
}

export type NormalizedDocsMedia = {
  alt?: string
  height?: number
  id?: string
  relationTo?: string
  url: string
  width?: number
}

export type NormalizedDocsBackgroundMedia = {
  fit: DocsBackgroundFit
  gradient?: 'brand' | 'none' | 'subtle'
  media?: NormalizedDocsMedia
  overlay: boolean
  overlayOpacity: number
  overlayVariant: DocsBackgroundOverlayVariant
  position: DocsBackgroundPosition
}

export type SkillCTAType = 'claude' | 'codex' | 'custom'

export type SkillCTAItemInput = {
  description?: null | string
  href?: null | string
  icon?: null | string
  label?: null | string
  type?: null | SkillCTAType
  url?: null | string
}

export type SkillCTAGroupInput = {
  description?: null | string
  display?: 'buttons' | 'cards' | 'tabs' | null
  enabled?: boolean | null
  heading?: null | string
  resolvedItems?: NormalizedSkillCTAItem[] | null
}

export type NormalizedSkillCTAItem = {
  description?: string
  href?: string
  icon?: string
  label: string
  type: SkillCTAType
}

export type NormalizedSkillCTAGroup = {
  description?: string
  display: 'buttons' | 'cards' | 'tabs'
  heading?: string
  items: NormalizedSkillCTAItem[]
}

export type DocsPreviewItemInput = {
  badge?: null | string
  description?: null | string
  excerpt?: null | string
  href?: null | string
  icon?: null | string
  route?: null | string
  title?: null | string
  url?: null | string
}

export type NormalizedDocsPreviewItem = {
  badge?: string
  excerpt?: string
  href?: string
  icon?: string
  title: string
}

export type DocsTheme = 'brand' | 'dark' | 'default' | 'muted'

export type DocsCTAProps = {
  background?: DocsBackgroundMediaInput | null
  badges?: { label?: null | string }[] | null | string[]
  className?: string
  containerClassName?: string
  ctaButtons?: DocsCTAButtonInput[] | null
  description?: ReactNode
  docsLabel?: null | string
  docsSet?: unknown
  eyebrow?: null | string
  heading?: null | string
  headingLevel?: 1 | 2 | 3 | 4
  layout?: 'card' | 'centered' | 'inline' | 'split' | null
  skills?: null | SkillCTAGroupInput
  theme?: DocsTheme | null
}

export type DocsPreviewProps = {
  className?: string
  containerClassName?: string
  ctaButtons?: DocsCTAButtonInput[] | null
  description?: ReactNode
  docsSet?: unknown
  heading?: null | string
  headingLevel?: 1 | 2 | 3 | 4
  layout?: 'cards' | 'compact' | 'featured' | 'list' | null
  skills?: null | SkillCTAGroupInput
  theme?: DocsTheme | null
  viewAllLabel?: null | string
}

export type DocsCalloutProps = {
  className?: string
  containerClassName?: string
  ctaLabel?: null | string
  description?: ReactNode
  docsPage?: unknown
  docsSet?: unknown
  excerpt?: null | string
  heading?: null | string
  icon?: null | string
  layout?: 'card' | 'fullWidth' | 'inline' | 'sidebar' | null
  skills?: null | SkillCTAGroupInput
  variant?: 'brand' | 'info' | 'neutral' | 'success' | 'warning' | null
}

export type DocsBannerProps = {
  background?: DocsBackgroundMediaInput | null
  badge?: null | string
  className?: string
  containerClassName?: string
  ctaButtons?: DocsCTAButtonInput[] | null
  description?: ReactNode
  docsSet?: unknown
  eyebrow?: null | string
  heading?: null | string
  headingLevel?: 1 | 2 | 3 | 4
  size?: 'lg' | 'md' | 'sm' | 'xl' | null
  skills?: null | SkillCTAGroupInput
  textAlign?: 'center' | 'left' | 'right' | null
  theme?: DocsTheme | null
}

export type DocsProductHeroPreview = {
  groupName?: string
  items?: DocsPreviewItemInput[]
  pageCount?: number
  setName?: string
  title?: string
  version?: string
}

export type DocsProductHeroProps = {
  background?: DocsBackgroundMediaInput | null
  badges?: { label?: null | string }[] | null | string[]
  className?: string
  containerClassName?: string
  description?: ReactNode
  docsAction?: DocsCTAButtonInput | null
  docsLabel?: null | string
  docsUrl?: null | string
  eyebrow?: null | string
  heading?: null | string
  preview?: DocsProductHeroPreview | null
  primaryAction?: DocsCTAButtonInput | null
  secondaryAction?: DocsCTAButtonInput | null
  skills?: null | SkillCTAGroupInput
}

export type DocsNativeHeroProps = {
  background?: DocsBackgroundMediaInput | null
  breadcrumb?: { href?: string; label: string }[] | null | string
  className?: string
  containerClassName?: string
  description?: ReactNode
  eyebrow?: null | string
  metadata?: { label?: string; value: string }[] | null | string[]
  navigationAction?: DocsCTAButtonInput | null
  searchAction?: DocsCTAButtonInput | null
  searchSlot?: ReactNode
  skills?: null | SkillCTAGroupInput
  title?: null | string
}

export type SkillCTAGroupProps = {
  className?: string
  skills?: null | SkillCTAGroupInput
}

export type SkillTabsProps = {
  className?: string
  items?: NormalizedSkillCTAItem[] | null | SkillCTAItemInput[]
}
