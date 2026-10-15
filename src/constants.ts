import { PAYLOAD_MARKDOWN_DOCS_PACKAGE } from './package.js'

export const DEFAULT_DOCS_ASSETS_COLLECTION_SLUG = 'payload-markdown-docs-assets'
export const DEFAULT_DOCS_ACCESS_COLLECTION_SLUG = 'docs-access'
export const DEFAULT_DOCS_COLLECTION_SLUG = 'docs'
export const DEFAULT_DOCS_GROUPS_COLLECTION_SLUG = 'docs-groups'
export const DEFAULT_DOCS_ROUTE_BASE = '/docs'
export const DEFAULT_DOCS_SETS_COLLECTION_SLUG = 'docs-sets'
export const DEFAULT_DOCS_SYNC_NONCES_COLLECTION_SLUG = 'docs-sync-nonces'
export const DEFAULT_DOCS_SYNC_RUNS_COLLECTION_SLUG = 'docs-sync-runs'
export const DEFAULT_DOCS_SYNC_ENDPOINT_PATH = '/documentation/sync'
export const DEFAULT_MARKDOWN_FIELD_NAME = 'content'
export const DEFAULT_MEDIA_COLLECTION_SLUG = 'media'
/** Import-map specifier of the docs set manager (under the installed package name). */
export const DOCS_SET_MANAGER_COMPONENT = `${PAYLOAD_MARKDOWN_DOCS_PACKAGE}/admin#DocsSetManager`
export const DEFAULT_PAGES_BRIDGE_FIELD = 'docsBridge'
export const DEFAULT_PAGES_COLLECTION_SLUG = 'pages'
export const DEFAULT_PAGES_ROUTE_FIELD = 'slug'
export const DEFAULT_MAX_DOCS_FILE_BYTES = 500_000
export const DEFAULT_MAX_DOCS_FILES = 500
export const DEFAULT_MAX_DOCS_TOTAL_BYTES = 5_000_000
export const DEFAULT_MAX_BODY_BYTES = 5_000_000
export const DEFAULT_MAX_SKEW_SECONDS = 300
export const DEFAULT_NONCE_TTL_SECONDS = 600
export const DEFAULT_GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com'
export const MANAGED_BY = 'payload-markdown-docs'
export const DOCS_GLOBALS_ADMIN_GROUP = 'Documentation'
/**
 * Next.js cache tag carried by the cached docs nav query (`getPayloadMarkdownDocsNavItems`)
 * and, through it, by every prerendered page that rendered the nav. The plugin expires it
 * whenever docs sets or docs groups change and after every applied sync.
 */
export const PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG = 'payload-markdown-docs:nav'
/** Tags the plugin expires after a sync or a docs set / docs group change (unless configured). */
export const DEFAULT_DOCS_REVALIDATE_TAGS = [
  'payload-markdown-docs',
  'payload-markdown-docs:docs',
  'sitemap',
  'sitemap:docs',
]
