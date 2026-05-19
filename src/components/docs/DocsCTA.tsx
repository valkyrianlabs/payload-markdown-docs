import type { DocsCTAProps } from '../../marketing/types.js'

import { normalizeSkills } from '../../utilities/index.js'
import {
  getDocsSetDescription,
  getDocsSetTitle,
  getText,
  getTypedDocsSetDocsHref,
} from '../../utilities/normalizeShared.js'
import { ActionLink, cx, Heading, TextContent } from './shared.js'

const variantClasses: Record<NonNullable<DocsCTAProps['variant']>, string> = {
  default: 'border-cyan-500/25 bg-cyan-500/[0.08]',
  subtle: 'border-border bg-muted/35',
}

const isProduction = (): boolean => process.env.NODE_ENV === 'production'

export const DocsCTA = ({
  actionType = 'docsLink',
  className,
  containerClassName,
  description,
  docsLabel,
  docsSet,
  heading,
  headingLevel = 2,
  overrideContent,
  skills: inputSkills,
  title,
  variant = 'default',
}: DocsCTAProps) => {
  const resolvedVariant = variant ?? 'default'
  const contentIsOverridden = overrideContent === true
  const resolvedTitle = contentIsOverridden
    ? getText(heading) ?? getText(title)
    : getDocsSetTitle(docsSet) ?? getText(heading) ?? getText(title)
  const resolvedDescription = contentIsOverridden
    ? description
    : (getDocsSetDescription(docsSet) ?? description)
  const resolvedActionType = actionType ?? 'docsLink'
  const docsHref = resolvedActionType === 'docsLink' ? getTypedDocsSetDocsHref(docsSet) : undefined
  const skills = resolvedActionType === 'skills' ? normalizeSkills(inputSkills) : undefined

  if (!resolvedTitle) {
    throw new Error(
      '[payload-markdown-docs] docsCTA requires a selected docs set with a title or a title override.',
    )
  }

  if (resolvedActionType === 'docsLink' && !docsHref && !isProduction()) {
    throw new Error(
      '[payload-markdown-docs] docsCTA docsLink action requires a selected docs set with a docs route.',
    )
  }

  return (
    <section
      className={cx('my-8', className)}
      data-payload-markdown-docs-block="docsCTA"
    >
      <div
        className={cx(
          'mx-auto grid w-full max-w-3xl gap-4 rounded-lg border p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center',
          variantClasses[resolvedVariant],
          containerClassName,
        )}
      >
        <div className="min-w-0">
          <Heading className="text-lg font-semibold leading-snug text-foreground" level={headingLevel}>
            {resolvedTitle}
          </Heading>
          <TextContent className="mt-1 text-sm leading-6 text-foreground/70">
            {resolvedDescription}
          </TextContent>
        </div>
        {resolvedActionType === 'docsLink' && docsHref ? (
          <ActionLink
            action={{
              href: docsHref,
              label: getText(docsLabel) ?? 'Read the docs',
              variant: 'primary',
            }}
            className="shrink-0"
          />
        ) : null}
        {resolvedActionType === 'skills' && skills ? (
          <div className="grid gap-2 md:min-w-56">
            {skills.items.map((skill) => (
              <a
                className="rounded-md border border-border bg-background/60 px-3 py-2 text-sm transition-colors hover:bg-background"
                href={skill.href}
                key={`${skill.agent}-${skill.href}`}
              >
                <span className="block font-medium text-foreground">{skill.label}</span>
                {skill.description ? (
                  <span className="mt-0.5 block text-xs leading-5 text-foreground/65">
                    {skill.description}
                  </span>
                ) : null}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
