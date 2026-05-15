import type { DocsProductHeroProps } from '../../marketing/types.js'

import { normalizeCTAButtons } from '../../utilities/normalizeCTAButtons.js'
import { normalizeDocsPreviewItems } from '../../utilities/normalizeDocsPreviewItems.js'
import { DocsPreviewCard } from '../docs/DocsPreviewCard.js'
import {
  ActionGroup,
  BackgroundLayer,
  cx,
  getFallbackAction,
  Heading,
  normalizeBadges,
  TextContent,
} from '../docs/shared.js'
import { SkillCTAGroup } from '../skills/SkillCTAGroup.js'

export const DocsProductHero = ({
  background,
  badges: inputBadges,
  className,
  containerClassName,
  description,
  docsAction,
  docsLabel,
  docsUrl,
  eyebrow,
  heading,
  preview,
  primaryAction,
  secondaryAction,
  skills,
}: DocsProductHeroProps) => {
  const actions = normalizeCTAButtons([
    primaryAction,
    secondaryAction,
    docsAction ??
      getFallbackAction({
        docsLabel,
        docsUrl,
      }),
  ])
  const badges = normalizeBadges(inputBadges)
  const previewItems = normalizeDocsPreviewItems(preview?.items, {
    maxItems: 3,
  })

  return (
    <section
      className={cx(
        'relative isolate overflow-hidden bg-background py-20 text-foreground',
        className,
      )}
      data-payload-markdown-docs-hero="product"
    >
      <BackgroundLayer background={background} />
      <div
        className={cx(
          'relative mx-auto grid w-full max-w-7xl gap-10 px-6 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center lg:px-8',
          containerClassName,
        )}
      >
        <div className="max-w-4xl">
          {eyebrow ? (
            <p className="mb-3 text-sm font-medium uppercase tracking-wide text-cyan-300">
              {eyebrow}
            </p>
          ) : null}
          <Heading
            className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground md:text-6xl"
            level={1}
          >
            {heading}
          </Heading>
          <TextContent className="mt-5 max-w-3xl text-lg leading-8 text-foreground/72">
            {description}
          </TextContent>
          {badges.length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {badges.map((badge) => (
                <span
                  className="rounded-full border border-cyan-300/25 px-3 py-1 text-xs font-medium text-cyan-200"
                  key={badge}
                >
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
          <ActionGroup actions={actions} className="mt-8" />
          <SkillCTAGroup skills={skills} />
        </div>
        {preview ? (
          <aside className="rounded-xl border border-border bg-white/[0.04] p-5 shadow-2xl shadow-slate-950/20">
            <div className="border-b border-border pb-4">
              <p className="text-sm font-medium text-cyan-300">
                {preview.title ?? 'Documentation'}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {preview.setName ? (
                  <div>
                    <dt className="text-foreground/50">Set</dt>
                    <dd className="mt-1 font-medium text-foreground">{preview.setName}</dd>
                  </div>
                ) : null}
                {preview.groupName ? (
                  <div>
                    <dt className="text-foreground/50">Group</dt>
                    <dd className="mt-1 font-medium text-foreground">{preview.groupName}</dd>
                  </div>
                ) : null}
                {preview.version ? (
                  <div>
                    <dt className="text-foreground/50">Version</dt>
                    <dd className="mt-1 font-medium text-foreground">{preview.version}</dd>
                  </div>
                ) : null}
                {typeof preview.pageCount === 'number' ? (
                  <div>
                    <dt className="text-foreground/50">Pages</dt>
                    <dd className="mt-1 font-medium text-foreground">{preview.pageCount}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
            {previewItems.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {previewItems.map((item) => (
                  <DocsPreviewCard
                    item={item}
                    key={`${item.title}-${item.href ?? 'static'}`}
                    layout="compact"
                  />
                ))}
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </section>
  )
}
