import type { SkillTabsProps } from '../../marketing/types.js'

import { normalizeSkillItems } from '../../utilities/normalizeSkills.js'
import { cx } from '../docs/shared.js'

export const SkillTabs = ({ className, items: inputItems }: SkillTabsProps) => {
  const items = normalizeSkillItems(inputItems)

  if (items.length === 0) {
    return null
  }

  return (
    <div className={cx('grid gap-3 sm:grid-cols-2', className)}>
      {items.map((item) => {
        const content = (
          <>
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {item.icon ? (
                <span aria-hidden="true" className="text-xs uppercase tracking-wide text-cyan-300">
                  {item.icon}
                </span>
              ) : null}
              {item.label}
            </span>
            {item.description ? (
              <span className="mt-1 block text-sm leading-6 text-foreground/65">
                {item.description}
              </span>
            ) : null}
            {item.href ? (
              <span className="mt-3 inline-flex text-sm font-medium text-cyan-300">
                {item.downloadLabel ?? 'Download'}
              </span>
            ) : null}
          </>
        )

        return item.href ? (
          <a
            className="rounded-lg border border-border bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.06]"
            href={item.href}
            key={`${item.type}-${item.label}`}
          >
            {content}
          </a>
        ) : (
          <div
            className="rounded-lg border border-border bg-white/[0.03] p-4"
            key={`${item.type}-${item.label}`}
          >
            {content}
          </div>
        )
      })}
    </div>
  )
}
