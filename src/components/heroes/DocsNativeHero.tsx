import type { DocsNativeHeroProps } from '../../marketing/types.js'

import { normalizeCTAButtons } from '../../utilities/normalizeCTAButtons.js'
import {
  ActionGroup,
  BackgroundLayer,
  cx,
  Heading,
  TextContent,
} from '../docs/shared.js'
import { SkillCTAGroup } from '../skills/SkillCTAGroup.js'

const renderBreadcrumb = (breadcrumb: DocsNativeHeroProps['breadcrumb']) => {
  if (!breadcrumb) {
    return null
  }

  if (typeof breadcrumb === 'string') {
    return <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">{breadcrumb}</p>
  }

  if (breadcrumb.length === 0) {
    return null
  }

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2 text-sm text-foreground/60">
        {breadcrumb.map((item, index) => (
          <li className="flex items-center gap-2" key={`${item.label}-${item.href ?? index}`}>
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {item.href ? (
              <a className="hover:text-foreground" href={item.href}>
                {item.label}
              </a>
            ) : (
              <span>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

const renderMetadata = (metadata: DocsNativeHeroProps['metadata']) => {
  if (!Array.isArray(metadata) || metadata.length === 0) {
    return null
  }

  return (
    <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground/60">
      {metadata.map((item) => {
        if (typeof item === 'string') {
          return (
            <div key={item}>
              <dd>{item}</dd>
            </div>
          )
        }

        return (
          <div className="flex gap-2" key={`${item.label ?? 'metadata'}-${item.value}`}>
            {item.label ? <dt>{item.label}</dt> : null}
            <dd className="font-medium text-foreground">{item.value}</dd>
          </div>
        )
      })}
    </dl>
  )
}

export const DocsNativeHero = ({
  background,
  breadcrumb,
  className,
  containerClassName,
  description,
  eyebrow,
  metadata,
  navigationAction,
  searchAction,
  searchSlot,
  skills,
  title,
}: DocsNativeHeroProps) => {
  const actions = normalizeCTAButtons([searchAction, navigationAction])

  return (
    <section
      className={cx(
        'relative isolate overflow-hidden border-b border-border bg-background py-12 text-foreground',
        className,
      )}
      data-payload-markdown-docs-hero="native"
    >
      <BackgroundLayer background={background} />
      <div className={cx('relative mx-auto w-full max-w-7xl px-6 lg:px-8', containerClassName)}>
        {breadcrumb ? renderBreadcrumb(breadcrumb) : null}
        {!breadcrumb && eyebrow ? (
          <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">{eyebrow}</p>
        ) : null}
        <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)] lg:items-end">
          <div>
            <Heading
              className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl"
              level={1}
            >
              {title}
            </Heading>
            <TextContent className="mt-4 max-w-3xl text-base leading-7 text-foreground/70 md:text-lg">
              {description}
            </TextContent>
            {renderMetadata(metadata)}
          </div>
          {searchSlot || actions.length > 0 ? (
            <div className="rounded-xl border border-border bg-white/[0.03] p-4">
              {searchSlot}
              <ActionGroup actions={actions} className={searchSlot ? 'mt-4' : undefined} />
            </div>
          ) : null}
        </div>
        <SkillCTAGroup skills={skills} />
      </div>
    </section>
  )
}
