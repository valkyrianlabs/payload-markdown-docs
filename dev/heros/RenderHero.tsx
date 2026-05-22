import React from 'react'

import type { Page } from '../payload-types'

import { docsHeroComponents } from '../../dist/next'
import { HighImpactHero } from './HighImpact'
import { HighImpactCardHero } from './HighImpactCard'
import { LowImpactHero } from './LowImpact'
import { MediumImpactHero } from './MediumImpact'

export type PageHero = NonNullable<Page['hero']>

const heroes: Record<string, React.FC<PageHero>> = {
  ...docsHeroComponents,
  highImpact: HighImpactHero,
  highImpactCard: HighImpactCardHero,
  lowImpact: LowImpactHero,
  mediumImpact: MediumImpactHero,
}

export const RenderHero: React.FC<PageHero> = (props) => {
  const { type } = props || {}

  if (!type || type === 'none') {
    return null
  }

  const HeroToRender = heroes[type]

  if (!HeroToRender) {
    return null
  }

  return <HeroToRender {...props} />
}
