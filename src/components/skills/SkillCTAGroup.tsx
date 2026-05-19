import type { SkillCTAGroupProps } from '../../marketing/types.js'

import { normalizeSkills } from '../../utilities/index.js'
import { cx, TextContent } from '../docs/shared.js'
import { SkillTabs } from './SkillTabs.js'

const alignClasses = {
  center: {
    container: 'items-center text-center',
    description: 'mx-auto',
    grid: 'mx-auto justify-center',
    list: 'mx-auto justify-center',
  },
  left: {
    container: 'items-start text-left',
    description: '',
    grid: '',
    list: 'justify-start',
  },
  right: {
    container: 'items-end text-right',
    description: '',
    grid: 'ml-auto justify-end',
    list: 'ml-auto justify-end',
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
    <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">
      {skills.heading}
    </h3>
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
        <div className={cx('mt-4 grid w-full max-w-3xl gap-3 sm:grid-cols-2', alignment.grid)}>
          {skills.items.map((item) => {
            const body = (
              <>
                <span className="font-semibold text-foreground">{item.label}</span>
                {item.description ? (
                  <span className="mt-1 block text-sm leading-6 text-foreground/65">
                    {item.description}
                  </span>
                ) : null}
              </>
            )

            return item.href ? (
              <a
                className="flex min-h-28 flex-col justify-center rounded-lg border border-border bg-white/[0.04] p-4 shadow-sm shadow-slate-950/5 transition-colors hover:bg-white/[0.08]"
                href={item.href}
                key={`${item.agent}-${item.label}`}
              >
                {body}
              </a>
            ) : (
              <div
                className="flex min-h-28 flex-col justify-center rounded-lg border border-border bg-white/[0.04] p-4"
                key={`${item.agent}-${item.label}`}
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
      <div
        className={cx('mt-4 flex w-full max-w-3xl flex-wrap items-center gap-2', alignment.list)}
      >
        {skills.items.map((item) =>
          item.href ? (
            <a
              className="inline-flex min-h-11 min-w-0 max-w-full basis-full items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.05] px-4 py-2.5 text-center text-sm font-semibold text-foreground shadow-sm shadow-slate-950/5 transition-colors hover:bg-white/[0.1] sm:basis-auto"
              href={item.href}
              key={`${item.agent}-${item.label}`}
            >
              {item.icon ? (
                <span aria-hidden="true" className="text-xs uppercase tracking-wide text-cyan-300">
                  {item.icon}
                </span>
              ) : null}
              <span className="min-w-0 break-words">{item.label}</span>
            </a>
          ) : (
            <span
              className="inline-flex min-h-11 min-w-0 max-w-full basis-full items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.04] px-4 py-2.5 text-center text-sm font-semibold text-foreground/70 sm:basis-auto"
              key={`${item.agent}-${item.label}`}
            >
              {item.icon ? (
                <span aria-hidden="true" className="text-xs uppercase tracking-wide text-cyan-300">
                  {item.icon}
                </span>
              ) : null}
              <span className="min-w-0 break-words">{item.label}</span>
            </span>
          ),
        )}
      </div>
    </section>
  )
}
