import type { ReactNode } from 'react'

import type {
  PayloadMarkdownDocsSidebarItem,
  ResolvedPayloadMarkdownDocsRecord,
  ResolvedPayloadMarkdownDocsRoute,
  ResolvedPayloadMarkdownDocsSet,
} from './types.js'

import { DEFAULT_DOCS_COLLECTION_SLUG } from '../constants.js'

export type PayloadMarkdownDocsPageProps = {
  collectionSlug?: string
  renderSidebar?: boolean
  resolved: ResolvedPayloadMarkdownDocsRoute
}

const cx = (...values: (false | null | string | undefined)[]): string =>
  values.filter(Boolean).join(' ')

const renderSidebarItems = (
  items: PayloadMarkdownDocsSidebarItem[],
  activeRoute: string,
  depth = 0,
): ReactNode => {
  if (items.length === 0) {
    return null
  }

  return (
    <ul
      className={cx(
        depth === 0
          ? 'space-y-1'
          : 'ml-3 mt-1 space-y-1 border-l border-border pl-3',
      )}
    >
      {items.map((item) => (
        <li key={item.route}>
          <a
            className={cx(
              'block rounded-lg px-3 py-2 text-sm leading-5 transition-colors',
              item.route === activeRoute
                ? 'bg-cyan-400/10 text-cyan-200'
                : 'text-foreground/70 hover:bg-white/[0.04] hover:text-foreground',
            )}
            href={item.route}
          >
            {item.label}
          </a>
          {item.children
            ? renderSidebarItems(item.children, activeRoute, depth + 1)
            : null}
        </li>
      ))}
    </ul>
  )
}

const renderMarkdown = async ({
  collectionSlug,
  markdown,
}: {
  collectionSlug: string
  markdown?: string
}): Promise<ReactNode> => {
  if (!markdown?.trim()) {
    return null
  }

  const { MarkdownRenderer } = await import('@valkyrianlabs/payload-markdown/server')

  return MarkdownRenderer({
    className: 'min-w-0',
    collectionSlug,
    markdown,
    scope: 'field',
    size: 'md',
    variant: 'docs',
    wrapperClassName: 'min-w-0',
  })
}

const DocsHeader = ({
  doc,
  docsSet,
}: {
  doc?: ResolvedPayloadMarkdownDocsRecord
  docsSet: ResolvedPayloadMarkdownDocsSet
}) => {
  const description =
    doc?.overrides?.heroDescription ??
    doc?.description ??
    docsSet.defaults?.heroDescription ??
    docsSet.description
  const title =
    doc?.overrides?.heroTitle ??
    doc?.title ??
    docsSet.defaults?.heroTitle ??
    docsSet.title

  return (
    <header className="mb-10 border-b border-border pb-8">
      {docsSet.defaults?.heroEyebrow ? (
        <p className="mb-3 text-sm font-medium uppercase tracking-wide text-cyan-300">
          {docsSet.defaults.heroEyebrow}
        </p>
      ) : null}
      <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-4 max-w-3xl text-lg leading-8 text-foreground/70">
          {description}
        </p>
      ) : null}
    </header>
  )
}

export const PayloadMarkdownDocsPage = async ({
  collectionSlug = DEFAULT_DOCS_COLLECTION_SLUG,
  renderSidebar = true,
  resolved,
}: PayloadMarkdownDocsPageProps) => {
  if (resolved.type === 'docsGroupIndex') {
    return (
      <main
        className="min-h-screen bg-background text-foreground"
        data-payload-markdown-docs-route={resolved.route}
      >
        <div className="mx-auto w-full max-w-6xl px-6 py-14 lg:px-8">
          <header className="mb-10 border-b border-border pb-8">
            <p className="mb-3 text-sm font-medium uppercase tracking-wide text-cyan-300">
              Docs
            </p>
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
              {resolved.group.navTitle ?? resolved.group.title}
            </h1>
            {resolved.group.description ? (
              <p className="mt-4 max-w-3xl text-lg leading-8 text-foreground/70">
                {resolved.group.description}
              </p>
            ) : null}
          </header>
          {resolved.docsSets.length > 0 ? (
            <nav aria-label="Docs sets">
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {resolved.docsSets.map((docsSet) => (
                  <li key={docsSet.id}>
                    <a
                      className="block rounded-xl border border-border bg-white/[0.03] p-5 transition-colors hover:bg-white/[0.06]"
                      href={docsSet.routeBase}
                    >
                      <span className="text-base font-semibold text-foreground">
                        {docsSet.navTitle ?? docsSet.title}
                      </span>
                      {docsSet.description ? (
                        <span className="mt-2 block text-sm leading-6 text-foreground/65">
                          {docsSet.description}
                        </span>
                      ) : null}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
      </main>
    )
  }

  const markdown = await renderMarkdown({
    collectionSlug,
    markdown: resolved.doc?.content,
  })

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      data-payload-markdown-docs-route={resolved.route}
    >
      <div
        className={cx(
          'mx-auto grid w-full max-w-7xl gap-10 px-6 py-10 lg:px-8',
          renderSidebar && resolved.sidebar.length > 0
            ? 'lg:grid-cols-[16rem_minmax(0,1fr)]'
            : 'lg:grid-cols-[minmax(0,1fr)]',
        )}
      >
        {renderSidebar && resolved.sidebar.length > 0 ? (
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <nav
              aria-label="Docs navigation"
              className="rounded-xl border border-border bg-white/[0.03] p-3"
            >
              {renderSidebarItems(resolved.sidebar, resolved.route)}
            </nav>
          </aside>
        ) : null}
        <article className="min-w-0 max-w-4xl">
          <DocsHeader doc={resolved.doc} docsSet={resolved.docsSet} />
          {markdown}
        </article>
      </div>
    </main>
  )
}
