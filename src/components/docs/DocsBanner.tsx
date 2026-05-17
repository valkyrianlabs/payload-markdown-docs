import type { DocsBannerProps } from '../../marketing/types.js'

import { normalizeCTAButtons } from '../../utilities/index.js'
import { getDocsSetDescription, getDocsSetTitle } from '../../utilities/normalizeShared.js'
import { SkillCTAGroup } from '../skills/SkillCTAGroup.js'
import {
  ActionGroup,
  BackgroundLayer,
  cx,
  Heading,
  resolveOptionalText,
  resolveRequiredHeading,
  TextContent,
  themeClasses,
} from './shared.js'

const sizeClasses = {
  lg: 'min-h-[28rem] py-20',
  md: 'min-h-[22rem] py-16',
  sm: 'min-h-[16rem] py-12',
  xl: 'min-h-[34rem] py-24',
}

const alignClasses = {
  center: 'items-center text-center',
  left: 'items-start text-left',
  right: 'items-end text-right',
}

export const DocsBanner = ({
  background,
  badge,
  className,
  containerClassName,
  ctaButtons,
  description,
  docsSet,
  eyebrow,
  heading,
  headingLevel = 2,
  size = 'md',
  skills,
  textAlign = 'center',
  theme = 'dark',
}: DocsBannerProps) => {
  const resolvedHeading = resolveRequiredHeading({
    blockType: 'docsBanner',
    fallbackLabel: 'selected docs set',
    fallbackTitle: getDocsSetTitle(docsSet),
    value: heading,
  })
  const resolvedDescription = resolveOptionalText(description, getDocsSetDescription(docsSet))
  const actions = normalizeCTAButtons(ctaButtons, undefined, {
    docsSet,
  })
  const resolvedSize = size ?? 'md'
  const resolvedAlign = textAlign ?? 'center'
  const resolvedTheme = theme ?? 'dark'

  return (
    <section
      className={cx(
        'relative isolate overflow-hidden',
        sizeClasses[resolvedSize],
        themeClasses[resolvedTheme],
        className,
      )}
      data-payload-markdown-docs-block="docsBanner"
    >
      <BackgroundLayer background={background} />
      <div
        className={cx(
          'relative mx-auto flex w-full max-w-6xl flex-col px-6 lg:px-8',
          alignClasses[resolvedAlign],
          containerClassName,
        )}
      >
        {eyebrow ? (
          <p className="mb-3 text-sm font-medium uppercase tracking-wide text-cyan-300">
            {eyebrow}
          </p>
        ) : null}
        {badge ? (
          <span className="mb-4 inline-flex rounded-full border border-cyan-300/25 px-3 py-1 text-xs font-medium text-cyan-200">
            {badge}
          </span>
        ) : null}
        <Heading
          className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground md:text-5xl"
          level={headingLevel}
        >
          {resolvedHeading}
        </Heading>
        <TextContent className="mt-4 max-w-2xl text-base leading-7 text-foreground/75 md:text-lg">
          {resolvedDescription}
        </TextContent>
        <ActionGroup
          actions={actions}
          className={cx(
            'mt-8',
            resolvedAlign === 'center' ? 'justify-center' : undefined,
            resolvedAlign === 'right' ? 'justify-end' : undefined,
          )}
        />
        <SkillCTAGroup skills={skills} />
      </div>
    </section>
  )
}
