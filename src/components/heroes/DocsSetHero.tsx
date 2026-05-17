import type {
  DocsBackgroundMediaInput,
  DocsMediaReference,
  DocsRelationship,
  DocsSetHeroProps,
  DocsSetHeroType,
  DocsSetReference,
} from '../../marketing/types.js'

import { normalizeCTAButtons, normalizeMedia } from '../../utilities/index.js'
import {
  getDocsRelationshipRecord,
  getDocsSetDescription,
  getDocsSetTitle,
} from '../../utilities/normalizeShared.js'
import {
  ActionGroup,
  BackgroundLayer,
  cx,
  getFallbackAction,
  Heading,
  resolveOptionalText,
  resolveRequiredHeading,
  TextContent,
  themeClasses,
} from '../docs/shared.js'
import { SkillCTAGroup } from '../skills/SkillCTAGroup.js'

const docsSetHeroTypes = new Set(['docsSetFullWidth', 'docsSetSideImage'])

export const isDocsSetHeroType = (value: unknown): value is DocsSetHeroType =>
  typeof value === 'string' && docsSetHeroTypes.has(value)

const getDocsSetImage = (
  docsSet: DocsRelationship<DocsSetReference> | null | undefined,
): DocsRelationship<DocsMediaReference> | null | undefined => {
  const record = getDocsRelationshipRecord(docsSet)

  return record?.meta?.image
}

const withFallbackBackground = ({
  background,
  fallbackImage,
}: {
  background?: DocsBackgroundMediaInput | null
  fallbackImage?: DocsRelationship<DocsMediaReference> | null
}): DocsBackgroundMediaInput | null | undefined => {
  if (background?.media || background?.image || background?.backgroundImage || !fallbackImage) {
    return background
  }

  return {
    fit: 'cover',
    gradient: 'none',
    media: fallbackImage,
    overlay: true,
    overlayOpacity: 52,
    overlayVariant: 'dark',
    position: 'center',
  }
}

const DocsSetHeroContent = ({
  align = 'left',
  badge,
  ctaButtons,
  description,
  docsLabel,
  docsSet,
  eyebrow,
  heading,
  skills,
}: {
  align?: 'center' | 'left'
} & Pick<
  DocsSetHeroProps,
  | 'badge'
  | 'ctaButtons'
  | 'description'
  | 'docsLabel'
  | 'docsSet'
  | 'eyebrow'
  | 'heading'
  | 'skills'
>) => {
  const resolvedHeading = resolveRequiredHeading({
    blockType: 'docsSetHero',
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
    }),
    {
      docsSet,
    },
  )
  const centered = align === 'center'

  return (
    <div className={cx(centered ? 'mx-auto max-w-4xl text-center' : 'max-w-3xl')}>
      {eyebrow ? (
        <p className="mb-3 text-sm font-medium uppercase tracking-wide text-cyan-300">{eyebrow}</p>
      ) : null}
      {badge ? (
        <span className="mb-5 inline-flex rounded-full border border-cyan-300/25 px-3 py-1 text-xs font-medium text-cyan-200">
          {badge}
        </span>
      ) : null}
      <Heading
        className="text-4xl font-semibold tracking-tight text-foreground md:text-6xl"
        level={1}
      >
        {resolvedHeading}
      </Heading>
      <TextContent className="mt-5 text-base leading-7 text-foreground/74 md:text-lg md:leading-8">
        {resolvedDescription}
      </TextContent>
      <ActionGroup actions={actions} className={cx('mt-8', centered ? 'justify-center' : '')} />
      <SkillCTAGroup align={align} skills={skills} />
    </div>
  )
}

const DocsSetFullWidthHero = (props: DocsSetHeroProps) => {
  const {
    background,
    className,
    containerClassName,
    docsSet,
    theme = 'dark',
  } = props
  const resolvedBackground = withFallbackBackground({
    background,
    fallbackImage: getDocsSetImage(docsSet),
  })
  const resolvedTheme = theme ?? 'dark'

  return (
    <section
      className={cx(
        'relative isolate flex min-h-[32rem] items-end overflow-hidden py-16 md:min-h-[40rem] md:py-20',
        themeClasses[resolvedTheme],
        className,
      )}
      data-payload-markdown-docs-hero="docsSetFullWidth"
    >
      <BackgroundLayer background={resolvedBackground} />
      <div className={cx('relative mx-auto w-full max-w-7xl px-6 lg:px-8', containerClassName)}>
        <DocsSetHeroContent {...props} align="center" />
      </div>
    </section>
  )
}

const DocsSetSideImageHero = (props: DocsSetHeroProps) => {
  const {
    className,
    containerClassName,
    docsSet,
    image,
    imagePosition = 'right',
    theme = 'default',
  } = props
  const media = normalizeMedia(image ?? getDocsSetImage(docsSet))
  const resolvedImagePosition = imagePosition ?? 'right'
  const resolvedTheme = theme ?? 'default'
  const imageNode = media ? (
    <div className="relative min-h-72 overflow-hidden rounded-lg border border-border bg-white/[0.04] shadow-2xl shadow-slate-950/20 md:min-h-[28rem]">
      <img
        alt={media.alt ?? ''}
        className="absolute inset-0 h-full w-full object-cover"
        height={media.height}
        src={media.url}
        width={media.width}
      />
    </div>
  ) : null

  return (
    <section
      className={cx('relative overflow-hidden py-16 md:py-24', themeClasses[resolvedTheme], className)}
      data-payload-markdown-docs-hero="docsSetSideImage"
    >
      <div
        className={cx(
          'mx-auto grid w-full max-w-7xl gap-10 px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(20rem,1.05fr)] lg:items-center lg:px-8',
          containerClassName,
        )}
      >
        {resolvedImagePosition === 'left' ? imageNode : null}
        <DocsSetHeroContent {...props} align="left" />
        {resolvedImagePosition === 'right' ? imageNode : null}
      </div>
    </section>
  )
}

export const DocsSetHero = (props: DocsSetHeroProps) => {
  if (props.type === 'docsSetFullWidth') {
    return <DocsSetFullWidthHero {...props} />
  }

  if (props.type === 'docsSetSideImage') {
    return <DocsSetSideImageHero {...props} />
  }

  return null
}
