import type { CollectionSlug, Payload } from 'payload'

export type PayloadMarkdownDocsFindArgs = Parameters<Payload['find']>[0]

export type PayloadMarkdownDocsReadPayload = Pick<Payload, 'find'>

export type PayloadMarkdownDocsRoutePathInput = string | string[]

export type PayloadMarkdownDocsCollectionSlugs = {
  docs?: CollectionSlug
  docsAssets?: CollectionSlug
  docsGroups?: CollectionSlug
  docsSets?: CollectionSlug
}

export type ResolvePayloadMarkdownDocsRouteOptions = {
  collections?: PayloadMarkdownDocsCollectionSlugs
  includeDrafts?: boolean
  markdownField?: string
  overrideAccess?: boolean
  /**
   * Route path to resolve. Accepts a normalized path string, a single dynamic
   * route segment, or a Next catch-all route segment array.
   */
  path?: PayloadMarkdownDocsRoutePathInput
  payload: PayloadMarkdownDocsReadPayload
  /**
   * @deprecated Use `path` instead. It accepts both string and string[] route
   * inputs.
   */
  slug?: string | string[]
}

export type PayloadMarkdownDocsDefaults = {
  sidebarMode?: 'auto' | 'hidden' | 'manual'
}

export type PayloadMarkdownDocsOverrides = {
  hideFromNav?: boolean
  navTitle?: string
}

export type PayloadMarkdownDocsHeroImage = {
  alt?: string
  height?: number
  id?: string
  relationTo?: string
  url: string
  width?: number
}

export type PayloadMarkdownDocsOpenGraphImage = {
  alt?: string
  height?: number
  id?: string
  relationTo?: string
  url: string
  width?: number
}

export type PayloadMarkdownDocsOpenGraph = {
  description?: string
  image?: PayloadMarkdownDocsOpenGraphImage
  title?: string
}

export type PayloadMarkdownDocsGroupPageMode = 'auto' | 'custom'

export type PayloadMarkdownDocsRouteMode = 'docs-root' | 'product-nested'

export type ResolvedPayloadMarkdownDocsSet = {
  defaults?: PayloadMarkdownDocsDefaults
  description?: string
  id: string
  navTitle?: string
  openGraph?: PayloadMarkdownDocsOpenGraph
  order: number
  productRoute: string
  routeBase: string
  routeMode: PayloadMarkdownDocsRouteMode
  slug?: string
  status?: 'draft' | 'published'
  title: string
}

export type ResolvedPayloadMarkdownDocsGroup = {
  description?: string
  id: string
  navTitle?: string
  order: number
  pageMode: PayloadMarkdownDocsGroupPageMode
  routePath: string
  slug?: string
  title: string
}

export type ResolvedPayloadMarkdownDocsRecord = {
  archived: boolean
  content?: string
  dependencies?: string[]
  depth: number
  description?: string
  docsSetId?: string
  heroImage?: PayloadMarkdownDocsHeroImage
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
  route?: string
  sourcePath: string
}

export type ResolvedPayloadMarkdownDocsRoute =
  | {
      childGroups: ResolvedPayloadMarkdownDocsGroup[]
      docsSets: ResolvedPayloadMarkdownDocsSet[]
      group: ResolvedPayloadMarkdownDocsGroup
      route: string
      type: 'docsGroupIndex'
    }
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

export type PayloadMarkdownDocsMetadataImage = {
  alt?: string
  height?: number
  url: string
  width?: number
}

export type PayloadMarkdownDocsMetadata = {
  description?: string
  openGraph?: {
    description?: string
    images?: PayloadMarkdownDocsMetadataImage[]
    title?: string
  }
  title?: string
  twitter?: {
    card?: 'summary' | 'summary_large_image'
    description?: string
    images?: PayloadMarkdownDocsMetadataImage[]
    title?: string
  }
}
