import { DEFAULT_DOCS_ASSETS_COLLECTION_SLUG } from '../constants.js'

export const DOCS_ASSETS_STORAGE_UNAVAILABLE_MESSAGE = `Docs assets schema is missing.

The "${DEFAULT_DOCS_ASSETS_COLLECTION_SLUG}" collection/table has not been created yet.
Run Payload locally against this database, run your migrations, or run \`pnpm dev\`
with the production database connection long enough for Payload to create the new schema.

After the schema exists, re-run docs sync.`

export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const MISSING_TABLE_PATTERNS = [
  // Postgres: relation "payload_markdown_docs_assets" does not exist
  /relation "?[\w.]*payload_markdown_docs_assets\w*"? does not exist/i,
  // SQLite: no such table: payload_markdown_docs_assets
  /no such table:?\s*"?[\w.]*payload_markdown_docs_assets/i,
]

const getErrorChain = (error: unknown): unknown[] => {
  const chain: unknown[] = []
  let current: unknown = error

  while (current && chain.length < 5) {
    chain.push(current)
    current = (current as { cause?: unknown }).cause
  }

  return chain
}

/**
 * True only when the docs assets table itself is missing (schema not migrated). Other
 * errors that merely mention the collection, such as validation or unique-constraint
 * failures on it, are not storage errors (DOCS-17).
 */
export const isDocsAssetsStorageUnavailableError = (error: unknown): boolean =>
  getErrorChain(error).some((entry) => {
    const message = getErrorMessage(entry)

    return MISSING_TABLE_PATTERNS.some((pattern) => pattern.test(message))
  })
