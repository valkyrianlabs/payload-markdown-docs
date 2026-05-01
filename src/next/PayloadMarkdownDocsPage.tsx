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

const renderSidebarItems = (items: PayloadMarkdownDocsSidebarItem[]): ReactNode => {
  if (items.length === 0) {
    return null
  }

  return (
    <ul>
      {items.map((item) => (
        <li key={item.route}>
          <a href={item.route}>{item.label}</a>
          {item.children ? renderSidebarItems(item.children) : null}
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
    collectionSlug,
    markdown,
    scope: 'field',
    size: 'md',
    variant: 'docs',
  })
}

const DocsHeader = ({
  doc,
  docsSet,
}: {
  doc?: ResolvedPayloadMarkdownDocsRecord
  docsSet: ResolvedPayloadMarkdownDocsSet
}) => (
  <header>
    {docsSet.defaults?.heroEyebrow ? <p>{docsSet.defaults.heroEyebrow}</p> : null}
    <h1>{doc?.overrides?.heroTitle ?? doc?.title ?? docsSet.defaults?.heroTitle ?? docsSet.title}</h1>
    {doc?.overrides?.heroDescription ?? doc?.description ?? docsSet.defaults?.heroDescription ?? docsSet.description ? (
      <p>
        {doc?.overrides?.heroDescription ??
          doc?.description ??
          docsSet.defaults?.heroDescription ??
          docsSet.description}
      </p>
    ) : null}
  </header>
)

export const PayloadMarkdownDocsPage = async ({
  collectionSlug = DEFAULT_DOCS_COLLECTION_SLUG,
  renderSidebar = true,
  resolved,
}: PayloadMarkdownDocsPageProps) => {
  if (resolved.type === 'docsGroupIndex') {
    return (
      <main data-payload-markdown-docs-route={resolved.route}>
        <header>
          <h1>{resolved.group.navTitle ?? resolved.group.title}</h1>
          {resolved.group.description ? <p>{resolved.group.description}</p> : null}
        </header>
        {resolved.docsSets.length > 0 ? (
          <nav aria-label="Docs sets">
            <ul>
              {resolved.docsSets.map((docsSet) => (
                <li key={docsSet.id}>
                  <a href={docsSet.routeBase}>{docsSet.navTitle ?? docsSet.title}</a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </main>
    )
  }

  const markdown = await renderMarkdown({
    collectionSlug,
    markdown: resolved.doc?.content,
  })

  return (
    <main data-payload-markdown-docs-route={resolved.route}>
      <DocsHeader doc={resolved.doc} docsSet={resolved.docsSet} />
      {renderSidebar && resolved.sidebar.length > 0 ? (
        <nav aria-label="Docs navigation">{renderSidebarItems(resolved.sidebar)}</nav>
      ) : null}
      {markdown}
    </main>
  )
}
