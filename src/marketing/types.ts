import type { ReactNode } from 'react'

import type { DocsSetRouteMode } from '../routing/index.js'

export type DocsRelationshipID = number | string

export type DocsRelationship<TRecord> =
  | {
      relationTo?: null | string
      value: DocsRelationshipID | TRecord
    }
  | DocsRelationshipID
  | TRecord

export type DocsGroupReference = {
  id?: DocsRelationshipID
  parent?: DocsRelationship<DocsGroupReference> | null
  routePath?: null | string
  slug?: null | string
  title?: null | string
}

export type DocsSetReference = {
  description?: null | string
  group?: DocsRelationship<DocsGroupReference> | null
  id?: DocsRelationshipID
  label?: null | string
  meta?: {
    description?: null | string
    image?: DocsRelationship<DocsMediaReference> | null
    title?: null | string
  } | null
  navTitle?: null | string
  productRoute?: null | string
  routeBase?: null | string
  routeMode?: DocsSetRouteMode | null
  slug?: null | string
  title?: null | string
}

export type DocsPageReference = {
  description?: null | string
  docsSet?: DocsRelationship<DocsSetReference> | null
  excerpt?: null | string
  href?: null | string
  id?: DocsRelationshipID
  label?: null | string
  navTitle?: null | string
  route?: null | string
  title?: null | string
  url?: null | string
}

export type DocsCTASkillOverride = {
  agent?: null | string
  description?: null | string
  label?: null | string
}

export type DocsCTAGradient = 'brand' | 'cyan' | 'emerald' | 'none' | 'violet'

export type DocsCTAVariant = 'full' | 'normal' | 'subtle'

export type DocsCTAProps = {
  actionType?: 'docsLink' | 'skills' | null
  background?: DocsBackgroundMediaInput | null
  className?: string
  containerClassName?: string
  description?: null | ReactNode
  docsLabel?: null | string
  docsSet?: DocsRelationship<DocsSetReference> | null
  gradient?: DocsCTAGradient | null
  heading?: null | string
  headingLevel?: 1 | 2 | 3 | 4
  overrideContent?: boolean | null
  skillOverrides?: DocsCTASkillOverride[] | null
  skills?: null | SkillCTAGroupInput
  variant?: DocsCTAVariant | null
} & DocsMarketingPayloadBlockProps

export type DocsAssetReference = {
  docsSet?: DocsRelationship<DocsSetReference> | null
  id?: DocsRelationshipID
  kind?: null | string
  route?: null | string
  sourcePath?: null | string
  sync?: {
    archived?: boolean | null
  } | null
}

export type DocsMediaReference = {
  alt?: null | string
  height?: null | number
  id?: DocsRelationshipID
  relationTo?: null | string
  url?: null | string
  width?: null | number
}

export type DocsWhereValue = boolean | null | number | string

export type DocsWhereCondition = {
  equals?: DocsWhereValue
  not_equals?: DocsWhereValue
}

export type DocsWhere = {
  [field: string]: DocsWhere[] | DocsWhereCondition
}

export type DocsActionVariant = 'ghost' | 'link' | 'outline' | 'primary' | 'secondary'
export type DocsCTAButtonTarget = 'custom' | 'set' | 'setPage'

export type DocsCTAButtonInput = {
  docsSet?: DocsRelationship<DocsSetReference> | null
  href?: null | string
  icon?: null | string
  label?: null | string
  newTab?: boolean | null
  page?: DocsRelationship<DocsPageReference> | null
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

export type DocsBackgroundPosition = 'bottom' | 'center' | 'left' | 'right' | 'top'

export type DocsBackgroundOverlayVariant = 'brand' | 'dark' | 'gradient' | 'light'

export type DocsBackgroundMediaInput = {
  advancedControls?: boolean | null
  backgroundImage?: DocsRelationship<DocsMediaReference> | null
  fit?: DocsBackgroundFit | null
  gradient?: 'brand' | 'none' | 'subtle' | null
  image?: DocsRelationship<DocsMediaReference> | null
  media?: DocsRelationship<DocsMediaReference> | null
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

export type SkillCTAType = string

export type SkillCTAItemInput = {
  agent?: null | string
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
  skillOverrides?: DocsCTASkillOverride[] | null
}

export type NormalizedSkillCTAItem = {
  agent: string
  description?: string
  href: string
  icon?: string
  label: string
  type?: SkillCTAType
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
  reference?: DocsRelationship<DocsPageReference> | null
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
export type DocsSetHeroType = 'docsSetFullWidth' | 'docsSetSideImage' | 'docsSetSideInfo'

export type DocsMarketingPayloadBlockProps = {
  blockName?: null | string
  blockType?: null | string
  collectionSlug?: null | string
  id?: null | number | string
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

export type DocsSetHeroProps = {
  background?: DocsBackgroundMediaInput | null
  badge?: null | string
  className?: string
  containerClassName?: string
  ctaButtons?: DocsCTAButtonInput[] | null
  description?: ReactNode
  docsLabel?: null | string
  docsSet?: DocsRelationship<DocsSetReference> | null
  eyebrow?: null | string
  heading?: null | string
  image?: DocsRelationship<DocsMediaReference> | null
  imagePosition?: 'left' | 'right' | null
  skills?: null | SkillCTAGroupInput
  theme?: DocsTheme | null
  type?: DocsSetHeroType | null
} & DocsMarketingPayloadBlockProps

export type SkillCTAGroupProps = {
  align?: 'center' | 'left' | 'right'
  className?: string
  skills?: null | SkillCTAGroupInput
}

export type SkillTabsProps = {
  align?: 'center' | 'left' | 'right'
  className?: string
  items?: NormalizedSkillCTAItem[] | null | SkillCTAItemInput[]
}
