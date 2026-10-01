import type { Access, CollectionConfig } from 'payload'

export type PayloadMarkdownDocsConfig = {
  /**
   * Access control for the plugin collections. By default only users of the Payload
   * admin user collection (`config.admin.user`) can manage docs, docs sets, groups,
   * assets, and sync access keys; sync runs and nonces are read-only.
   */
  access?: PayloadMarkdownDocsAccessConfig
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

export type PayloadMarkdownDocsAccessConfig = {
  /**
   * Decides who is a docs administrator for the plugin collections' default access.
   * Defaults to any logged-in user of the Payload admin user collection.
   */
  admin?: Access
}

export type PayloadMarkdownDocsCollectionConfig = {
  /**
   * Per-operation access overrides for a plugin-owned collection (docs, docsSets,
   * docsGroups, docsAssets, docsAccess, syncRuns, nonces). Replaces the default
   * admin-only rule for the listed operations.
   */
  access?: CollectionConfig['access']
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
  /**
   * Record a sync-run audit row for dry-run requests. Defaults to true. Set to false
   * to keep the sync-runs collection to applied syncs only; dry runs still consume
   * their nonce for replay protection.
   */
  auditDryRuns?: boolean
  deleteBehavior?: 'archive' | 'delete' | 'draft' | 'ignore'
  revalidate?: false | PayloadMarkdownDocsSyncRevalidateConfig
}

export type PayloadMarkdownDocsSyncRevalidateConfig = {
  paths?: boolean
  tags?: string[]
}
