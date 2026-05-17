import React from 'react'

import type { DevHeroProps } from '../RenderHero'

export const HighImpactCardHero: React.FC<DevHeroProps> = ({ description, heading, media }) => (
  <section className="px-6 py-20">
    <div className="relative mx-auto min-h-96 max-w-6xl overflow-hidden rounded-lg border border-border bg-slate-950 p-8 text-white">
      {media?.url ? (
        <img
          alt={media.alt ?? ''}
          className="absolute inset-0 h-full w-full object-cover opacity-40"
          src={media.url}
        />
      ) : null}
      <div className="relative max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">Local hero</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          {heading ?? 'High impact card hero'}
        </h1>
        {description ? <p className="mt-5 text-lg text-white/72">{description}</p> : null}
      </div>
    </div>
  </section>
)
