/**
 * `@valkyrianlabs/payload-markdown-docs/mcp`: MCP tools that let AI agents manage
 * Git-backed docs through `@payloadcms/plugin-mcp` (presentation fields, publishing,
 * versions, docs sets and groups, sync access, sync runs) without ever overwriting
 * content Git owns, plus the same operations as plain functions for custom agents.
 * Server-only. Does not import payload-markdown: compose with its `withPayloadMarkdownMcp()`.
 */
export {
  type DocsAgentWritePolicy,
  type DocsCollectionRole,
  getSyncOwnedDocsFields,
  isAgentRequest,
  PAYLOAD_MARKDOWN_DOCS_MCP_CONTEXT_KEY,
  PAYLOAD_MARKDOWN_DOCS_RESTORE_CONTEXT_KEY,
  SYNC_OWNED_DOCS_SET_FIELDS,
} from '../payload/agentGuard.js'
export { type DocsAgentAccessMode, type DocsAgentOperation, toMcpPermissionKey } from './access.js'
export { type DocsCollectionInfo, getDocsCollections } from './collections.js'
export {
  type DocsRecordSummary,
  type DocsSyncState,
  type DocsWriteResult,
  findDocs,
  type FindDocsOptions,
  setPublishStatus,
  type SetPublishStatusOptions,
  updateDocsRecord,
  type UpdateDocsRecordOptions,
} from './docs.js'
export {
  deleteDocsAccess,
  type DocsAccessSummary,
  listDocsAccess,
  type ListDocsAccessOptions,
  saveDocsAccess,
  type SaveDocsAccessOptions,
} from './docsAccess.js'
export { DocsAgentError, type DocsAgentErrorCode } from './errors.js'
export { type DocsGuideOptions, getDocsGuide } from './guide.js'
export { type PayloadMarkdownDocsMcpOptions, withPayloadMarkdownDocsMcp } from './options.js'
export {
  type DocsGroupSummary,
  type DocsSetSummary,
  getDocsStructure,
  saveDocsGroup,
  type SaveDocsGroupOptions,
  saveDocsSet,
  type SaveDocsSetOptions,
} from './structure.js'
export { findSyncRuns, type FindSyncRunsOptions, type SyncRunSummary } from './syncRuns.js'
export {
  PAYLOAD_MARKDOWN_DOCS_MCP_READ_ONLY_TOOLS,
  PAYLOAD_MARKDOWN_DOCS_MCP_TOOLS,
  type PayloadMarkdownDocsMcpPrompt,
  payloadMarkdownDocsMcpPrompts,
  type PayloadMarkdownDocsMcpTool,
  type PayloadMarkdownDocsMcpToolName,
  payloadMarkdownDocsMcpTools,
  type PayloadMarkdownDocsMcpToolsOptions,
} from './tools.js'
export {
  type DocsVersionDetail,
  type DocsVersionedRole,
  type DocsVersionSummary,
  listVersions,
  type ListVersionsOptions,
  readVersion,
  type ReadVersionOptions,
  restoreVersion,
  type RestoreVersionOptions,
} from './versions.js'
