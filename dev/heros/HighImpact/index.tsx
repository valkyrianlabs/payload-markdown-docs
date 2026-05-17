import React from 'react'

import type { DevHeroProps } from '../RenderHero'

export const HighImpactHero: React.FC<DevHeroProps> = ({ description, heading, media }) => (
  <section className="relative isolate overflow-hidden bg-slate-950 px-6 py-24 text-white">
    {media?.url ? (
      <img
        alt={media.alt ?? ''}
        className="absolute inset-0 h-full w-full object-cover opacity-45"
        src={media.url}
      />
    ) : null}
    <div className="relative mx-auto max-w-6xl">
      <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">Local hero</p>
      <h1 className="mt-3 max-w-4xl text-5xl font-semibold tracking-tight">
        {heading ?? 'High impact hero'}
      </h1>
      {description ? <p className="mt-5 max-w-2xl text-lg text-white/72">{description}</p> : null}
    </div>
  </section>
)
