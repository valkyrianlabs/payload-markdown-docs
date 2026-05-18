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
  getText,
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

const docsSetHeroTypes = new Set(['docsSetFullWidth', 'docsSetSideImage'])

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

const getDocsSetGroupLabel = (
  docsSet: DocsRelationship<DocsSetReference> | null | undefined,
): string | undefined => {
  const record = getDocsRelationshipRecord(docsSet)
  const group = getDocsRelationshipRecord(record?.group)

  return getText(group?.title) ?? getText(group?.slug)
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
  skills,
}: {
  align?: 'center' | 'left'
  className?: string
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
      <SkillCTAGroup align={align} skills={skills} />
    </div>
  )
}

const DocsSetHeroMockup = ({ description, title }: { description?: string; title: string }) => (
  <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-slate-950/70 p-4 shadow-2xl shadow-slate-950/30 backdrop-blur">
    <div className="mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
      <span className="h-2.5 w-2.5 rounded-full bg-rose-300/80" />
      <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/80" />
      <span className="ml-2 h-2 w-28 rounded-full bg-white/12" />
    </div>
    <div className="space-y-4">
      <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Docs set</p>
        <p className="mt-2 text-lg font-semibold text-white">{title}</p>
        {description ? (
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/62">{description}</p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 rounded-xl border border-white/10 bg-white/[0.05]" />
        <div className="h-24 rounded-xl border border-white/10 bg-emerald-300/10" />
      </div>
      <div className="space-y-2">
        <span className="block h-2 rounded-full bg-white/18" />
        <span className="block h-2 w-5/6 rounded-full bg-white/12" />
        <span className="block h-2 w-2/3 rounded-full bg-white/10" />
      </div>
    </div>
  </div>
)

const DocsSetHeroVisual = ({
  className,
  docsSet,
  image,
}: {
  className?: string
  docsSet?: DocsRelationship<DocsSetReference> | null
  image?: DocsRelationship<DocsMediaReference> | null
}) => {
  const record = getDocsRelationshipRecord(docsSet)
  const title = getDocsSetTitle(docsSet) ?? 'Documentation'
  const description = getDocsSetDescription(docsSet)
  const media = normalizeMedia(image) ?? normalizeMedia(getDocsSetImage(docsSet))
  const groupLabel = getDocsSetGroupLabel(docsSet)
  const publicHref = getTypedDocsSetPublicHref(docsSet)
  const routeMode = record?.routeMode === 'product-nested' ? 'Product nested' : 'Docs root'

  return (
    <aside
      className={cx('relative w-full max-w-xl justify-self-center lg:justify-self-end', className)}
    >
      <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-3xl bg-gradient-to-br from-cyan-300/16 via-emerald-300/10 to-fuchsia-300/10" />
      <div className="relative">
        {media ? (
          <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-slate-950/70 shadow-2xl shadow-slate-950/30">
            <img
              alt={media.alt ?? ''}
              className="aspect-[4/3] w-full object-cover"
              height={media.height}
              src={media.url}
              width={media.width}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/82 to-transparent p-5 pt-20">
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
                Docs set
              </p>
              <p className="mt-2 text-xl font-semibold text-white">{title}</p>
              {description ? (
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/66">{description}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <DocsSetHeroMockup description={description} title={title} />
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {groupLabel ? (
            <div className="rounded-xl border border-border bg-background/70 p-4 shadow-lg shadow-slate-950/5 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
                Group
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">{groupLabel}</p>
            </div>
          ) : null}
          <div className="rounded-xl border border-border bg-background/70 p-4 shadow-lg shadow-slate-950/5 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
              Route
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-foreground">
              {publicHref ?? routeMode}
            </p>
          </div>
        </div>
      </div>
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
        'relative isolate min-h-[35rem] overflow-visible',
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
          'relative z-10 mx-auto grid min-h-[35rem] w-full max-w-7xl gap-12 px-6 pb-20 pt-32 md:min-h-[42rem] md:pb-24 md:pt-40 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,34rem)] lg:items-center lg:px-8',
          containerClassName,
        )}
      >
        <DocsSetHeroContent {...props} align="left" />
        <DocsSetHeroVisual docsSet={docsSet} />
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
        <DocsSetHeroVisual
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

export const docsSetHeroComponents = {
  docsSetFullWidth: DocsSetFullWidthHero,
  docsSetSideImage: DocsSetSideImageHero,
}

export const docsHeroComponents = docsSetHeroComponents

export const DocsSetHero = (props: DocsSetHeroProps) => {
  if (props.type === 'docsSetFullWidth') {
    return <DocsSetFullWidthHero {...props} />
  }

  if (props.type === 'docsSetSideImage') {
    return <DocsSetSideImageHero {...props} />
  }

  return null
}
