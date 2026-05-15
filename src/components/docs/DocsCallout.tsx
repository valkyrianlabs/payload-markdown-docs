import type { DocsCalloutProps } from '../../marketing/types.js'

import { getRouteLikeHref } from '../../utilities/normalizeShared.js'
import { SkillCTAGroup } from '../skills/SkillCTAGroup.js'
import { DocsCalloutCard } from './DocsCalloutCard.js'
import { cx } from './shared.js'

export const DocsCallout = ({
  className,
  containerClassName,
  ctaLabel,
  description,
  excerpt,
  heading,
  href,
  icon,
  layout = 'card',
  manualHref,
  routeReference,
  skills,
  variant = 'info',
}: DocsCalloutProps) => {
  const resolvedHref = href ?? manualHref ?? getRouteLikeHref(routeReference)
  const resolvedDescription = description ?? excerpt

  if (!heading && !resolvedDescription && !resolvedHref) {
    return null
  }

  return (
    <section
      className={cx('py-8', className)}
      data-payload-markdown-docs-block="docsCallout"
    >
      <div className={cx('mx-auto w-full max-w-6xl px-6 lg:px-8', containerClassName)}>
        <DocsCalloutCard
          ctaLabel={ctaLabel || 'Read more'}
          description={resolvedDescription}
          heading={heading}
          href={resolvedHref}
          icon={icon}
          layout={layout}
          variant={variant}
        />
        <SkillCTAGroup skills={skills} />
      </div>
    </section>
  )
}
