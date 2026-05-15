import type { ReactNode } from 'react'

import { cx, TextContent } from './shared.js'

export type DocsCalloutCardProps = {
  ctaLabel?: null | string
  description?: ReactNode
  heading?: null | string
  href?: null | string
  icon?: null | string
  layout?: 'card' | 'fullWidth' | 'inline' | 'sidebar' | null
  variant?: 'brand' | 'info' | 'neutral' | 'success' | 'warning' | null
}

const variantClasses = {
  brand: 'border-cyan-300/25 bg-cyan-300/10 text-foreground',
  info: 'border-sky-300/25 bg-sky-300/10 text-foreground',
  neutral: 'border-border bg-white/[0.03] text-foreground',
  success: 'border-emerald-300/25 bg-emerald-300/10 text-foreground',
  warning: 'border-amber-300/25 bg-amber-300/10 text-foreground',
}

export const DocsCalloutCard = ({
  ctaLabel,
  description,
  heading,
  href,
  icon,
  layout = 'card',
  variant = 'info',
}: DocsCalloutCardProps) => {
  const content = (
    <>
      <div className="flex items-start gap-3">
        {icon ? (
          <span
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-xs font-semibold uppercase tracking-wide text-cyan-300"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          {heading ? <h3 className="text-base font-semibold text-foreground">{heading}</h3> : null}
          <TextContent className="mt-2 text-sm leading-6 text-foreground/70">
            {description}
          </TextContent>
          {href && ctaLabel ? (
            <span className="mt-4 inline-flex text-sm font-medium text-cyan-300">{ctaLabel}</span>
          ) : null}
        </div>
      </div>
    </>
  )

  const className = cx(
    'rounded-lg border p-5',
    variantClasses[variant ?? 'info'],
    layout === 'fullWidth' ? 'w-full' : undefined,
    layout === 'inline' ? 'p-4' : undefined,
    layout === 'sidebar' ? 'text-sm' : undefined,
    href ? 'block transition-colors hover:bg-white/[0.06]' : undefined,
  )

  return href ? (
    <a className={className} href={href}>
      {content}
    </a>
  ) : (
    <aside className={className}>{content}</aside>
  )
}
