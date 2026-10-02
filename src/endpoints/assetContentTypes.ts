/**
 * Content-type policy for synced docs assets (DOCS-4).
 *
 * Asset content types come from the manifest. Serving them verbatim let any sync
 * principal publish `text/html` (or SVG/XML) with script on the site origin. Assets are
 * text (the manifest carries strings), so only text formats the CLI produces are
 * accepted, and every served asset gets defensive headers.
 */

const TEXT_TYPES = ['text/markdown', 'text/plain']
const DATA_TYPES = ['application/json', 'application/yaml', 'application/x-yaml', 'text/yaml']

export const ALLOWED_ASSET_CONTENT_TYPES: Record<string, string[]> = {
  llms: TEXT_TYPES,
  'llms-full': TEXT_TYPES,
  skill: [...TEXT_TYPES, ...DATA_TYPES],
  static: [...TEXT_TYPES, ...DATA_TYPES, 'text/csv'],
}

const INLINE_TYPES = new Set(TEXT_TYPES)

export const getBaseContentType = (contentType: string): string =>
  contentType.split(';')[0]?.trim().toLowerCase() ?? ''

export const isAllowedAssetContentType = (kind: string, contentType: string): boolean =>
  (ALLOWED_ASSET_CONTENT_TYPES[kind] ?? []).includes(getBaseContentType(contentType))

/**
 * Content type used when serving a stored asset. Disallowed types (for example rows
 * stored before this policy existed) are served as plain text.
 */
export const toServedAssetContentType = (kind: string, contentType: string): string =>
  isAllowedAssetContentType(kind, contentType)
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
