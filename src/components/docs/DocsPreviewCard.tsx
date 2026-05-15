import type { NormalizedDocsPreviewItem } from '../../marketing/types.js'

import { cx } from './shared.js'

export type DocsPreviewCardProps = {
  item: NormalizedDocsPreviewItem
  layout?: 'cards' | 'compact' | 'featured' | 'list' | null
}

export const DocsPreviewCard = ({ item, layout = 'cards' }: DocsPreviewCardProps) => {
  const compact = layout === 'compact' || layout === 'list'
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <span className={cx('font-semibold text-foreground', compact ? 'text-sm' : 'text-base')}>
          {item.title}
        </span>
        {item.badge ? (
          <span className="shrink-0 rounded-full border border-cyan-300/25 px-2 py-0.5 text-xs font-medium text-cyan-200">
            {item.badge}
          </span>
        ) : null}
      </div>
      {item.excerpt ? (
        <p className={cx('mt-2 text-sm leading-6 text-foreground/65', compact ? 'line-clamp-2' : '')}>
          {item.excerpt}
        </p>
      ) : null}
    </>
  )

  const className = cx(
    'block rounded-lg border border-border bg-white/[0.03] transition-colors',
    compact ? 'p-4 hover:bg-white/[0.06]' : 'p-5 hover:bg-white/[0.06]',
    layout === 'featured' ? 'min-h-48' : undefined,
  )

  return item.href ? (
    <a className={className} href={item.href}>
      {content}
    </a>
  ) : (
    <article className={className}>{content}</article>
  )
}
