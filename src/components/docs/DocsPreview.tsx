import type { DocsPreviewProps } from '../../marketing/types.js'

import { normalizeCTAButtons, normalizeDocsPreviewItems } from '../../utilities/index.js'
import { getRouteLikeDescription } from '../../utilities/normalizeShared.js'
import { SkillCTAGroup } from '../skills/SkillCTAGroup.js'
import { DocsPreviewCard } from './DocsPreviewCard.js'
import {
  ActionGroup,
  cx,
  getFallbackAction,
  Heading,
  resolveOptionalText,
  resolveRequiredHeading,
  TextContent,
  themeClasses,
} from './shared.js'

export const DocsPreview = (props: DocsPreviewProps) => {
  const {
    className,
    containerClassName,
    ctaButtons,
    description,
    docsSet,
    heading,
    headingLevel = 2,
    layout = 'cards',
    skills,
    theme = 'default',
    viewAllLabel,
  } = props
  const legacyProps = props as {
    docs?: null | unknown[]
    items?: null | unknown[]
    manualItems?: null | unknown[]
    maxItems?: null | number
    viewAllUrl?: null | string
  } & DocsPreviewProps
  const resolvedHeading = resolveRequiredHeading({
    blockType: 'docsPreview',
    fallback: docsSet,
    fallbackLabel: 'selected docs set',
    value: heading,
  })
  const resolvedDescription = resolveOptionalText(description, getRouteLikeDescription(docsSet))
  const previewItems = normalizeDocsPreviewItems(
    [...(legacyProps.manualItems ?? legacyProps.items ?? []), ...(legacyProps.docs ?? [])],
    {
      maxItems: legacyProps.maxItems,
    },
  )
  const actions = normalizeCTAButtons(
    ctaButtons,
    getFallbackAction({
      docsLabel: viewAllLabel || 'View all docs',
      docsSet,
      docsUrl: legacyProps.viewAllUrl,
    }),
    {
      docsSet,
    },
  )
  const resolvedLayout = layout ?? 'cards'
  const resolvedTheme = theme ?? 'default'

  return (
    <section
      className={cx('py-14', themeClasses[resolvedTheme], className)}
      data-payload-markdown-docs-block="docsPreview"
    >
      <div className={cx('mx-auto w-full max-w-6xl px-6 lg:px-8', containerClassName)}>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <Heading
              className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
              level={headingLevel}
            >
              {resolvedHeading}
            </Heading>
            <TextContent className="mt-4 text-base leading-7 text-foreground/70">
              {resolvedDescription}
            </TextContent>
          </div>
          <ActionGroup actions={actions} />
        </div>
        {previewItems.length > 0 ? (
          <div
            className={cx(
              'mt-8 grid gap-4',
              resolvedLayout === 'cards' ? 'sm:grid-cols-2 lg:grid-cols-3' : undefined,
              resolvedLayout === 'featured' ? 'lg:grid-cols-[1.2fr_1fr_1fr]' : undefined,
              resolvedLayout === 'compact' || resolvedLayout === 'list' ? 'grid-cols-1' : undefined,
            )}
          >
            {previewItems.map((item) => (
              <DocsPreviewCard
                item={item}
                key={`${item.title}-${item.href ?? 'static'}`}
                layout={resolvedLayout}
              />
            ))}
          </div>
        ) : null}
        <SkillCTAGroup skills={skills} />
      </div>
    </section>
  )
}
