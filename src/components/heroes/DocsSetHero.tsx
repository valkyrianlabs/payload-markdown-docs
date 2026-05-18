import type {
  DocsBackgroundMediaInput,
  DocsMediaReference,
  DocsRelationship,
  DocsSetHeroProps,
  DocsSetHeroType,
  DocsSetReference,
} from '../../marketing/types.js'

import { normalizeCTAButtons, normalizeMedia, normalizeSkills } from '../../utilities/index.js'
import {
  getDocsRelationshipRecord,
  getDocsSetDescription,
  getDocsSetTitle,
  getTypedDocsSetPublicHref,
} from '../../utilities/normalizeShared.js'
import {
  ActionGroup,
  cx,
  DecorativeBackgroundLayer,
  getFallbackAction,
  Heading,
  resolveOptionalText,
  resolveRequiredHeading,
  TextContent,
  themeClasses,
} from '../docs/shared.js'
import { SkillCTAGroup } from '../skills/SkillCTAGroup.js'

const docsSetHeroTypes = new Set(['docsSetFullWidth', 'docsSetSideImage', 'docsSetSideInfo'])

type DocsSetHeroComponentProps = {
  type?: null | string
} & Omit<DocsSetHeroProps, 'type'>

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
  const backgroundMedia = normalizeMedia(
    background?.media ?? background?.image ?? background?.backgroundImage,
  )

  if (backgroundMedia || !fallbackImage) {
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
  className,
  ctaButtons,
  description,
  docsLabel,
  docsSet,
  eyebrow,
  heading,
  renderSkills = true,
  skills,
}: {
  align?: 'center' | 'left'
  className?: string
  renderSkills?: boolean
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
    <div className={cx(centered ? 'mx-auto max-w-4xl text-center' : 'max-w-3xl', className)}>
      {eyebrow ? (
        <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-cyan-300">
          {eyebrow}
        </p>
      ) : null}
      {badge ? (
        <span className="mb-5 inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100 shadow-sm shadow-cyan-950/10">
          {badge}
        </span>
      ) : null}
      <Heading
        className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl"
        level={1}
      >
        {resolvedHeading}
      </Heading>
      <TextContent
        className={cx(
          'mt-6 text-base leading-7 text-foreground/76 md:text-lg md:leading-8',
          centered ? 'mx-auto max-w-3xl' : 'max-w-2xl',
        )}
      >
        {resolvedDescription}
      </TextContent>
      <ActionGroup actions={actions} className={cx('mt-8', centered ? 'justify-center' : '')} />
      {renderSkills ? <SkillCTAGroup align={align} skills={skills} /> : null}
    </div>
  )
}

const DocsSetHeroSkillTiles = ({
  className,
  skills: inputSkills,
}: {
  className?: string
  skills?: DocsSetHeroProps['skills']
}) => {
  const skills = normalizeSkills(inputSkills)

  if (!skills) {
    return (
      <div className={cx('grid grid-cols-2 gap-3', className)}>
        <div className="h-24 rounded-xl border border-white/10 bg-white/[0.05]" />
        <div className="h-24 rounded-xl border border-white/10 bg-cyan-300/10" />
      </div>
    )
  }

  return (
    <div className={cx('space-y-3', className)}>
      {skills.heading || skills.description ? (
        <div>
          {skills.heading ? (
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
              {skills.heading}
            </p>
          ) : null}
          {skills.description ? (
            <p className="mt-1 text-xs leading-5 text-white/58">{skills.description}</p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {skills.items.map((item) => {
          const content = (
            <>
              {item.icon ? (
                <span
                  aria-hidden="true"
                  className="text-[0.68rem] font-semibold uppercase tracking-wide text-cyan-200"
                >
                  {item.icon}
                </span>
              ) : null}
              <span className="min-w-0 text-sm font-semibold text-white">{item.label}</span>
              {item.description ? (
                <span className="mt-1 line-clamp-2 text-xs leading-5 text-white/56">
                  {item.description}
                </span>
              ) : null}
            </>
          )

          return item.href ? (
            <a
              className="flex min-h-24 flex-col justify-center rounded-xl border border-white/10 bg-white/[0.055] p-4 transition-colors hover:bg-white/[0.095]"
              href={item.href}
              key={`${item.type}-${item.label}`}
            >
              {content}
            </a>
          ) : (
            <div
              className="flex min-h-24 flex-col justify-center rounded-xl border border-white/10 bg-white/[0.045] p-4"
              key={`${item.type}-${item.label}`}
            >
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const DocsSetSideInfoPanel = ({
  description,
  publicHref,
  skills,
  title,
}: {
  description?: string
  publicHref?: string
  skills?: DocsSetHeroProps['skills']
  title: string
}) => (
  <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-slate-950/76 p-4 shadow-2xl shadow-slate-950/30 backdrop-blur">
    <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(34,211,238,0.12),transparent_42%,rgba(16,185,129,0.1))]" />
    <div className="relative">
      <div className="mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-300/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/80" />
        <span className="ml-2 min-w-0 flex-1 truncate rounded-full bg-white/10 px-3 py-1 text-[0.68rem] font-medium text-white/46">
          {publicHref ?? '/docs'}
        </span>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Docs set</p>
          <p className="mt-2 text-lg font-semibold text-white">{title}</p>
          {description ? (
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/62">{description}</p>
          ) : null}
        </div>
        <DocsSetHeroSkillTiles skills={skills} />
        <div className="space-y-2">
          <span className="block h-2 rounded-full bg-white/18" />
          <span className="block h-2 w-5/6 rounded-full bg-white/12" />
          <span className="block h-2 w-2/3 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  </div>
)

const DocsSetSideImageVisual = ({
  className,
  docsSet,
  image,
}: {
  className?: string
  docsSet?: DocsRelationship<DocsSetReference> | null
  image?: DocsRelationship<DocsMediaReference> | null
}) => {
  const title = getDocsSetTitle(docsSet) ?? 'Documentation'
  const description = getDocsSetDescription(docsSet)
  const media = normalizeMedia(image) ?? normalizeMedia(getDocsSetImage(docsSet))

  return (
    <aside
      className={cx('relative w-full max-w-xl justify-self-center lg:justify-self-end', className)}
    >
      <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-3xl bg-gradient-to-br from-cyan-300/16 via-emerald-300/10 to-fuchsia-300/10" />
      <div className="relative overflow-hidden rounded-3xl border border-border bg-background/80 shadow-2xl shadow-slate-950/16 backdrop-blur">
        {media ? (
          <img
            alt={media.alt ?? ''}
            className="aspect-[4/3] w-full object-cover"
            height={media.height}
            src={media.url}
            width={media.width}
          />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center bg-[linear-gradient(135deg,rgba(8,145,178,0.2),rgba(15,23,42,0.86)_45%,rgba(16,185,129,0.16))] p-8 text-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
                Docs set
              </p>
              <p className="mt-3 text-2xl font-semibold text-white">{title}</p>
              {description ? (
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/62">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        )}
        {media ? (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/78 to-transparent p-5 pt-24">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
              Docs set
            </p>
            <p className="mt-2 text-xl font-semibold text-white">{title}</p>
            {description ? (
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/66">{description}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  )
}

const DocsSetSideInfoVisual = ({
  className,
  docsSet,
  skills,
}: {
  className?: string
  docsSet?: DocsRelationship<DocsSetReference> | null
  skills?: DocsSetHeroProps['skills']
}) => {
  const title = getDocsSetTitle(docsSet) ?? 'Documentation'
  const description = getDocsSetDescription(docsSet)
  const publicHref = getTypedDocsSetPublicHref(docsSet)

  return (
    <aside
      className={cx('relative w-full max-w-xl justify-self-center lg:justify-self-end', className)}
    >
      <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-3xl bg-gradient-to-br from-cyan-300/16 via-emerald-300/10 to-fuchsia-300/10" />
      <DocsSetSideInfoPanel
        description={description}
        publicHref={publicHref}
        skills={skills}
        title={title}
      />
    </aside>
  )
}

export const DocsSetFullWidthHero = (props: DocsSetHeroComponentProps) => {
  const { background, className, containerClassName, docsSet, theme = 'dark' } = props
  const resolvedBackground = withFallbackBackground({
    background,
    fallbackImage: getDocsSetImage(docsSet),
  })
  const resolvedTheme = theme ?? 'dark'

  return (
    <section
      className={cx(
        'relative isolate min-h-[40rem] overflow-visible md:min-h-[44rem]',
        themeClasses[resolvedTheme],
        className,
      )}
      data-payload-markdown-docs-hero="docsSetFullWidth"
    >
      <DecorativeBackgroundLayer background={resolvedBackground}>
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(8,145,178,0.18),transparent_38%,rgba(16,185,129,0.1)_70%,transparent)]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-slate-950/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-slate-950/45 to-transparent" />
      </DecorativeBackgroundLayer>
      <div
        className={cx(
          'relative z-10 mx-auto flex min-h-[40rem] w-full max-w-6xl flex-col items-center justify-center px-6 pb-24 pt-36 text-center md:min-h-[44rem] md:pb-28 md:pt-44 lg:px-8',
          containerClassName,
        )}
      >
        <DocsSetHeroContent {...props} align="center" />
      </div>
    </section>
  )
}

export const DocsSetSideImageHero = (props: DocsSetHeroComponentProps) => {
  const {
    className,
    containerClassName,
    docsSet,
    image,
    imagePosition = 'right',
    theme = 'default',
  } = props
  const resolvedImagePosition = imagePosition ?? 'right'
  const resolvedTheme = theme ?? 'default'

  return (
    <section
      className={cx(
        'relative isolate min-h-[35rem] overflow-visible',
        themeClasses[resolvedTheme],
        className,
      )}
      data-payload-markdown-docs-hero="docsSetSideImage"
    >
      <DecorativeBackgroundLayer>
        <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(8,145,178,0.1),transparent_42%,rgba(16,185,129,0.08))]" />
      </DecorativeBackgroundLayer>
      <div
        className={cx(
          'relative z-10 mx-auto grid min-h-[35rem] w-full max-w-7xl gap-12 px-6 pb-20 pt-32 md:min-h-[42rem] md:pb-24 md:pt-40 lg:grid-cols-[minmax(0,0.95fr)_minmax(20rem,1.05fr)] lg:items-center lg:px-8',
          containerClassName,
        )}
      >
        <DocsSetHeroContent
          {...props}
          align="left"
          className={resolvedImagePosition === 'left' ? 'lg:order-2' : undefined}
        />
        <DocsSetSideImageVisual
          className={
            resolvedImagePosition === 'left' ? 'lg:order-1 lg:justify-self-start' : undefined
          }
          docsSet={docsSet}
          image={image}
        />
      </div>
    </section>
  )
}

export const DocsSetSideInfoHero = (props: DocsSetHeroComponentProps) => {
  const { className, containerClassName, docsSet, skills, theme = 'dark' } = props
  const resolvedTheme = theme ?? 'dark'

  return (
    <section
      className={cx(
        'relative isolate min-h-[40rem] overflow-visible md:min-h-[44rem]',
        themeClasses[resolvedTheme],
        className,
      )}
      data-payload-markdown-docs-hero="docsSetSideInfo"
    >
      <DecorativeBackgroundLayer>
        <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(8,145,178,0.16),transparent_38%,rgba(16,185,129,0.1)_72%,transparent)]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-slate-950/38 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-slate-950/24 to-transparent" />
      </DecorativeBackgroundLayer>
      <div
        className={cx(
          'relative z-10 mx-auto grid min-h-[40rem] w-full max-w-7xl gap-12 px-6 pb-20 pt-36 md:min-h-[44rem] md:pb-24 md:pt-44 lg:grid-cols-[minmax(0,0.95fr)_minmax(20rem,1.05fr)] lg:items-center lg:px-8',
          containerClassName,
        )}
      >
        <DocsSetHeroContent {...props} align="left" renderSkills={false} />
        <DocsSetSideInfoVisual docsSet={docsSet} skills={skills} />
      </div>
    </section>
  )
}

export const docsSetHeroComponents = {
  docsSetFullWidth: DocsSetFullWidthHero,
  docsSetSideImage: DocsSetSideImageHero,
  docsSetSideInfo: DocsSetSideInfoHero,
}

export const docsHeroComponents = docsSetHeroComponents

export const DocsSetHero = (props: DocsSetHeroProps) => {
  if (props.type === 'docsSetFullWidth') {
    return <DocsSetFullWidthHero {...props} />
  }

  if (props.type === 'docsSetSideImage') {
    return <DocsSetSideImageHero {...props} />
  }

  if (props.type === 'docsSetSideInfo') {
    return <DocsSetSideInfoHero {...props} />
  }

  return null
}
