import type { CSSProperties, ReactNode } from 'react'

import type {
  PayloadMarkdownDocsHeroImage,
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

const docsLayoutStyles = `
[data-payload-markdown-docs-layout] {
  display: grid;
  gap: 2.5rem;
  grid-template-columns: minmax(0, 1fr);
}

@media (min-width: 1024px) {
  [data-payload-markdown-docs-layout="with-sidebar"] {
    grid-template-columns: 16rem minmax(0, 1fr);
  }
}
`

const getDocsLayoutStyle = (hasHero: boolean): CSSProperties =>
  hasHero
    ? {}
    : {
        marginTop: '6rem',
      }

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
      className={cx(depth === 0 ? 'space-y-1' : 'ml-3 mt-1 space-y-1 border-l border-border pl-3')}
    >
      {items.map((item) => {
        const isActive = item.route === activeRoute
        const labelClassName = cx(
          'block rounded-lg px-3 py-2 text-sm leading-5 transition-colors',
          item.route
            ? isActive
              ? 'bg-cyan-400/10 text-cyan-200'
              : 'text-foreground/70 hover:bg-white/[0.04] hover:text-foreground'
            : 'text-foreground/55',
        )

        return (
          <li key={item.route ?? item.sourcePath}>
            {item.route ? (
              <a className={labelClassName} href={item.route}>
                {item.label}
              </a>
            ) : (
              <span className={labelClassName}>{item.label}</span>
            )}
            {item.children ? renderSidebarItems(item.children, activeRoute, depth + 1) : null}
          </li>
        )
      })}
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

const isIndexDoc = (doc?: ResolvedPayloadMarkdownDocsRecord): boolean => {
  if (!doc) {
    return false
  }

  const sourcePath = doc.sourcePath.toLowerCase()

  return sourcePath === 'index.md' || sourcePath.endsWith('/index.md')
}

const shouldRenderGeneratedHeader = (doc?: ResolvedPayloadMarkdownDocsRecord): boolean =>
  !doc?.content?.trim() || !isIndexDoc(doc)

const DocsHeader = ({
  doc,
  docsSet,
}: {
  doc?: ResolvedPayloadMarkdownDocsRecord
  docsSet: ResolvedPayloadMarkdownDocsSet
}) => {
  const description = doc?.description ?? docsSet.description
  const title = doc?.title ?? docsSet.title

  return (
    <header className="mb-10 border-b border-border pb-8">
      <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">{title}</h1>
      {description ? (
        <p className="mt-4 max-w-3xl text-lg leading-8 text-foreground/70">{description}</p>
      ) : null}
    </header>
  )
}

const DocsHero = ({
  heroImage,
  title,
}: {
  heroImage?: PayloadMarkdownDocsHeroImage
  title: string
}) => {
  if (!heroImage) {
    return null
  }

  return (
    <figure
      className="mb-10 overflow-hidden rounded-xl border border-border bg-white/[0.03]"
      data-payload-markdown-docs-hero
      style={{
        borderRadius: '0.75rem',
        marginBottom: '2.5rem',
        overflow: 'hidden',
      }}
    >
      <img
        alt={heroImage.alt ?? title}
        className="block h-auto w-full"
        height={heroImage.height}
        src={heroImage.url}
        style={{
          display: 'block',
          height: 'auto',
          width: '100%',
        }}
        width={heroImage.width}
      />
    </figure>
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
            <p className="mb-3 text-sm font-medium uppercase tracking-wide text-cyan-300">Docs</p>
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
              {resolved.group.navTitle ?? resolved.group.title}
            </h1>
            {resolved.group.description ? (
              <p className="mt-4 max-w-3xl text-lg leading-8 text-foreground/70">
                {resolved.group.description}
              </p>
            ) : null}
          </header>
          {resolved.childGroups.length > 0 || resolved.docsSets.length > 0 ? (
            <nav aria-label="Docs groups and sets">
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {resolved.childGroups.map((group) => (
                  <li key={group.id}>
                    <a
                      className="block rounded-xl border border-border bg-white/[0.03] p-5 transition-colors hover:bg-white/[0.06]"
                      href={group.routePath}
                    >
                      <span className="text-base font-semibold text-foreground">
                        {group.navTitle ?? group.title}
                      </span>
                      {group.description ? (
                        <span className="mt-2 block text-sm leading-6 text-foreground/65">
                          {group.description}
                        </span>
                      ) : null}
                    </a>
                  </li>
                ))}
                {resolved.docsSets.map((docsSet) => (
                  <li key={docsSet.id}>
                    <div className="rounded-xl border border-border bg-white/[0.03] p-5 transition-colors hover:bg-white/[0.06]">
                      <a
                        className="block"
                        href={
                          docsSet.routeMode === 'product-nested'
                            ? docsSet.productRoute
                            : docsSet.routeBase
                        }
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
                      {docsSet.routeMode === 'product-nested' ? (
                        <a
                          className="mt-4 inline-flex text-sm font-medium text-cyan-300 hover:text-cyan-200"
                          href={docsSet.routeBase}
                        >
                          Documentation
                        </a>
                      ) : null}
                    </div>
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
  const hasHero = Boolean(resolved.doc?.heroImage)
  const hasSidebar = renderSidebar && resolved.sidebar.length > 0
  const renderGeneratedHeader = shouldRenderGeneratedHeader(resolved.doc)

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      data-payload-markdown-docs-route={resolved.route}
    >
      <style>{docsLayoutStyles}</style>
      <div
        className="mx-auto w-full max-w-7xl px-6 py-10 lg:px-8"
        data-payload-markdown-docs-layout={hasSidebar ? 'with-sidebar' : 'default'}
        style={getDocsLayoutStyle(hasHero)}
      >
        {hasSidebar ? (
          <aside
            className="lg:sticky lg:top-8 lg:self-start"
            style={{
              alignSelf: 'start',
            }}
          >
            <nav
              aria-label="Docs navigation"
              className="rounded-xl border border-border bg-white/[0.03] p-3"
            >
              {renderSidebarItems(resolved.sidebar, resolved.route)}
            </nav>
          </aside>
        ) : null}
        <article className="min-w-0 max-w-4xl">
          <DocsHero
            heroImage={resolved.doc?.heroImage}
            title={resolved.doc?.title ?? resolved.docsSet.title}
          />
          {renderGeneratedHeader ? (
            <DocsHeader doc={resolved.doc} docsSet={resolved.docsSet} />
          ) : null}
          {markdown}
        </article>
      </div>
    </main>
  )
}
