import type { SkillCTAGroupProps } from '../../marketing/types.js'

import { normalizeSkills } from '../../utilities/index.js'
import { cx, TextContent } from '../docs/shared.js'
import { SkillTabs } from './SkillTabs.js'

const alignClasses = {
  center: {
    container: 'items-center text-center',
    description: 'mx-auto',
    grid: 'justify-center',
  },
  left: {
    container: 'items-start text-left',
    description: '',
    grid: '',
  },
}

export const SkillCTAGroup = ({
  align = 'left',
  className,
  skills: inputSkills,
}: SkillCTAGroupProps) => {
  const skills = normalizeSkills(inputSkills)

  if (!skills) {
    return null
  }

  const alignment = alignClasses[align]
  const heading = skills.heading ? (
    <h3 className="text-base font-semibold text-foreground">{skills.heading}</h3>
  ) : null
  const description = (
    <TextContent
      className={cx('mt-2 max-w-2xl text-sm leading-6 text-foreground/65', alignment.description)}
    >
      {skills.description}
    </TextContent>
  )

  if (skills.display === 'tabs') {
    return (
      <section
        className={cx('mt-8 flex flex-col', alignment.container, className)}
        data-payload-markdown-docs-skills="tabs"
      >
        {heading}
        {description}
        <SkillTabs align={align} className="mt-4" items={skills.items} />
      </section>
    )
  }

  if (skills.display === 'cards') {
    return (
      <section
        className={cx('mt-8 flex flex-col', alignment.container, className)}
        data-payload-markdown-docs-skills="cards"
      >
        {heading}
        {description}
        <div className={cx('mt-4 grid w-full max-w-2xl gap-3 sm:grid-cols-2', alignment.grid)}>
          {skills.items.map((item) => {
            const body = (
              <>
                <span className="font-semibold">{item.label}</span>
                {item.description ? (
                  <span className="mt-1 block text-sm leading-6 text-foreground/65">
                    {item.description}
                  </span>
                ) : null}
              </>
            )

            return item.href ? (
              <a
                className="flex min-h-28 flex-col justify-center rounded-lg border border-border bg-white/3 p-4 transition-colors hover:bg-white/6"
                href={item.href}
                key={`${item.type}-${item.label}`}
              >
                {body}
              </a>
            ) : (
              <div
                className="flex min-h-28 flex-col justify-center rounded-lg border border-border bg-white/3 p-4"
                key={`${item.type}-${item.label}`}
              >
                {body}
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <section
      className={cx('mt-8 flex flex-col', alignment.container, className)}
      data-payload-markdown-docs-skills="buttons"
    >
      {heading}
      {description}
      <div className={cx('mt-4 flex flex-wrap gap-2', align === 'center' ? 'justify-center' : '')}>
        {skills.items.map((item) =>
          item.href ? (
            <a
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white/4 px-4 py-2 text-center text-sm font-medium text-foreground transition-colors hover:bg-white/8"
              href={item.href}
              key={`${item.type}-${item.label}`}
            >
              {item.icon ? (
                <span aria-hidden="true" className="text-xs uppercase tracking-wide text-cyan-300">
                  {item.icon}
                </span>
              ) : null}
              {item.label}
            </a>
          ) : (
            <span
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white/3 px-4 py-2 text-center text-sm font-medium text-foreground/70"
              key={`${item.type}-${item.label}`}
            >
              {item.icon ? (
                <span aria-hidden="true" className="text-xs uppercase tracking-wide text-cyan-300">
                  {item.icon}
                </span>
              ) : null}
              {item.label}
            </span>
          ),
        )}
      </div>
    </section>
  )
}
