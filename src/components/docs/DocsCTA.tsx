import type {
  DocsCTAGradient,
  DocsCTAProps,
  DocsCTAVariant,
  NormalizedSkillCTAItem,
} from '../../marketing/types.js'

import { normalizeSkills } from '../../utilities/index.js'
import {
  getDocsSetDescription,
  getDocsSetTitle,
  getText,
  getTypedDocsSetDocsHref,
} from '../../utilities/normalizeShared.js'
import { ActionLink, cx, DecorativeBackgroundLayer, Heading, TextContent } from './shared.js'

type ResolvedDocsCTAVariant = Exclude<DocsCTAVariant, 'default'>

const normalizeVariant = (variant: DocsCTAProps['variant']): ResolvedDocsCTAVariant =>
  !variant || variant === 'default' ? 'normal' : variant

const normalizeGradient = (gradient: DocsCTAProps['gradient']): DocsCTAGradient =>
  gradient ?? 'brand'

const panelClasses: Record<ResolvedDocsCTAVariant, string> = {
  full: 'relative isolate w-full min-h-[150px] overflow-hidden rounded-3xl border border-border bg-slate-950 px-6 py-10 text-white shadow-lg shadow-slate-950/10 md:min-h-[180px] md:px-8 md:py-12',
  normal:
    'relative isolate w-full overflow-hidden rounded-2xl border border-cyan-500/25 bg-background p-6 shadow-sm shadow-cyan-950/5 md:p-8',
  subtle: 'relative w-full rounded-xl border border-border bg-muted/35 p-5 md:p-6',
}

const contentClasses: Record<ResolvedDocsCTAVariant, string> = {
  full: 'relative z-10 grid w-full gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center',
  normal: 'relative z-10 grid w-full gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center',
  subtle: 'relative z-10 grid w-full gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center',
}

const skillsContentClasses: Record<ResolvedDocsCTAVariant, string> = {
  full: 'relative z-10 grid w-full gap-6',
  normal: 'relative z-10 grid w-full gap-5',
  subtle: 'relative z-10 grid w-full gap-4',
}

const headingClasses: Record<ResolvedDocsCTAVariant, string> = {
  full: 'text-2xl font-semibold leading-tight text-white md:text-3xl',
  normal: 'text-xl font-semibold leading-tight text-foreground md:text-2xl',
  subtle: 'text-lg font-semibold leading-snug text-foreground',
}

const descriptionClasses: Record<ResolvedDocsCTAVariant, string> = {
  full: 'mt-2 text-sm leading-6 text-white/72 md:text-base md:leading-7',
  normal: 'mt-2 text-sm leading-6 text-foreground/72 md:text-base md:leading-7',
  subtle: 'mt-1 text-sm leading-6 text-foreground/70',
}

const skillsGridClasses: Record<ResolvedDocsCTAVariant, string> = {
  full: 'grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3',
  normal: 'grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-3',
  subtle: 'grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-3',
}

const skillLinkClasses: Record<ResolvedDocsCTAVariant, string> = {
  full:
    'rounded-lg border border-white/15 bg-white/[0.08] px-4 py-3 text-sm text-white shadow-sm shadow-slate-950/10 transition-colors hover:bg-white/[0.12]',
  normal:
    'rounded-lg border border-border bg-background/70 px-4 py-3 text-sm shadow-sm shadow-cyan-950/5 transition-colors hover:bg-background',
  subtle:
    'rounded-md border border-border bg-background/60 px-3 py-2 text-sm transition-colors hover:bg-background',
}

const skillDescriptionClasses: Record<ResolvedDocsCTAVariant, string> = {
  full: 'mt-1 block text-xs leading-5 text-white/68',
  normal: 'mt-1 block text-xs leading-5 text-foreground/65',
  subtle: 'mt-0.5 block text-xs leading-5 text-foreground/65',
}

const gradientClasses: Record<DocsCTAGradient, string | undefined> = {
  brand:
    'bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.24),transparent_36%),linear-gradient(135deg,rgba(14,165,233,0.12),rgba(16,185,129,0.1))]',
  cyan: 'bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.25),transparent_38%),linear-gradient(135deg,rgba(8,145,178,0.14),transparent)]',
  emerald:
    'bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.24),transparent_38%),linear-gradient(135deg,rgba(16,185,129,0.12),transparent)]',
  none: undefined,
  violet:
    'bg-[radial-gradient(circle_at_top_left,rgba(167,139,250,0.24),transparent_38%),linear-gradient(135deg,rgba(124,58,237,0.12),transparent)]',
}

const isProduction = (): boolean => process.env.NODE_ENV === 'production'

const GradientLayer = ({
  gradient,
}: {
  gradient: DocsCTAGradient
}) => {
  const gradientClass = gradientClasses[gradient]

  return gradientClass ? (
    <div aria-hidden="true" className={cx('pointer-events-none absolute inset-0 z-0', gradientClass)} />
  ) : null
}

const SkillActions = ({
  items,
  variant,
}: {
  items: NormalizedSkillCTAItem[]
  variant: ResolvedDocsCTAVariant
}) => (
  <div className={skillsGridClasses[variant]}>
    {items.map((skill) => (
      <a className={skillLinkClasses[variant]} href={skill.href} key={`${skill.agent}-${skill.href}`}>
        <span className="block font-medium">{skill.label}</span>
        {skill.description ? (
          <span className={skillDescriptionClasses[variant]}>{skill.description}</span>
        ) : null}
      </a>
    ))}
  </div>
)

export const DocsCTA = ({
  actionType = 'docsLink',
  background,
  className,
  containerClassName,
  description,
  docsLabel,
  docsSet,
  gradient,
  heading,
  headingLevel = 2,
  overrideContent,
  skills: inputSkills,
  title,
  variant,
}: DocsCTAProps) => {
  const resolvedVariant = normalizeVariant(variant)
  const resolvedGradient = normalizeGradient(gradient)
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
      className={cx('my-8 w-full', className)}
      data-payload-markdown-docs-block="docsCTA"
    >
      <div className={cx(panelClasses[resolvedVariant], containerClassName)}>
        {resolvedVariant === 'normal' ? <GradientLayer gradient={resolvedGradient} /> : null}
        {resolvedVariant === 'full' ? (
          <DecorativeBackgroundLayer background={background}>
            <GradientLayer gradient={resolvedGradient} />
          </DecorativeBackgroundLayer>
        ) : null}
        <div
          className={
            resolvedActionType === 'skills'
              ? skillsContentClasses[resolvedVariant]
              : contentClasses[resolvedVariant]
          }
        >
          <div className="min-w-0">
            <Heading className={headingClasses[resolvedVariant]} level={headingLevel}>
              {resolvedTitle}
            </Heading>
            <TextContent className={descriptionClasses[resolvedVariant]}>
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
              className="shrink-0 justify-self-start md:justify-self-end"
            />
          ) : null}
          {resolvedActionType === 'skills' && skills ? (
            <SkillActions items={skills.items} variant={resolvedVariant} />
          ) : null}
        </div>
      </div>
    </section>
  )
}
