import { DEFAULT_DOCS_ASSETS_COLLECTION_SLUG } from '../constants.js'

export const DOCS_ASSETS_STORAGE_UNAVAILABLE_MESSAGE = `Docs assets schema is missing.

The "${DEFAULT_DOCS_ASSETS_COLLECTION_SLUG}" collection/table has not been created yet.
Run Payload locally against this database, run your migrations, or run \`pnpm dev\`
with the production database connection long enough for Payload to create the new schema.

After the schema exists, re-run docs sync.`

export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const isDocsAssetsStorageUnavailableError = (error: unknown): boolean => {
  const message = getErrorMessage(error)

  return (
    message.includes('payload_markdown_docs_assets') ||
    message.includes(DEFAULT_DOCS_ASSETS_COLLECTION_SLUG)
  )
}
