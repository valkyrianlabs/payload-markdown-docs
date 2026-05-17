import React from 'react'

import { DocsSetHero, isDocsSetHeroType } from '../../dist/next'
import { HighImpactHero } from './HighImpact'
import { HighImpactCardHero } from './HighImpactCard'
import { LowImpactHero } from './LowImpact'
import { MediumImpactHero } from './MediumImpact'

export type DevHeroProps = {
  description?: null | string
  heading?: null | string
  media?: {
    alt?: null | string
    url?: null | string
  } | null
  type?: null | string
} & Record<string, unknown>

const heroes: Record<string, React.FC<DevHeroProps>> = {
  highImpact: HighImpactHero,
  highImpactCard: HighImpactCardHero,
  lowImpact: LowImpactHero,
  mediumImpact: MediumImpactHero,
}

export const RenderHero: React.FC<DevHeroProps> = (props) => {
  const { type } = props || {}

  if (!type || type === 'none') {
    return null
  }

  if (isDocsSetHeroType(type)) {
    return <DocsSetHero {...props} />
  }

  const HeroToRender = heroes[type]

  return HeroToRender ? <HeroToRender {...props} /> : null
}
