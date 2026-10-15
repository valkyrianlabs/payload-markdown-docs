import type { PayloadRequest, Where } from 'payload'

import type { DocsAgentAccessMode } from './access.js'
import type { DocsCollectionInfo } from './collections.js'

import { computeDocsFieldsHash } from '../payload/docsData.js'
import { getDocsRecordLifecycleStatus, notArchivedWhere } from '../payload/visibility.js'
import { getRelationshipId, isRecord } from '../shared/records.js'
import { sha256Hex } from '../sync/hash.js'
import { assertDocsAgentAccess } from './access.js'
import {
  adminUrl,
  assertUnchanged,
  assertWritableData,
  clampLimit,
  combineWhere,
  editableFieldNames,
  loadRecord,
  localApi,
  requireDocsCollection,
  requireId,
} from './collections.js'
import { DocsAgentError, toDocsAgentError } from './errors.js'

type Doc = Record<string, unknown>

type BaseOptions = {
  /** Default `user`. The MCP tools use `mcpApiKey`. */
  access?: DocsAgentAccessMode
  req: PayloadRequest
}

/** Whether a generated doc still matches what the last sync wrote. */
export type DocsSyncState = {
  /** The content differs from the last sync (the next sync reports a conflict). */
  contentDrift: boolean
  /** title / description / navTitle / order differ from the last sync. */
  fieldsDrift: boolean
  lastSyncedAt?: string
  lastSyncRunId?: string
  managedBy?: string
  sourceId?: string
}

export type DocsRecordSummary = {
  adminUrl: string
  archived: boolean
  content?: string
  contentChars: number
  docsSet?: string
  /** Admin-owned fields agents may change with docsUpdate, and their current values. */
  editable: Record<string, unknown>
  id: number | string
  /** `archived`, `draft`, `published`, or `synced` (no drafts). */
  lifecycle: string
  navTitle?: string
  route?: string
  sourcePath?: string
  status?: string
  sync: DocsSyncState
  title?: string
  updatedAt?: string
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined

/** Git snapshot check shared by docsFind and the version tools. */
export const getDocsSyncState = (doc: Doc, markdownField: string): DocsSyncState => {
  const sync = isRecord(doc.sync) ? doc.sync : {}
  const content = typeof doc[markdownField] === 'string' ? (doc[markdownField]) : ''
  const fieldsHash = text(sync.fieldsHashAtLastSync)

  return {
    contentDrift: text(sync.contentHashAtLastSync) !== sha256Hex(content),
    fieldsDrift:
      fieldsHash !== undefined &&
      fieldsHash !==
        computeDocsFieldsHash({
          description: typeof doc.description === 'string' ? doc.description : null,
          navTitle: typeof doc.navTitle === 'string' ? doc.navTitle : null,
          order: typeof doc.order === 'number' ? doc.order : null,
          title: typeof doc.title === 'string' ? doc.title : null,
        }),
    ...(text(sync.lastSyncedAt) ? { lastSyncedAt: text(sync.lastSyncedAt) } : {}),
    ...(getRelationshipId(sync.lastSyncRunId) ? { lastSyncRunId: getRelationshipId(sync.lastSyncRunId) } : {}),
    ...(text(sync.managedBy) ? { managedBy: text(sync.managedBy) } : {}),
    ...(text(sync.sourceId) ? { sourceId: text(sync.sourceId) } : {}),
  }
}

const markdownFieldOf = (collection: DocsCollectionInfo): string => collection.markdownField ?? 'content'

export const summarizeDocsRecord = ({
  collection,
  doc,
  includeContent,
  req,
}: {
  collection: DocsCollectionInfo
  doc: Doc
  includeContent: boolean
  req: PayloadRequest
}): DocsRecordSummary => {
  const markdownField = markdownFieldOf(collection)
  const content = typeof doc[markdownField] === 'string' ? (doc[markdownField]) : ''
  const id = doc.id as number | string

  return {
    id,
    adminUrl: adminUrl(req, collection.slug, id),
    archived: isRecord(doc.sync) && doc.sync.archived === true,
    ...(includeContent ? { content } : {}),
    contentChars: content.length,
    ...(getRelationshipId(doc.docsSet) ? { docsSet: getRelationshipId(doc.docsSet) } : {}),
    editable: Object.fromEntries(editableFieldNames(collection).map((name) => [name, doc[name] ?? null])),
    lifecycle: getDocsRecordLifecycleStatus(doc),
    ...(text(doc.navTitle) ? { navTitle: text(doc.navTitle) } : {}),
    ...(text(doc.route) ? { route: text(doc.route) } : {}),
    ...(text(doc.sourcePath) ? { sourcePath: text(doc.sourcePath) } : {}),
    ...(text(doc._status) ? { status: text(doc._status) } : {}),
    sync: getDocsSyncState(doc, markdownField),
    ...(text(doc.title) ? { title: text(doc.title) } : {}),
    ...(text(doc.updatedAt) ? { updatedAt: text(doc.updatedAt) } : {}),
  }
}

/** A docs set given by id or slug, as an id. */
const resolveDocsSetId = async (req: PayloadRequest, docsSet: number | string): Promise<number | string> => {
  const sets = requireDocsCollection(req, 'docsSets')
  // Only compare ids of the database's id type: a slug is not a numeric id.
  const numericIds = req.payload.db.defaultIDType === 'number'
  const value = String(docsSet)
  const asId = numericIds ? (/^\d+$/.test(value) ? Number(value) : undefined) : value
  const result = await localApi(req.payload).find({
    collection: sets.slug,
    depth: 0,
    draft: sets.drafts,
    limit: 1,
    overrideAccess: false,
    req,
    where: {
      or: [{ slug: { equals: value } }, ...(asId === undefined ? [] : [{ id: { equals: asId } }])],
    },
  })
  const match = result.docs[0]

  if (!match) {
    throw new DocsAgentError('not_found', `No docs set with id or slug "${docsSet}".`)
  }

  return match.id as number | string
}

export type FindDocsOptions = {
  /** Docs set id or slug. */
  docsSet?: number | string
  id?: number | string
  /** Include archived docs (default false). */
  includeArchived?: boolean
  /** Include the markdown content (default false). */
  includeContent?: boolean
  /** Maximum docs, 1 to 50 (default 10). */
  limit?: number
  page?: number
  /** Exact route, for example `/docs/getting-started`. */
  route?: string
  /** Title contains, route or source path equals. */
  search?: string
  /** Exact source path in the docs package, for example `getting-started/install.md`. */
  sourcePath?: string
  status?: 'draft' | 'published'
} & BaseOptions

/**
 * Finds generated docs records (latest drafts) with their sync state and the admin-owned
 * fields agents may change.
 */
export const findDocs = async (
  options: FindDocsOptions,
): Promise<{ docs: DocsRecordSummary[]; hasNextPage: boolean; totalDocs: number }> => {
  const { access = 'user', req } = options
  const collection = requireDocsCollection(req, 'docs')

  assertDocsAgentAccess(req, collection.slug, 'find', access)

  const includeContent = options.includeContent === true

  if (options.id !== undefined) {
    const doc = await loadRecord({ id: options.id, collection, req })

    return {
      docs: [summarizeDocsRecord({ collection, doc, includeContent, req })],
      hasNextPage: false,
      totalDocs: 1,
    }
  }

  const clauses: Where[] = []

  if (!options.includeArchived) {
    clauses.push(notArchivedWhere() as Where)
  }

  if (options.docsSet !== undefined) {
    clauses.push({ docsSet: { equals: await resolveDocsSetId(req, options.docsSet) } })
  }

  if (options.route) {
    clauses.push({ route: { equals: options.route } })
  }

  if (options.sourcePath) {
    clauses.push({ sourcePath: { equals: options.sourcePath } })
  }

  if (options.status && collection.drafts) {
    clauses.push({ _status: { equals: options.status } })
  }

  if (options.search) {
    clauses.push({
      or: [
        { title: { like: options.search } },
        { route: { equals: options.search } },
        { sourcePath: { equals: options.search } },
      ],
    })
  }

  const result = await localApi(req.payload).find({
    collection: collection.slug,
    depth: 0,
    draft: collection.drafts,
    limit: clampLimit(options.limit, 10, 50),
    overrideAccess: false,
    page: clampLimit(options.page, 1, 10_000),
    req,
    sort: 'route',
    where: combineWhere(clauses),
  })

  return {
    docs: result.docs.map((doc) => summarizeDocsRecord({ collection, doc, includeContent, req })),
    hasNextPage: result.hasNextPage === true,
    totalDocs: result.totalDocs,
  }
}

export type DocsWriteResult = {
  adminUrl: string
  /** Fields sent to Payload. */
  fields: string[]
  id: number | string
  saved: boolean
  /** `draft`: saved unpublished; `published`; `live`: the collection has no drafts. */
  status: 'draft' | 'live' | 'published'
  updatedAt?: string
}

const DOCS_EDITABLE_HINT =
  'Agents may change admin-owned fields only: heroImage, overrides.navTitle, overrides.hideFromNav, parent, publishedAt (and fields other plugins add). Use overrides.navTitle for a different sidebar label.'

export type UpdateDocsRecordOptions = {
  /** Admin-owned fields to change. */
  data: Record<string, unknown>
  dryRun?: boolean
  id: number | string
  ifUpdatedAt?: string
  overrideLock?: boolean
  /** Publish instead of saving a draft (draft-enabled docs only). */
  publish?: boolean
} & BaseOptions

/**
 * Changes admin-owned fields of a generated doc (hero image, overrides, ...). Git-owned
 * fields are refused with `sync_owned`; Payload's agent guard enforces the same rule.
 */
export const updateDocsRecord = async (options: UpdateDocsRecordOptions): Promise<DocsWriteResult> => {
  const { access = 'user', req } = options
  const collection = requireDocsCollection(req, 'docs')

  assertDocsAgentAccess(req, collection.slug, 'update', access)

  const data = assertWritableData({ collection, data: options.data, editableHint: DOCS_EDITABLE_HINT })

  return saveRecord({ ...options, collection, data })
}

/** Shared update path of the write tools: drafts unless `publish`, optimistic concurrency. */
export const saveRecord = async ({
  id: rawId,
  collection,
  data,
  dryRun,
  ifUpdatedAt,
  overrideLock,
  publish,
  req,
}: {
  collection: DocsCollectionInfo
  data: Record<string, unknown>
  dryRun?: boolean
  id: number | string
  ifUpdatedAt?: string
  overrideLock?: boolean
  publish?: boolean
  req: PayloadRequest
}): Promise<DocsWriteResult> => {
  const id = requireId(rawId)

  if (publish && !collection.drafts) {
    throw new DocsAgentError('no_drafts', `"${collection.slug}" has no drafts; changes are live immediately. Omit "publish".`)
  }

  const current = await loadRecord({ id, collection, req })

  assertUnchanged(current, ifUpdatedAt)

  const draft = collection.drafts && !publish
  const status = !collection.drafts ? 'live' : draft ? 'draft' : 'published'
  const fields = Object.keys(data)

  if (dryRun) {
    return { id, adminUrl: adminUrl(req, collection.slug, id), fields, saved: false, status }
  }

  let saved: Doc

  try {
    saved = await localApi(req.payload).update({
      id,
      collection: collection.slug,
      data: publish ? { ...data, _status: 'published' } : data,
      depth: 0,
      draft,
      overrideAccess: false,
      overrideLock: overrideLock ?? false,
      req,
    })
  } catch (error) {
    throw toDocsAgentError(error, { action: 'update', collection: collection.slug })
  }

  return {
    id,
    adminUrl: adminUrl(req, collection.slug, id),
    fields,
    saved: true,
    status,
    ...(typeof saved.updatedAt === 'string' ? { updatedAt: saved.updatedAt } : {}),
  }
}

export type SetPublishStatusOptions = {
  action: 'publish' | 'unpublish'
  /** `docs` (default) or `docsSets`. */
  collection?: 'docs' | 'docsSets'
  id: number | string
  overrideLock?: boolean
} & BaseOptions

/**
 * Publishes the latest draft (content Git synced as a draft) or unpublishes a docs record
 * or docs set. Archived docs cannot be published.
 */
export const setPublishStatus = async (
  options: SetPublishStatusOptions,
): Promise<{ adminUrl: string; id: number | string; status: 'draft' | 'published'; updatedAt?: string }> => {
  const { access = 'user', req } = options
  const collection = requireDocsCollection(req, options.collection ?? 'docs')
  const id = requireId(options.id)

  assertDocsAgentAccess(req, collection.slug, 'update', access)

  if (!collection.drafts) {
    throw new DocsAgentError(
      'no_drafts',
      `"${collection.slug}" has no drafts, so records are always live. Enable target.enableDrafts in payloadMarkdownDocs() for a publish workflow.`,
    )
  }

  if (options.action !== 'publish' && options.action !== 'unpublish') {
    throw new DocsAgentError('invalid_input', '"action" must be publish or unpublish.')
  }

  const current = await loadRecord({ id, collection, req })

  if (options.action === 'publish' && collection.role === 'docs' && isRecord(current.sync) && current.sync.archived === true) {
    throw new DocsAgentError(
      'invalid_input',
      'This doc was archived by sync (its source was removed from Git). Restore the source in Git and sync instead of publishing it.',
    )
  }

  const status = options.action === 'publish' ? 'published' : 'draft'
  let saved: Doc

  try {
    saved = await localApi(req.payload).update({
      id,
      collection: collection.slug,
      data: { _status: status },
      depth: 0,
      draft: false,
      overrideAccess: false,
      overrideLock: options.overrideLock ?? false,
      req,
    })
  } catch (error) {
    throw toDocsAgentError(error, { action: options.action, collection: collection.slug })
  }

  return {
    id,
    adminUrl: adminUrl(req, collection.slug, id),
    status,
    ...(typeof saved.updatedAt === 'string' ? { updatedAt: saved.updatedAt } : {}),
  }
}
