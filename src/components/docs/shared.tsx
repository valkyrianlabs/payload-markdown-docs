import type { CSSProperties, ElementType, ReactNode } from 'react'

import type {
  DocsBackgroundMediaInput,
  DocsCTAButtonInput,
  DocsRelationship,
  DocsSetReference,
  NormalizedDocsBackgroundMedia,
  NormalizedDocsCTAButton,
} from '../../marketing/types.js'

import { normalizeBackgroundMedia } from '../../utilities/index.js'
import { getText } from '../../utilities/normalizeShared.js'

export const cx = (...values: (false | null | string | undefined)[]): string =>
  values.filter(Boolean).join(' ')

export const Heading = ({
  children,
  className,
  level = 2,
}: {
  children?: ReactNode
  className?: string
  level?: 1 | 2 | 3 | 4
}) => {
  if (!children) {
    return null
  }

  const Component = `h${level}` as ElementType

  return <Component className={className}>{children}</Component>
}

export const TextContent = ({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) => {
  if (!children) {
    return null
  }

  if (typeof children === 'string') {
    return <p className={className}>{children}</p>
  }

  return <div className={className}>{children}</div>
}

export const DecorativeBackgroundLayer = ({
  background,
  children,
  className,
}: {
  background?: DocsBackgroundMediaInput | null
  children?: ReactNode
  className?: string
}) => (
  <div
    aria-hidden="true"
    className={cx(
      'pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]',
      className,
    )}
  >
    <BackgroundLayer background={background} />
    {children}
  </div>
)

export const resolveOptionalText = (value: ReactNode, fallback?: string): ReactNode | undefined => {
  if (typeof value === 'string') {
    return value.trim() ? value : fallback
  }

  return value ?? fallback
}

export const resolveRequiredHeading = ({
  blockType,
  fallbackLabel,
  fallbackTitle,
  value,
}: {
  blockType: string
  fallbackLabel: string
  fallbackTitle?: string
  value?: null | string
}): string => {
  const heading = getText(value) ?? fallbackTitle

  if (heading) {
    return heading
  }

  throw new Error(
    `[payload-markdown-docs] ${blockType} requires a heading or a ${fallbackLabel} with a title. Set a heading override or query the relationship with enough depth to include its title.`,
  )
}

export const normalizeBadges = (
  badges?: { label?: null | string }[] | null | string[],
): string[] => {
  if (!Array.isArray(badges)) {
    return []
  }

  return badges.flatMap((badge) => {
    if (typeof badge === 'string' && badge.trim() !== '') {
      return [badge.trim()]
    }

    if (typeof badge === 'object' && badge !== null && badge.label?.trim()) {
      return [badge.label.trim()]
    }

    return []
  })
}

const actionBaseClass =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-3 text-center text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-background'

const actionVariantClasses: Record<NormalizedDocsCTAButton['variant'], string> = {
  ghost: 'text-foreground hover:bg-white/[0.06]',
  link: 'px-0 py-0 text-cyan-300 hover:text-cyan-200',
  outline: 'border border-border bg-background/30 text-foreground hover:bg-white/[0.06]',
  primary: 'bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/20 hover:bg-cyan-200',
  secondary: 'bg-white/[0.09] text-foreground hover:bg-white/[0.14]',
}

export const ActionLink = ({
  action,
  className,
}: {
  action: NormalizedDocsCTAButton
  className?: string
}) => (
  <a
    className={cx(actionBaseClass, actionVariantClasses[action.variant], className)}
    href={action.href}
    rel={action.newTab ? 'noopener noreferrer' : undefined}
    target={action.newTab ? '_blank' : undefined}
  >
    {action.icon ? (
      <span aria-hidden="true" className="mr-2 text-xs uppercase tracking-wide opacity-75">
        {action.icon}
      </span>
    ) : null}
    <span>{action.label}</span>
  </a>
)

export const ActionGroup = ({
  actions,
  className,
}: {
  actions: NormalizedDocsCTAButton[]
  className?: string
}) => {
  if (actions.length === 0) {
    return null
  }

  return (
    <div className={cx('flex flex-wrap items-center gap-3', className)}>
      {actions.map((action) => (
        <ActionLink action={action} key={`${action.label}-${action.href}`} />
      ))}
    </div>
  )
}

export const getFallbackAction = ({
  docsLabel,
  docsSet,
  docsUrl,
}: {
  docsLabel?: null | string
  docsSet?: DocsRelationship<DocsSetReference> | null
  docsUrl?: null | string
}): DocsCTAButtonInput | undefined =>
  docsUrl || docsSet
    ? {
        docsSet,
        href: docsUrl,
        label: docsLabel || 'Read the docs',
        target: docsUrl ? 'custom' : 'set',
        url: docsUrl,
        variant: 'primary',
      }
    : undefined

const overlayClasses: Record<NormalizedDocsBackgroundMedia['overlayVariant'], string> = {
  brand: 'bg-cyan-950',
  dark: 'bg-slate-950',
  gradient: 'bg-gradient-to-r from-slate-950 via-slate-950/80 to-cyan-950',
  light: 'bg-white',
}

export const getBackgroundStyles = (
  background: NormalizedDocsBackgroundMedia,
): CSSProperties | undefined => {
  if (!background.media?.url) {
    return undefined
  }

  return {
    backgroundImage: `url(${background.media.url})`,
    backgroundPosition: background.position,
    backgroundRepeat: 'no-repeat',
    backgroundSize: background.fit === 'fill' ? '100% 100%' : background.fit,
  }
}

export const BackgroundLayer = ({
  background: input,
}: {
  background?: DocsBackgroundMediaInput | null
}) => {
  const background = normalizeBackgroundMedia(input)

  if (!background.media?.url) {
    return null
  }

  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={getBackgroundStyles(background)}
      />
      {background.overlay ? (
        <div
          aria-hidden="true"
          className={cx('absolute inset-0', overlayClasses[background.overlayVariant])}
          style={{
            opacity: background.overlayOpacity / 100,
          }}
        />
      ) : null}
    </>
  )
}

export const themeClasses = {
  brand: 'bg-cyan-950 text-white',
  dark: 'bg-slate-950 text-white',
  default: 'bg-background text-foreground',
  muted: 'bg-white/[0.03] text-foreground',
}

export const panelClasses = {
  brand: 'border-cyan-300/20 bg-cyan-300/10',
  dark: 'border-white/10 bg-white/[0.04]',
  default: 'border-border bg-white/[0.03]',
  muted: 'border-border bg-muted/40',
}
