import React from 'react'

import type { PageHero } from '../RenderHero'

export const LowImpactHero: React.FC<PageHero> = ({ description, heading }) => (
  <section className="px-6 py-16 md:py-20">
    <div className="mx-auto max-w-5xl border-l border-cyan-300/45 pl-6">
      <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">Local hero</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{heading ?? 'Low impact hero'}</h1>
      {description ? (
        <p className="mt-4 max-w-2xl text-base text-foreground/70">{description}</p>
      ) : null}
    </div>
  </section>
)
