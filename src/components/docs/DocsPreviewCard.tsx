import type { NormalizedDocsPreviewItem } from '../../marketing/types.js'

import { formatStackCategory } from '../../shared/stack.js'
import { cx } from './shared.js'

/** Pills shown before collapsing the rest into "+N": few on compact cards. */
const STACK_PILL_LIMIT = {
  cards: 8,
  compact: 4,
  featured: 6,
} as const

const pillClassName =
  'rounded-full border border-border px-2 py-0.5 text-[11px] leading-4 text-foreground/60'

const StackPills = ({ limit, names }: { limit: number; names: string[] }) => (
  <>
    {names.slice(0, limit).map((name, index) => (
      <li className={pillClassName} key={`${index}:${name}`}>
        {name}
      </li>
    ))}
    {names.length > limit ? (
      <li className={pillClassName} title={names.slice(limit).join(', ')}>
        +{names.length - limit}
      </li>
    ) : null}
  </>
)

const DocsPreviewStack = ({
  layout,
  stack,
}: {
  layout: DocsPreviewCardProps['layout']
  stack: NonNullable<NormalizedDocsPreviewItem['stack']>
}) => {
  if (layout === 'featured') {
    return (
      <dl className="mt-4 grid gap-2" data-payload-markdown-docs-stack="">
        {stack.map((category) => (
          <div key={category.category}>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-foreground/45">
              {formatStackCategory(category.category)}
            </dt>
            <dd>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                <StackPills
                  limit={STACK_PILL_LIMIT.featured}
                  names={category.items.map((item) => item.name)}
                />
              </ul>
            </dd>
          </div>
        ))}
      </dl>
    )
  }

  const compact = layout === 'compact' || layout === 'list'

  return (
    <ul
      aria-label="Technology stack"
      className="mt-3 flex flex-wrap gap-1.5"
      data-payload-markdown-docs-stack=""
    >
      <StackPills
        limit={compact ? STACK_PILL_LIMIT.compact : STACK_PILL_LIMIT.cards}
        names={stack.flatMap((category) => category.items.map((item) => item.name))}
      />
    </ul>
  )
}

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
        <p
          className={cx('mt-2 text-sm leading-6 text-foreground/65', compact ? 'line-clamp-2' : '')}
        >
          {item.excerpt}
        </p>
      ) : null}
      {item.stack && item.stack.length > 0 ? <DocsPreviewStack layout={layout} stack={item.stack} /> : null}
    </>
  )

  const className = cx(
    'block rounded-xl border border-border bg-white/[0.04] shadow-sm shadow-slate-950/5 transition-colors',
    compact ? 'p-4 hover:bg-white/[0.08]' : 'p-5 hover:bg-white/[0.08]',
    layout === 'featured' ? 'min-h-52' : undefined,
  )

  return item.href ? (
    <a className={className} href={item.href}>
      {content}
    </a>
  ) : (
    <article className={className}>{content}</article>
  )
}
