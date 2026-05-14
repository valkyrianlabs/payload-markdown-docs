import { DEFAULT_DOCS_ASSETS_COLLECTION_SLUG } from '../constants.js'

export const DOCS_ASSETS_STORAGE_UNAVAILABLE_MESSAGE = `Docs assets schema is missing. Run Payload database migrations for the "${DEFAULT_DOCS_ASSETS_COLLECTION_SLUG}" collection before serving or syncing llms.txt and skill assets. If your project relies on Payload dev-time schema creation, run your app's Payload dev command, for example \`pnpm dev\`, against the target database once so Payload can create the new table.`

export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const isDocsAssetsStorageUnavailableError = (error: unknown): boolean => {
  const message = getErrorMessage(error)

  return (
    message.includes('payload_markdown_docs_assets') ||
    message.includes(DEFAULT_DOCS_ASSETS_COLLECTION_SLUG)
  )
}
