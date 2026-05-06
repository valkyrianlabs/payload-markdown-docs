export type PayloadMarkdownDocsConfig = {
  auth?: PayloadMarkdownDocsAuthConfig
  collections?: PayloadMarkdownDocsCollectionsConfig
  enabled?: boolean
  endpoint?: PayloadMarkdownDocsEndpointConfig
  routing?: PayloadMarkdownDocsRoutingConfig
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
      mode: 'disabled'
    }
  | PayloadMarkdownDocsCombinedAuthConfig
  | PayloadMarkdownDocsEd25519AuthConfig
  | PayloadMarkdownDocsGitHubOidcAuthConfig

export type PayloadMarkdownDocsCombinedAuthConfig = {
  ed25519?: PayloadMarkdownDocsEd25519AuthOptions
  githubOidc?: PayloadMarkdownDocsGitHubOidcAuthOptions
  mode?: 'multi'
}

export type PayloadMarkdownDocsDocsSetAuthConfig = {
  ed25519?: PayloadMarkdownDocsEd25519AuthOptions
  githubOidc?: PayloadMarkdownDocsDocsSetGitHubOidcAuthOptions
}

export type PayloadMarkdownDocsDocsSetGitHubOidcAuthOptions =
  {
    enabled?: boolean
  } & Partial<PayloadMarkdownDocsGitHubOidcAuthOptions>

export type PayloadMarkdownDocsEd25519AuthConfig =
  {
    mode: 'ed25519'
  } & PayloadMarkdownDocsEd25519AuthOptions

export type PayloadMarkdownDocsEd25519AuthOptions = {
  keys: PayloadMarkdownDocsEd25519Key[]
  maxSkewSeconds?: number
  nonceTtlSeconds?: number
}

export type PayloadMarkdownDocsEd25519Key = {
  id: string
  publicKey: string
}

export type PayloadMarkdownDocsGitHubOidcAuthConfig =
  {
    mode: 'github-oidc'
  } & PayloadMarkdownDocsGitHubOidcAuthOptions

export type PayloadMarkdownDocsGitHubOidcAuthOptions = {
  allowedEnvironments?: string[]
  allowedRefs?: string[]
  allowedRepositories?: string[]
  allowedRepositoryOwners?: string[]
  allowedWorkflowRefs?: string[]
  allowedWorkflows?: string[]
  allowPullRequests?: boolean
  audience: string
  issuer?: string
  jwksUrl?: string
  maxSkewSeconds?: number
}

export type PayloadMarkdownDocsCollectionConfig = {
  enabled?: boolean
  slug?: string
}

export type PayloadMarkdownDocsCollectionsConfig = {
  docs?: PayloadMarkdownDocsCollectionConfig
  docsGroups?: PayloadMarkdownDocsCollectionConfig
  docsSets?: PayloadMarkdownDocsCollectionConfig
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
  allowHardDelete?: boolean
  allowPublish?: boolean
  allowWrites?: boolean
  defaultPublishMode?: 'draft' | 'preserve' | 'published'
  deleteBehavior?: 'archive' | 'delete' | 'draft' | 'ignore'
  requireDryRunBeforeApply?: boolean
}
