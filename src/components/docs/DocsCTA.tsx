import type { DocsCTAProps } from '../../marketing/types.js'

import { normalizeCTAButtons } from '../../utilities/index.js'
import { getRouteLikeDescription, getString } from '../../utilities/normalizeShared.js'
import { SkillCTAGroup } from '../skills/SkillCTAGroup.js'
import {
  ActionGroup,
  BackgroundLayer,
  cx,
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
  const legacyDocsUrl = getString((props as Record<string, unknown>).docsUrl)
  const resolvedHeading = resolveRequiredHeading({
    blockType: 'docsCTA',
    fallback: docsSet,
    fallbackLabel: 'selected docs set',
    value: heading,
  })
  const resolvedDescription = resolveOptionalText(description, getRouteLikeDescription(docsSet))
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
        'relative overflow-hidden py-14',
        themeClasses[resolvedTheme],
        layout === 'card' ? 'rounded-xl border border-border' : undefined,
        className,
      )}
      data-payload-markdown-docs-block="docsCTA"
    >
      <BackgroundLayer background={background} />
      <div
        className={cx(
          'relative mx-auto w-full max-w-6xl px-6 lg:px-8',
          layout === 'inline'
            ? 'flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between'
            : 'grid gap-8',
          layout === 'split' ? 'lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center' : undefined,
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
        <ActionGroup actions={actions} className={centered ? 'justify-center' : undefined} />
        <SkillCTAGroup
          className={cx(layout === 'inline' ? 'lg:col-span-2' : undefined)}
          skills={skills}
        />
      </div>
    </section>
  )
}
