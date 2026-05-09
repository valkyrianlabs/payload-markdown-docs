export type PayloadMarkdownDocsConfig = {
  auth?: PayloadMarkdownDocsAuthConfig
  collections?: PayloadMarkdownDocsCollectionsConfig
  enabled?: boolean
  endpoint?: PayloadMarkdownDocsEndpointConfig
  routing?: PayloadMarkdownDocsRoutingConfig
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
  enabled?: boolean
  slug?: string
}

export type PayloadMarkdownDocsCollectionsConfig = {
  docs?: PayloadMarkdownDocsCollectionConfig
  docsGroups?: PayloadMarkdownDocsCollectionConfig
  docsKeys?: PayloadMarkdownDocsCollectionConfig
  docsSets?: PayloadMarkdownDocsCollectionConfig
  docsTrusted?: PayloadMarkdownDocsCollectionConfig
  nonces?: PayloadMarkdownDocsCollectionConfig
  syncRuns?: PayloadMarkdownDocsCollectionConfig
}

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
  defaultPublishMode?: 'draft' | 'preserve' | 'published'
  deleteBehavior?: 'archive' | 'delete' | 'draft' | 'ignore'
  requireDryRunBeforeApply?: boolean
}
