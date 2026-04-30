export type PayloadMarkdownDocsConfig = {
  auth?: PayloadMarkdownDocsAuthConfig
  collections?: PayloadMarkdownDocsCollectionsConfig
  enabled?: boolean
  endpoint?: PayloadMarkdownDocsEndpointConfig
  sources?: PayloadMarkdownDocsSourceConfig[]
  sync?: PayloadMarkdownDocsSyncConfig
  target?: PayloadMarkdownDocsTargetConfig
}

export type PayloadMarkdownDocsEndpointConfig = {
  maxBodyBytes?: number
  path?: string
}

export type PayloadMarkdownDocsAuthConfig =
  | {
      keys: PayloadMarkdownDocsEd25519Key[]
      maxSkewSeconds?: number
      mode: 'ed25519'
      nonceTtlSeconds?: number
    }
  | {
      mode: 'disabled'
    }

export type PayloadMarkdownDocsEd25519Key = {
  id: string
  publicKey: string
}

export type PayloadMarkdownDocsCollectionConfig = {
  enabled?: boolean
  slug?: string
}

export type PayloadMarkdownDocsCollectionsConfig = {
  docs?: PayloadMarkdownDocsCollectionConfig
  nonces?: PayloadMarkdownDocsCollectionConfig
  syncRuns?: PayloadMarkdownDocsCollectionConfig
}

export type PayloadMarkdownDocsSourceConfig = {
  id: string
  root?: string
  routeBase: string
}

export type PayloadMarkdownDocsTargetConfig =
  | {
      collection: string
      markdownField: string
      routeField?: string
      type: 'existingCollection'
    }
  | {
      enableDrafts?: boolean
      markdownField?: string
      slug?: string
      type: 'docsCollection'
    }

export type PayloadMarkdownDocsSyncConfig = {
  defaultPublishMode?: 'draft' | 'preserve' | 'published'
  deleteBehavior?: 'archive' | 'delete' | 'draft' | 'ignore'
  requireDryRunBeforeApply?: boolean
}
