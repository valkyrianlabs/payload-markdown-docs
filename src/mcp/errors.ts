import { SYNC_OWNED_ERROR_CODE } from '../payload/agentGuard.js'
import { isRecord } from '../shared/records.js'

export type DocsAgentErrorCode =
  | 'conflict'
  | 'forbidden'
  | 'invalid_input'
  | 'locked'
  | 'no_drafts'
  | 'no_versions'
  | 'not_enabled'
  | 'not_found'
  | 'not_git_snapshot'
  | 'sync_owned'

/** A failure the MCP tools report as `{ error: code, message, details? }`. */
export class DocsAgentError extends Error {
  code: DocsAgentErrorCode
  details?: unknown

  constructor(code: DocsAgentErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'DocsAgentError'
    this.code = code
    this.details = details
  }
}

/** Maps a Payload Local API error to a `DocsAgentError`; unknown errors pass through. */
export const toDocsAgentError = (
  error: unknown,
  { action, collection }: { action: string; collection: string },
): unknown => {
  if (error instanceof DocsAgentError) {
    return error
  }

  const status = (error as { status?: unknown }).status
  const name = (error as { name?: unknown }).name
  const data = (error as { data?: unknown }).data
  const message = error instanceof Error ? error.message : String(error)

  if (isRecord(data) && data.code === SYNC_OWNED_ERROR_CODE) {
    return new DocsAgentError('sync_owned', message, { fields: data.fields })
  }

  if (status === 423 || name === 'Locked') {
    return new DocsAgentError(
      'locked',
      `${message} Someone has this document open. Ask the user before retrying with overrideLock: true.`,
    )
  }

  if (status === 403 || name === 'Forbidden') {
    return new DocsAgentError('forbidden', `Not allowed to ${action} in "${collection}".`)
  }

  if (status === 404 || name === 'NotFound') {
    return new DocsAgentError('not_found', `Not found in "${collection}".`)
  }

  if (status === 400 || name === 'ValidationError') {
    return new DocsAgentError(
      'invalid_input',
      message,
      isRecord(data) && Array.isArray(data.errors) ? { errors: data.errors } : undefined,
    )
  }

  return error
}
