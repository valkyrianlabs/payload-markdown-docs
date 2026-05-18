import type { SkillTabsProps } from '../../marketing/types.js'

import { normalizeSkillItems } from '../../utilities/index.js'
import { cx } from '../docs/shared.js'

export const SkillTabs = ({ align = 'left', className, items: inputItems }: SkillTabsProps) => {
  const items = normalizeSkillItems(inputItems)

  if (items.length === 0) {
    return null
  }

  return (
    <div
      className={cx(
        'flex w-full max-w-3xl flex-wrap items-center gap-1 rounded-xl border border-border bg-white/[0.04] p-1 shadow-sm shadow-slate-950/5 sm:w-auto',
        align === 'center' ? 'mx-auto justify-center' : undefined,
        align === 'left' ? 'justify-start' : undefined,
        align === 'right' ? 'ml-auto justify-end' : undefined,
        className,
      )}
    >
      {items.map((item) => {
        const content = (
          <>
            <span className="inline-flex min-w-0 items-center justify-center gap-2 text-sm font-semibold text-foreground">
              {item.icon ? (
                <span aria-hidden="true" className="text-xs uppercase tracking-wide text-cyan-300">
                  {item.icon}
                </span>
              ) : null}
              <span className="min-w-0 break-words">{item.label}</span>
            </span>
            {item.description ? (
              <span className="block text-xs leading-5 text-foreground/60">{item.description}</span>
            ) : null}
          </>
        )

        return item.href ? (
          <a
            className="inline-flex min-h-11 min-w-0 max-w-full basis-full flex-col items-center justify-center rounded-lg px-4 py-2.5 text-center transition-colors hover:bg-white/[0.08] sm:basis-40"
            href={item.href}
            key={`${item.type}-${item.label}`}
          >
            {content}
          </a>
        ) : (
          <div
            className="inline-flex min-h-11 min-w-0 max-w-full basis-full flex-col items-center justify-center rounded-lg px-4 py-2.5 text-center sm:basis-40"
            key={`${item.type}-${item.label}`}
          >
            {content}
          </div>
        )
      })}
    </div>
  )
}
