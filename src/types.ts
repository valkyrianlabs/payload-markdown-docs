export type PayloadMarkdownDocsConfig = {
  auth?: PayloadMarkdownDocsAuthConfig
  blocks?: DocsBlockInstallSelection
  collections?: PayloadMarkdownDocsCollectionsConfig
  enabled?: boolean
  endpoint?: PayloadMarkdownDocsEndpointConfig
  heroes?: DocsHeroInstallSelection
  pages?: PayloadMarkdownDocsPagesConfig
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
  heroes?: DocsHeroInstallSelection
  slug?: string
}

export type DocsMarketingBlockKey = 'docsCTA'

export type DocsBlockInstallSelection = boolean | Partial<Record<DocsMarketingBlockKey, boolean>>

export type DocsHeroInstallConfig = {
  enabled?: boolean
  fieldName?: string
  installIfMissing?: boolean
}

export type DocsHeroInstallSelection = boolean | DocsHeroInstallConfig

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

export type PayloadMarkdownDocsPagesConfig = {
  heroes?: DocsHeroInstallSelection
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
