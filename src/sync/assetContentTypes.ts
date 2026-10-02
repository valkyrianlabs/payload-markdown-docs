/**
 * The fixed set of asset content types emitted by docs package clients
 * (`pmdocs`). Pinned by `contracts/vectors/content-types.json`.
 */
export const DOCS_ASSET_CONTENT_TYPES = {
  json: 'application/json; charset=utf-8',
  markdown: 'text/markdown; charset=utf-8',
  plain: 'text/plain; charset=utf-8',
  yaml: 'application/yaml; charset=utf-8',
} as const

export type DocsAssetContentType =
  (typeof DOCS_ASSET_CONTENT_TYPES)[keyof typeof DOCS_ASSET_CONTENT_TYPES]

const allowedMediaTypes = new Set(['application/json', 'application/yaml', 'text/markdown', 'text/plain'])

/** Maps an asset path to its content type by (ASCII case-insensitive) extension. */
export const getDocsAssetContentTypeForPath = (path: string): DocsAssetContentType => {
  const fileName = path.split('/').at(-1) ?? ''
  const dotIndex = fileName.lastIndexOf('.')
  const extension = dotIndex > 0 ? fileName.slice(dotIndex).replace(/[A-Z]/g, (c) => c.toLowerCase()) : ''

  switch (extension) {
    case '.json':
      return DOCS_ASSET_CONTENT_TYPES.json
    case '.md':
      return DOCS_ASSET_CONTENT_TYPES.markdown
    case '.yaml':
    case '.yml':
      return DOCS_ASSET_CONTENT_TYPES.yaml
    default:
      return DOCS_ASSET_CONTENT_TYPES.plain
  }
}

/**
 * True when a manifest content type is one of the allowlisted media types,
 * optionally with `charset=utf-8`. Servers can use this to refuse or
 * normalise anything else (for example `text/html`) before serving assets.
 */
export const isAllowedDocsAssetContentType = (value: string): boolean => {
  const [mediaType = '', ...parameters] = value.split(';').map((part) => part.trim().toLowerCase())

  if (!allowedMediaTypes.has(mediaType)) {
    return false
  }

  return parameters.every((parameter) => parameter === 'charset=utf-8')
}
