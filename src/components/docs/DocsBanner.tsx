import type { DocsBannerProps } from '../../marketing/types.js'

import { normalizeCTAButtons } from '../../utilities/index.js'
import { getDocsSetDescription, getDocsSetTitle } from '../../utilities/normalizeShared.js'
import { SkillCTAGroup } from '../skills/SkillCTAGroup.js'
import {
  ActionGroup,
  cx,
  DecorativeBackgroundLayer,
  Heading,
  resolveOptionalText,
  resolveRequiredHeading,
  TextContent,
  themeClasses,
} from './shared.js'

const sizeClasses = {
  lg: 'min-h-[30rem] py-20 md:py-24',
  md: 'min-h-[24rem] py-16 md:py-20',
  sm: 'min-h-[18rem] py-12 md:py-16',
  xl: 'min-h-[36rem] py-24 md:py-28',
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
        'relative isolate overflow-visible',
        sizeClasses[resolvedSize],
        themeClasses[resolvedTheme],
        className,
      )}
      data-payload-markdown-docs-block="docsBanner"
    >
      <DecorativeBackgroundLayer background={background}>
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(8,145,178,0.14),transparent_46%,rgba(16,185,129,0.09))]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/25 to-transparent" />
      </DecorativeBackgroundLayer>
      <div
        className={cx(
          'relative z-10 mx-auto flex w-full max-w-6xl flex-col px-6 lg:px-8',
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
        <SkillCTAGroup
          align={
            resolvedAlign === 'center' ? 'center' : resolvedAlign === 'right' ? 'right' : 'left'
          }
          skills={skills}
        />
      </div>
    </section>
  )
}
