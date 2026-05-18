import React from 'react'

import type { PageHero } from '../RenderHero'

export const MediumImpactHero: React.FC<PageHero> = ({ description, heading, media }) => {
  const image = typeof media === 'object' ? media : null

  return (
    <section className="px-6 py-20 md:py-24">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-2 md:items-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">Local hero</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {heading ?? 'Medium impact hero'}
          </h1>
          {description ? <p className="mt-5 text-lg text-foreground/70">{description}</p> : null}
        </div>
        {image?.url ? (
          <img
            alt={image.filename ?? ''}
            className="aspect-[4/3] w-full rounded-xl border border-border object-cover shadow-2xl shadow-slate-950/10"
            src={image.url}
          />
        ) : null}
      </div>
    </section>
  )
}
