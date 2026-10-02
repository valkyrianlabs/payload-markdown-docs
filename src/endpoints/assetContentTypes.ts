/**
 * Content-type policy for synced docs assets (DOCS-4).
 *
 * Asset content types come from the manifest. Serving them verbatim let any sync
 * principal publish `text/html` (or SVG/XML) with script on the site origin. Assets are
 * text (the manifest carries strings), so only text formats the CLI produces are
 * accepted, and every served asset gets defensive headers.
 */

import { isAllowedDocsAssetContentType } from '../sync/index.js'

/** Inline-rendered types; everything else is served as an attachment. */
const INLINE_TYPES = new Set(['text/markdown', 'text/plain'])

export const getBaseContentType = (contentType: string): string =>
  contentType.split(';')[0]?.trim().toLowerCase() ?? ''

/**
 * Single source of truth: the shared protocol allowlist (`src/sync/assetContentTypes`,
 * pinned by contracts/vectors/content-types.json) — JSON, YAML, Markdown, plain text,
 * optionally `charset=utf-8`.
 */
export const isAllowedAssetContentType = (contentType: string): boolean =>
  isAllowedDocsAssetContentType(contentType)

export const ALLOWED_ASSET_CONTENT_TYPES_DESCRIPTION =
  'text/markdown, text/plain, application/json, application/yaml (optionally with charset=utf-8)'

/**
 * Content type used when serving a stored asset. Disallowed types (for example rows
 * stored before this policy existed) are served as plain text.
 */
export const toServedAssetContentType = (contentType: string): string =>
  isAllowedAssetContentType(contentType)
    ? `${getBaseContentType(contentType)}; charset=utf-8`
    : 'text/plain; charset=utf-8'

/** Headers every public docs asset / llms / skill response carries. */
export const SAFE_ASSET_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'X-Content-Type-Options': 'nosniff',
}

export const createSafeAssetHeaders = (contentType: string): Record<string, string> => ({
  'Cache-Control': 'no-store',
  ...SAFE_ASSET_HEADERS,
  'Content-Type': contentType,
  ...(INLINE_TYPES.has(getBaseContentType(contentType))
    ? {}
    : { 'Content-Disposition': 'attachment' }),
})
