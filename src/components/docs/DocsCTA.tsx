import type { DocsCTAProps } from '../../marketing/types.js'

import { normalizeCTAButtons } from '../../utilities/index.js'
import { getDocsSetDescription, getDocsSetTitle, getText } from '../../utilities/normalizeShared.js'
import { SkillCTAGroup } from '../skills/SkillCTAGroup.js'
import {
  ActionGroup,
  cx,
  DecorativeBackgroundLayer,
  getFallbackAction,
  Heading,
  normalizeBadges,
  resolveOptionalText,
  resolveRequiredHeading,
  TextContent,
  themeClasses,
} from './shared.js'

export const DocsCTA = (props: DocsCTAProps) => {
  const {
    background,
    badges: inputBadges,
    className,
    containerClassName,
    ctaButtons,
    description,
    docsLabel,
    docsSet,
    eyebrow,
    heading,
    headingLevel = 2,
    layout = 'centered',
    skills,
    theme = 'default',
  } = props
  const legacyProps = props as { docsUrl?: null | string } & DocsCTAProps
  const legacyDocsUrl = getText(legacyProps.docsUrl)
  const resolvedHeading = resolveRequiredHeading({
    blockType: 'docsCTA',
    fallbackLabel: 'selected docs set',
    fallbackTitle: getDocsSetTitle(docsSet),
    value: heading,
  })
  const resolvedDescription = resolveOptionalText(description, getDocsSetDescription(docsSet))
  const actions = normalizeCTAButtons(
    ctaButtons,
    getFallbackAction({
      docsLabel,
      docsSet,
      docsUrl: legacyDocsUrl,
    }),
    {
      docsSet,
    },
  )
  const badges = normalizeBadges(inputBadges)
  const resolvedTheme = theme ?? 'default'
  const centered = layout === 'centered' || layout === 'card'

  return (
    <section
      className={cx(
        'relative isolate overflow-visible py-16 md:py-20',
        themeClasses[resolvedTheme],
        layout === 'card'
          ? 'rounded-2xl border border-border shadow-xl shadow-slate-950/5'
          : undefined,
        className,
      )}
      data-payload-markdown-docs-block="docsCTA"
    >
      <DecorativeBackgroundLayer background={background}>
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(8,145,178,0.1),transparent_42%,rgba(16,185,129,0.08))]" />
      </DecorativeBackgroundLayer>
      <div
        className={cx(
          'relative z-10 mx-auto w-full max-w-6xl px-6 lg:px-8',
          layout === 'inline'
            ? 'flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between'
            : 'grid gap-8',
          layout === 'split'
            ? 'lg:grid-cols-[minmax(0,1fr)_minmax(16rem,auto)] lg:items-center'
            : undefined,
          centered ? 'text-center' : undefined,
          containerClassName,
        )}
      >
        <div className={cx(centered ? 'mx-auto max-w-3xl' : 'max-w-3xl')}>
          {eyebrow ? (
            <p className="mb-3 text-sm font-medium uppercase tracking-wide text-cyan-300">
              {eyebrow}
            </p>
          ) : null}
          {badges.length > 0 ? (
            <div className={cx('mb-4 flex flex-wrap gap-2', centered ? 'justify-center' : '')}>
              {badges.map((badge) => (
                <span
                  className="rounded-full border border-cyan-300/25 px-3 py-1 text-xs font-medium text-cyan-200"
                  key={badge}
                >
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
          <Heading
            className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
            level={headingLevel}
          >
            {resolvedHeading}
          </Heading>
          <TextContent className="mt-4 text-base leading-7 text-foreground/70 md:text-lg">
            {resolvedDescription}
          </TextContent>
        </div>
        <ActionGroup
          actions={actions}
          className={cx(
            centered ? 'justify-center' : undefined,
            layout === 'split' ? 'lg:justify-end' : undefined,
          )}
        />
        <SkillCTAGroup
          align={centered ? 'center' : 'left'}
          className={cx(layout === 'inline' ? 'w-full lg:basis-full' : undefined)}
          skills={skills}
        />
      </div>
    </section>
  )
}
