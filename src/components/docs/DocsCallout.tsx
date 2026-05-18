import type {
  DocsCalloutProps,
  DocsPageReference,
  DocsRelationship,
} from '../../marketing/types.js'

import {
  getDocsPageDescription,
  getDocsPageTitle,
  getRouteLikeHref,
  getText,
  getTypedDocsPageHref,
} from '../../utilities/normalizeShared.js'
import { SkillCTAGroup } from '../skills/SkillCTAGroup.js'
import { DocsCalloutCard } from './DocsCalloutCard.js'
import { cx, resolveOptionalText, resolveRequiredHeading } from './shared.js'

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
  const legacyCalloutProps = props as {
    href?: null | string
    manualHref?: null | string
    routeReference?: DocsRelationship<DocsPageReference> | null
  } & DocsCalloutProps
  const resolvedHref =
    getTypedDocsPageHref(docsPage) ??
    getText(legacyCalloutProps.href) ??
    getText(legacyCalloutProps.manualHref) ??
    getRouteLikeHref(legacyCalloutProps.routeReference)
  const resolvedHeading = resolveRequiredHeading({
    blockType: 'docsCallout',
    fallbackLabel: 'selected docs page',
    fallbackTitle: getDocsPageTitle(docsPage),
    value: heading,
  })
  const resolvedDescription = resolveOptionalText(
    description ?? excerpt,
    getDocsPageDescription(docsPage),
  )

  return (
    <section
      className={cx('relative isolate py-10 md:py-12', className)}
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
