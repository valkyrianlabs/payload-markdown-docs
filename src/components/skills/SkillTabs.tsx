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
        'inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-white/[0.03] p-1',
        align === 'center' ? 'justify-center' : '',
        className,
      )}
    >
      {items.map((item) => {
        const content = (
          <>
            <span className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
              {item.icon ? (
                <span aria-hidden="true" className="text-xs uppercase tracking-wide text-cyan-300">
                  {item.icon}
                </span>
              ) : null}
              {item.label}
            </span>
            {item.description ? (
              <span className="block text-xs leading-5 text-foreground/60">
                {item.description}
              </span>
            ) : null}
          </>
        )

        return item.href ? (
          <a
            className="inline-flex min-h-11 min-w-28 flex-col items-center justify-center rounded-lg px-4 py-2 text-center transition-colors hover:bg-white/[0.06]"
            href={item.href}
            key={`${item.type}-${item.label}`}
          >
            {content}
          </a>
        ) : (
          <div
            className="inline-flex min-h-11 min-w-28 flex-col items-center justify-center rounded-lg px-4 py-2 text-center"
            key={`${item.type}-${item.label}`}
          >
            {content}
          </div>
        )
      })}
    </div>
  )
}
