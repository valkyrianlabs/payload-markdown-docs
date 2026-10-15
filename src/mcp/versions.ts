import type { PayloadRequest } from 'payload'

import type { DocsAgentAccessMode } from './access.js'
import type { DocsCollectionInfo } from './collections.js'
import type { DocsSyncState } from './docs.js'

import { isSameFieldValue, PAYLOAD_MARKDOWN_DOCS_RESTORE_CONTEXT_KEY } from '../payload/agentGuard.js'
import { getRelationshipId, isRecord } from '../shared/records.js'
import { assertDocsAgentAccess } from './access.js'
import {
  adminUrl,
  assertUnchanged,
  clampLimit,
  loadRecord,
  localApi,
  requireDocsCollection,
  requireId,
} from './collections.js'
import { getDocsSyncState } from './docs.js'
import { DocsAgentError, toDocsAgentError } from './errors.js'

type Doc = Record<string, unknown>

/** Collections with an agent-facing version history. */
export type DocsVersionedRole = 'docs' | 'docsSets'

type BaseOptions = {
  access?: DocsAgentAccessMode
  /** `docs` (default) or `docsSets`. */
  collection?: DocsVersionedRole
  req: PayloadRequest
}

export type DocsVersionSummary = {
  autosave: boolean
  createdAt?: string
  /** Docs only: whether this version is exactly what Git sync wrote (restorable). */
  gitSnapshot?: boolean
  /** True for the newest version. */
  latest: boolean
  route?: string
  /** `draft` or `published`. */
  status?: string
  sync?: DocsSyncState
  title?: string
  updatedAt?: string
  versionId: number | string
}

export type DocsVersionDetail = {
  /** Top-level fields whose value differs from the current (latest) record. */
  changedFields: string[]
  /** Docs only, with `includeContent`. */
  content?: string
  /** Why the version cannot be restored, when it cannot. */
  notRestorable?: string
  parent: number | string
  restorable: boolean
  /** The version's field values (without the markdown content unless requested). */
  version: Doc
} & DocsVersionSummary

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined

const requireVersioned = (req: PayloadRequest, role: DocsVersionedRole): DocsCollectionInfo => {
  const collection = requireDocsCollection(req, role)

  if (!collection.versions) {
    throw new DocsAgentError(
      'no_versions',
      `"${collection.slug}" keeps no version history. Enable target.enableDrafts in payloadMarkdownDocs() to version generated docs.`,
    )
  }

  return collection
}

const isGitSnapshot = (sync: DocsSyncState | undefined): boolean =>
  sync !== undefined && !sync.contentDrift && !sync.fieldsDrift

const summarize = (
  collection: DocsCollectionInfo,
  entry: Doc,
  latestId: number | string | undefined,
): DocsVersionSummary => {
  const version = isRecord(entry.version) ? entry.version : {}
  const sync = collection.role === 'docs' ? getDocsSyncState(version, collection.markdownField ?? 'content') : undefined

  return {
    autosave: entry.autosave === true,
    ...(text(entry.createdAt) ? { createdAt: text(entry.createdAt) } : {}),
    ...(sync ? { gitSnapshot: isGitSnapshot(sync), sync } : {}),
    latest: entry.latest === true || (latestId !== undefined && String(entry.id) === String(latestId)),
    ...(text(version.route) ? { route: text(version.route) } : {}),
    ...(text(version._status) ? { status: text(version._status) } : {}),
    ...(text(version.title) ? { title: text(version.title) } : {}),
    ...(text(entry.updatedAt) ? { updatedAt: text(entry.updatedAt) } : {}),
    versionId: entry.id as number | string,
  }
}

const findVersion = async (
  req: PayloadRequest,
  collection: DocsCollectionInfo,
  versionId: number | string,
): Promise<Doc> => {
  try {
    return await localApi(req.payload).findVersionByID({
      id: versionId,
      collection: collection.slug,
      depth: 0,
      overrideAccess: false,
      req,
    })
  } catch (error) {
    const status = (error as { status?: number }).status

    if (status === 404) {
      throw new DocsAgentError('not_found', `No version "${versionId}" in "${collection.slug}".`)
    }

    throw toDocsAgentError(error, { action: 'read versions', collection: collection.slug })
  }
}

const VERSION_META_KEYS = new Set(['createdAt', 'id', 'updatedAt'])

export type ListVersionsOptions = {
  /** Record id whose versions to list. */
  id: number | string
  limit?: number
} & BaseOptions

/** Lists a record's versions, newest first. */
export const listVersions = async (
  options: ListVersionsOptions,
): Promise<{ adminUrl: string; totalVersions: number; versions: DocsVersionSummary[] }> => {
  const { access = 'user', req } = options
  const collection = requireVersioned(req, options.collection ?? 'docs')
  const id = requireId(options.id)

  assertDocsAgentAccess(req, collection.slug, 'find', access)

  let result: { docs: Doc[]; totalDocs: number }

  try {
    result = await localApi(req.payload).findVersions({
      collection: collection.slug,
      depth: 0,
      limit: clampLimit(options.limit, 10, 50),
      overrideAccess: false,
      req,
      sort: '-updatedAt',
      where: { parent: { equals: id } },
    })
  } catch (error) {
    throw toDocsAgentError(error, { action: 'read versions', collection: collection.slug })
  }

  const latestId = result.docs[0]?.id as number | string | undefined

  return {
    adminUrl: `${adminUrl(req, collection.slug, id)}/versions`,
    totalVersions: result.totalDocs,
    versions: result.docs.map((entry) => summarize(collection, entry, latestId)),
  }
}

export type ReadVersionOptions = {
  includeContent?: boolean
  versionId: number | string
} & BaseOptions

const notRestorableReason = (collection: DocsCollectionInfo, summary: DocsVersionSummary): string | undefined => {
  if (collection.role !== 'docs' || summary.gitSnapshot) {
    return undefined
  }

  return 'This version does not match what Git sync wrote (its content or frontmatter fields were edited outside Git), so restoring it would put non-Git content on the site.'
}

/** One version with the fields that differ from the current record. */
export const readVersion = async (options: ReadVersionOptions): Promise<DocsVersionDetail> => {
  const { access = 'user', req } = options
  const collection = requireVersioned(req, options.collection ?? 'docs')
  const versionId = requireId(options.versionId, 'versionId')

  assertDocsAgentAccess(req, collection.slug, 'find', access)

  const entry = await findVersion(req, collection, versionId)
  const version = isRecord(entry.version) ? entry.version : {}
  const parent = (getRelationshipId(entry.parent) ?? '') as number | string
  const current = await loadRecord({ id: parent, collection, req })
  const markdownField = collection.markdownField ?? 'content'
  const summary = summarize(collection, entry, undefined)
  const changedFields = collection.config.flattenedFields.flatMap((field) =>
    'name' in field && field.name && !VERSION_META_KEYS.has(field.name) && !isSameFieldValue(version[field.name], current[field.name])
      ? [field.name]
      : [],
  )
  const reason = notRestorableReason(collection, summary)
  const { [markdownField]: content, ...fields } = version

  return {
    ...summary,
    changedFields,
    ...(collection.role === 'docs' && options.includeContent ? { content: typeof content === 'string' ? content : '' } : {}),
    ...(reason ? { notRestorable: reason } : {}),
    parent,
    restorable: !reason,
    version: collection.role === 'docs' ? fields : version,
  }
}

export type RestoreVersionOptions = {
  /** `updatedAt` of the current record; refuses the restore if it changed since. */
  ifUpdatedAt?: string
  /** Restore as the published version instead of a new draft. */
  publish?: boolean
  versionId: number | string
} & BaseOptions

/**
 * Restores a previous version. For generated docs only versions that are exactly what Git
 * sync wrote can be restored (`not_git_snapshot` otherwise), so a rollback never puts
 * content on the site that did not come from Git. Restores as a draft unless `publish`.
 */
export const restoreVersion = async (
  options: RestoreVersionOptions,
): Promise<{ adminUrl: string; id: number | string; restoredVersionId: number | string; status: 'draft' | 'published'; updatedAt?: string }> => {
  const { access = 'user', req } = options
  const collection = requireVersioned(req, options.collection ?? 'docs')
  const versionId = requireId(options.versionId, 'versionId')

  assertDocsAgentAccess(req, collection.slug, 'update', access)

  const entry = await findVersion(req, collection, versionId)
  const parent = (getRelationshipId(entry.parent) ?? '') as number | string
  const summary = summarize(collection, entry, undefined)
  const reason = notRestorableReason(collection, summary)

  if (reason) {
    throw new DocsAgentError('not_git_snapshot', `${reason} Change the Markdown in Git and sync instead.`)
  }

  const current = await loadRecord({ id: parent, collection, req })

  assertUnchanged(current, options.ifUpdatedAt)

  const context = (req.context ??= {})
  const wasRestoring = 'isRestoringVersion' in context
  let restored: Doc

  context[PAYLOAD_MARKDOWN_DOCS_RESTORE_CONTEXT_KEY] = true

  try {
    restored = await localApi(req.payload).restoreVersion({
      id: versionId,
      collection: collection.slug,
      depth: 0,
      draft: !options.publish,
      overrideAccess: false,
      req,
    })
  } catch (error) {
    throw toDocsAgentError(error, { action: 'restore versions', collection: collection.slug })
  } finally {
    delete context[PAYLOAD_MARKDOWN_DOCS_RESTORE_CONTEXT_KEY]

    // Payload leaves this flag on the request; later operations must fill defaults again.
    if (!wasRestoring) {
      delete context.isRestoringVersion
    }
  }

  // Restoring a draft version live keeps its draft status; publish it as asked.
  if (options.publish && restored._status !== 'published') {
    try {
      restored = await localApi(req.payload).update({
        id: parent,
        collection: collection.slug,
        data: { _status: 'published' },
        depth: 0,
        draft: false,
        overrideAccess: false,
        req,
      })
    } catch (error) {
      throw toDocsAgentError(error, { action: 'publish', collection: collection.slug })
    }
  }

  return {
    id: parent,
    adminUrl: adminUrl(req, collection.slug, parent),
    restoredVersionId: versionId,
    status: options.publish ? 'published' : 'draft',
    ...(typeof restored.updatedAt === 'string' ? { updatedAt: restored.updatedAt } : {}),
  }
}
