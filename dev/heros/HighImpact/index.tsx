import React from 'react'

import type { PageHero } from '../RenderHero'

export const HighImpactHero: React.FC<PageHero> = ({ description, heading, media }) => {
  const image = typeof media === 'object' ? media : null

  return (
    <section className="relative isolate min-h-[35rem] overflow-visible bg-slate-950 px-6 pb-20 pt-32 text-white md:min-h-[40rem] md:pt-36">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {image?.url ? (
          <img
            alt={image.filename ?? ''}
            className="absolute inset-0 h-full w-full object-cover opacity-45"
            src={image.url}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-950/50 via-slate-950/20 to-emerald-950/35" />
      </div>
      <div className="relative z-10 mx-auto max-w-6xl">
        <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">Local hero</p>
        <h1 className="mt-3 max-w-4xl text-5xl font-semibold tracking-tight">
          {heading ?? 'High impact hero'}
        </h1>
        {description ? <p className="mt-5 max-w-2xl text-lg text-white/72">{description}</p> : null}
      </div>
    </section>
  )
}
