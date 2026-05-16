export type PayloadMarkdownDocsConfig = {
  auth?: PayloadMarkdownDocsAuthConfig
  blocks?: DocsBlockInstallSelection
  collections?: PayloadMarkdownDocsCollectionsConfig
  enabled?: boolean
  endpoint?: PayloadMarkdownDocsEndpointConfig
  routing?: PayloadMarkdownDocsRoutingConfig
  seo?: boolean
  sync?: PayloadMarkdownDocsSyncConfig
  target?: PayloadMarkdownDocsTargetConfig
}

export type PayloadMarkdownDocsEndpointConfig = {
  maxBodyBytes?: number
  path?: string
}

export type PayloadMarkdownDocsAuthConfig =
  | {
      ed25519?: boolean | PayloadMarkdownDocsAuthToggle
      githubOidc?: boolean | PayloadMarkdownDocsAuthToggle
    }
  | {
      mode: 'disabled'
    }

export type PayloadMarkdownDocsAuthToggle = {
  enabled?: boolean
}

export type PayloadMarkdownDocsCollectionConfig = {
  blocks?: DocsBlockInstallSelection
  enabled?: boolean
  slug?: string
}

export type DocsMarketingBlockKey = 'banner' | 'callout' | 'cta' | 'preview'

export type DocsBlockInstallSelection = boolean | Partial<Record<DocsMarketingBlockKey, boolean>>

export type DocsCollectionInstallConfig = boolean | PayloadMarkdownDocsCollectionConfig

export type PayloadMarkdownDocsCollectionsConfig = {
  docs?: PayloadMarkdownDocsCollectionConfig
  docsAccess?: PayloadMarkdownDocsCollectionConfig
  docsAssets?: PayloadMarkdownDocsCollectionConfig
  docsGroups?: PayloadMarkdownDocsCollectionConfig
  docsSets?: PayloadMarkdownDocsCollectionConfig
  nonces?: PayloadMarkdownDocsCollectionConfig
  syncRuns?: PayloadMarkdownDocsCollectionConfig
} & Record<string, DocsCollectionInstallConfig | undefined>

export type PayloadMarkdownDocsPagesRoutingConfig = {
  allowBridgePages?: boolean
  bridgeField?: string
  collection?: string
  enabled?: boolean
  routeField?: string
}

export type PayloadMarkdownDocsRoutingConfig = {
  pages?: PayloadMarkdownDocsPagesRoutingConfig
}

export type PayloadMarkdownDocsTargetConfig = {
  enableDrafts?: boolean
  heroImage?: false | PayloadMarkdownDocsHeroImageConfig
  markdownField?: string
  slug?: string
  type?: 'docsCollection'
}

export type PayloadMarkdownDocsHeroImageConfig = {
  additionalMediaCollections?: string[]
}

export type PayloadMarkdownDocsSyncConfig = {
  allowHardDelete?: boolean
  allowPublish?: boolean
  allowWrites?: boolean
  deleteBehavior?: 'archive' | 'delete' | 'draft' | 'ignore'
  revalidate?: false | PayloadMarkdownDocsSyncRevalidateConfig
}

export type PayloadMarkdownDocsSyncRevalidateConfig = {
  paths?: boolean
  tags?: string[]
}
