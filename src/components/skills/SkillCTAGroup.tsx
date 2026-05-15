import type { SkillCTAGroupProps } from '../../marketing/types.js'

import { normalizeSkills } from '../../utilities/normalizeSkills.js'
import { cx, TextContent } from '../docs/shared.js'
import { SkillTabs } from './SkillTabs.js'

export const SkillCTAGroup = ({ className, skills: inputSkills }: SkillCTAGroupProps) => {
  const skills = normalizeSkills(inputSkills)

  if (!skills) {
    return null
  }

  if (skills.display === 'tabs') {
    return (
      <section className={cx('mt-8', className)} data-payload-markdown-docs-skills="tabs">
        {skills.heading ? (
          <h3 className="text-base font-semibold text-foreground">{skills.heading}</h3>
        ) : null}
        <TextContent className="mt-2 max-w-2xl text-sm leading-6 text-foreground/65">
          {skills.description}
        </TextContent>
        <SkillTabs className="mt-4" items={skills.items} />
      </section>
    )
  }

  if (skills.display === 'cards') {
    return (
      <section className={cx('mt-8', className)} data-payload-markdown-docs-skills="cards">
        {skills.heading ? (
          <h3 className="text-base font-semibold text-foreground">{skills.heading}</h3>
        ) : null}
        <TextContent className="mt-2 max-w-2xl text-sm leading-6 text-foreground/65">
          {skills.description}
        </TextContent>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                className="rounded-lg border border-border bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.06]"
                href={item.href}
                key={`${item.type}-${item.label}`}
              >
                {body}
              </a>
            ) : (
              <div
                className="rounded-lg border border-border bg-white/[0.03] p-4"
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
    <section className={cx('mt-8', className)} data-payload-markdown-docs-skills="buttons">
      {skills.heading ? (
        <h3 className="text-base font-semibold text-foreground">{skills.heading}</h3>
      ) : null}
      <TextContent className="mt-2 max-w-2xl text-sm leading-6 text-foreground/65">
        {skills.description}
      </TextContent>
      <div className="mt-4 flex flex-wrap gap-3">
        {skills.items.map((item) =>
          item.href ? (
            <a
              className="inline-flex items-center rounded-lg border border-border bg-white/[0.04] px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-white/[0.08]"
              href={item.href}
              key={`${item.type}-${item.label}`}
            >
              {item.downloadLabel ?? item.label}
            </a>
          ) : (
            <span
              className="inline-flex items-center rounded-lg border border-border bg-white/[0.03] px-4 py-2 text-sm font-medium text-foreground/70"
              key={`${item.type}-${item.label}`}
            >
              {item.label}
            </span>
          ),
        )}
      </div>
    </section>
  )
}
