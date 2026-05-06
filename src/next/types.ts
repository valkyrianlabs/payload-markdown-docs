import type { DocsAiExportManifest } from '../sync/index.js'

export type PayloadMarkdownDocsFindArgs = {
  collection: string
  depth?: number
  limit?: number
  overrideAccess?: boolean
  sort?: string
  where?: unknown
}

export type PayloadMarkdownDocsReadPayload = {
  find: (args: PayloadMarkdownDocsFindArgs) => Promise<{
    docs: unknown[]
  }>
}

export type PayloadMarkdownDocsCollectionSlugs = {
  docs?: string
  docsGroups?: string
  docsSets?: string
}

export type ResolvePayloadMarkdownDocsRouteOptions = {
  collections?: PayloadMarkdownDocsCollectionSlugs
  includeDrafts?: boolean
  markdownField?: string
  overrideAccess?: boolean
  path?: string
  payload: PayloadMarkdownDocsReadPayload
  slug?: string | string[]
}

export type PayloadMarkdownDocsDefaults = {
  heroDescription?: string
  heroEyebrow?: string
  heroTitle?: string
  seoDescription?: string
  seoTitle?: string
  sidebarMode?: 'auto' | 'hidden' | 'manual'
  theme?: string
}

export type PayloadMarkdownDocsOverrides = {
  heroDescription?: string
  heroEyebrow?: string
  heroTitle?: string
  hideFromNav?: boolean
  navTitle?: string
  seoDescription?: string
  seoTitle?: string
  theme?: string
}

export type ResolvedPayloadMarkdownDocsSet = {
  aiExport?: DocsAiExportManifest
  defaults?: PayloadMarkdownDocsDefaults
  description?: string
  id: string
  navTitle?: string
  order: number
  routeBase: string
  slug?: string
  sourceId?: string
  sourceRoot?: string
  title: string
}

export type ResolvedPayloadMarkdownDocsGroup = {
  description?: string
  id: string
  navTitle?: string
  order: number
  routePath: string
  serveIndex: boolean
  slug?: string
  title: string
}

export type ResolvedPayloadMarkdownDocsRecord = {
  archived: boolean
  content?: string
  depth: number
  description?: string
  docsSetId?: string
  id: string
  navTitle?: string
  order: number
  overrides?: PayloadMarkdownDocsOverrides
  route: string
  sourceHash?: string
  sourcePath: string
  status?: 'draft' | 'published'
  title: string
}

export type PayloadMarkdownDocsSidebarItem = {
  children?: PayloadMarkdownDocsSidebarItem[]
  depth: number
  hidden?: boolean
  label: string
  order: number
  route: string
  sourcePath: string
}

export type ResolvedPayloadMarkdownDocsRoute =
  | {
      doc: ResolvedPayloadMarkdownDocsRecord
      docsSet: ResolvedPayloadMarkdownDocsSet
      route: string
      sidebar: PayloadMarkdownDocsSidebarItem[]
      type: 'doc'
    }
  | {
      doc?: ResolvedPayloadMarkdownDocsRecord
      docsSet: ResolvedPayloadMarkdownDocsSet
      route: string
      sidebar: PayloadMarkdownDocsSidebarItem[]
      type: 'docsSetIndex'
    }
  | {
      docsSets: ResolvedPayloadMarkdownDocsSet[]
      group: ResolvedPayloadMarkdownDocsGroup
      route: string
      type: 'docsGroupIndex'
    }

export type PayloadMarkdownDocsMetadata = {
  description?: string
  title?: string
}
