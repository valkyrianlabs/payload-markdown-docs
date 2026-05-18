import React from 'react'

import type { PageHero } from '../RenderHero'

export const HighImpactCardHero: React.FC<PageHero> = ({ description, heading, media }) => {
  const image = typeof media === 'object' ? media : null

  return (
    <section className="px-6 py-20 md:py-24">
      <div className="relative mx-auto min-h-[32rem] max-w-6xl overflow-hidden rounded-2xl border border-border bg-slate-950 p-8 text-white shadow-2xl shadow-slate-950/20 md:p-12">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          {image?.url ? (
            <img
              alt={image.filename ?? ''}
              className="absolute inset-0 h-full w-full object-cover opacity-40"
              src={image.url}
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-950/70 to-cyan-950/40" />
        </div>
        <div className="relative z-10 max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">Local hero</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-6xl">
            {heading ?? 'High impact card hero'}
          </h1>
          {description ? (
            <p className="mt-5 max-w-2xl text-lg text-white/72">{description}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
