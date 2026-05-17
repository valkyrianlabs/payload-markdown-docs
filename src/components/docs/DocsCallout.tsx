import type { DocsCalloutProps } from '../../marketing/types.js'

import {
  getDocsPageHref,
  getRouteLikeDescription,
  getRouteLikeHref,
  getRouteLikeTitle,
  getString,
} from '../../utilities/normalizeShared.js'
import { SkillCTAGroup } from '../skills/SkillCTAGroup.js'
import { DocsCalloutCard } from './DocsCalloutCard.js'
import { cx } from './shared.js'

export const DocsCallout = (props: DocsCalloutProps) => {
  const {
    className,
    containerClassName,
    ctaLabel,
    description,
    docsPage,
    excerpt,
    heading,
    icon,
    layout = 'card',
    skills,
    variant = 'info',
  } = props
  const legacyProps = props as Record<string, unknown>
  const resolvedHref =
    getDocsPageHref(docsPage) ??
    getString(legacyProps.href) ??
    getString(legacyProps.manualHref) ??
    getRouteLikeHref(legacyProps.routeReference)
  const resolvedHeading = heading ?? getRouteLikeTitle(docsPage)
  const resolvedDescription = description ?? excerpt ?? getRouteLikeDescription(docsPage)

  if (!resolvedHeading && !resolvedDescription && !resolvedHref) {
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
          heading={resolvedHeading}
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
