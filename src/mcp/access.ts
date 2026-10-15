import type { PayloadRequest } from 'payload'

import { PAYLOAD_MARKDOWN_DOCS_MCP_CONTEXT_KEY } from '../payload/agentGuard.js'
import { isRecord } from '../shared/records.js'
import { DocsAgentError } from './errors.js'

/**
 * How the docs operations authorize a collection:
 *
 * - `user`: Payload access control for `req.user` only (operations always run with
 *   `overrideAccess: false`).
 * - `mcpApiKey`: additionally require the MCP API key's per-collection checkbox for the
 *   operation (`find`, `create`, `update`, `delete`), like the built-in MCP tools. Fails
 *   closed when no key permissions are on the request.
 */
export type DocsAgentAccessMode = 'mcpApiKey' | 'user'

export type DocsAgentOperation = 'create' | 'delete' | 'find' | 'update'

/** What `withPayloadMarkdownDocsMcp()` records on `req.context` for every MCP request. */
export type DocsMcpRequestState = {
  /**
   * The key's permission groups as the key grants them, before the built-in tools for
   * Git-owned collections were masked.
   */
  permissions: Record<string, Record<string, unknown>>
}

/** Same camel-casing @payloadcms/plugin-mcp uses for API key permission groups. */
export const toMcpPermissionKey = (slug: string): string =>
  slug
    .replace(/[-_\s]+(.)?/g, (_, char?: string) => (char ? char.toUpperCase() : ''))
    .replace(/^(.)/, (_, char: string) => char.toLowerCase())

export const readDocsMcpState = (req: PayloadRequest): DocsMcpRequestState | undefined => {
  const value = req.context?.[PAYLOAD_MARKDOWN_DOCS_MCP_CONTEXT_KEY]

  return isRecord(value) && isRecord(value.permissions) ? (value as DocsMcpRequestState) : undefined
}

/** Whether the request may run `operation` on `slug` (no throw). */
export const hasDocsAgentAccess = (
  req: PayloadRequest,
  slug: string,
  operation: DocsAgentOperation,
  mode: DocsAgentAccessMode,
): boolean => {
  if (!req.user) {
    return false
  }

  if (mode !== 'mcpApiKey') {
    return true
  }

  const permissions = readDocsMcpState(req)?.permissions[toMcpPermissionKey(slug)]

  return permissions?.[operation] === true
}

/** Throws `forbidden` unless the request may run `operation` on `slug`. */
export const assertDocsAgentAccess = (
  req: PayloadRequest,
  slug: string,
  operation: DocsAgentOperation,
  mode: DocsAgentAccessMode,
): void => {
  if (!req.user) {
    throw new DocsAgentError('forbidden', 'Not authenticated. The request has no Payload user.')
  }

  if (mode !== 'mcpApiKey') {
    return
  }

  if (!readDocsMcpState(req)) {
    throw new DocsAgentError(
      'forbidden',
      'MCP API key permissions are not available on this request. Register the tools with withPayloadMarkdownDocsMcp() (and keep its overrideAuth), or pass access: "user".',
    )
  }

  if (!hasDocsAgentAccess(req, slug, operation, mode)) {
    throw new DocsAgentError(
      'forbidden',
      `This MCP API key does not allow "${operation}" on "${slug}". Enable it on the key (Payload admin → MCP → API Keys). If the key has no checkbox for "${slug}", expose the collection in mcpPlugin({ collections }) — withPayloadMarkdownDocsMcp() does that for the slugs it knows (see its "collections" option).`,
    )
  }
}
