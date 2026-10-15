import type { PayloadRequest } from 'payload'

import type { DocsAgentAccessMode } from './access.js'
import type { DocsCollectionInfo } from './collections.js'
import type { DocsWriteResult } from './docs.js'

import { notArchivedWhere } from '../payload/visibility.js'
import { getRelationshipId, isRecord } from '../shared/records.js'
import { assertDocsAgentAccess, hasDocsAgentAccess } from './access.js'
import {
  adminUrl,
  assertWritableData,
  getDocsCollections,
  idArg,
  localApi,
  requireDocsCollection,
} from './collections.js'
import { saveRecord } from './docs.js'
import { DocsAgentError, toDocsAgentError } from './errors.js'

type Doc = Record<string, unknown>

type BaseOptions = {
  access?: DocsAgentAccessMode
  req: PayloadRequest
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined

const rowValues = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((row) => (isRecord(row) && typeof row.value === 'string' ? [row.value] : []))
    : []

export type DocsGroupSummary = {
  adminUrl: string
  description?: string
  id: number | string
  navTitle?: string
  order?: number
  pageMode?: string
  parent?: string
  slug?: string
  title?: string
}

export type DocsSetSummary = {
  adminUrl: string
  advancedSecurity?: { allowedWorkflowRefs: string[]; enabled: boolean }
  allowPullRequests?: boolean
  allowTagRefs?: boolean
  branch?: string
  description?: string
  /** Generated docs in the set (not archived), when the request may read docs. */
  docsCount?: number
  group?: string
  id: number | string
  meta?: Record<string, unknown>
  publishedAt?: string
  repositories: string[]
  routeMode?: string
  slug?: string
  status?: string
  sync?: { lastStatus?: string; lastSyncedAt?: string }
  title?: string
  updatedAt?: string
}

const summarizeGroup = (req: PayloadRequest, slug: string, doc: Doc): DocsGroupSummary => ({
  id: doc.id as number | string,
  adminUrl: adminUrl(req, slug, doc.id as number | string),
  ...(text(doc.description) ? { description: text(doc.description) } : {}),
  ...(text(doc.navTitle) ? { navTitle: text(doc.navTitle) } : {}),
  ...(typeof doc.order === 'number' ? { order: doc.order } : {}),
  ...(text(doc.pageMode) ? { pageMode: text(doc.pageMode) } : {}),
  ...(getRelationshipId(doc.parent) ? { parent: getRelationshipId(doc.parent) } : {}),
  ...(text(doc.slug) ? { slug: text(doc.slug) } : {}),
  ...(text(doc.title) ? { title: text(doc.title) } : {}),
})

const summarizeSet = (req: PayloadRequest, slug: string, doc: Doc): DocsSetSummary => {
  const advanced = isRecord(doc.advancedSecurity) ? doc.advancedSecurity : undefined
  const sync = isRecord(doc.sync) ? doc.sync : undefined

  return {
    id: doc.id as number | string,
    adminUrl: adminUrl(req, slug, doc.id as number | string),
    ...(advanced
      ? {
          advancedSecurity: {
            allowedWorkflowRefs: rowValues(advanced.allowedWorkflowRefs),
            enabled: advanced.enabled === true,
          },
        }
      : {}),
    ...(typeof doc.allowPullRequests === 'boolean' ? { allowPullRequests: doc.allowPullRequests } : {}),
    ...(typeof doc.allowTagRefs === 'boolean' ? { allowTagRefs: doc.allowTagRefs } : {}),
    ...(text(doc.branch) ? { branch: text(doc.branch) } : {}),
    ...(text(doc.description) ? { description: text(doc.description) } : {}),
    ...(getRelationshipId(doc.group) ? { group: getRelationshipId(doc.group) } : {}),
    ...(isRecord(doc.meta) ? { meta: doc.meta } : {}),
    ...(text(doc.publishedAt) ? { publishedAt: text(doc.publishedAt) } : {}),
    repositories: rowValues(doc.repositories),
    ...(text(doc.routeMode) ? { routeMode: text(doc.routeMode) } : {}),
    ...(text(doc.slug) ? { slug: text(doc.slug) } : {}),
    ...(text(doc._status) ? { status: text(doc._status) } : {}),
    ...(sync
      ? {
          sync: {
            ...(text(sync.lastStatus) ? { lastStatus: text(sync.lastStatus) } : {}),
            ...(text(sync.lastSyncedAt) ? { lastSyncedAt: text(sync.lastSyncedAt) } : {}),
          },
        }
      : {}),
    ...(text(doc.title) ? { title: text(doc.title) } : {}),
    ...(text(doc.updatedAt) ? { updatedAt: text(doc.updatedAt) } : {}),
  }
}

/**
 * The docs structure: groups (navigation tree) and docs sets (one per Git docs source,
 * slug = `--source` id) with their routing, publishing security and last sync status.
 */
export const getDocsStructure = async (
  options: BaseOptions,
): Promise<{ groups: DocsGroupSummary[]; notes: string[]; sets: DocsSetSummary[] }> => {
  const { access = 'user', req } = options
  const collections = getDocsCollections(req.payload)
  const notes: string[] = []

  if (!collections.docsGroups && !collections.docsSets) {
    throw new DocsAgentError('not_enabled', 'Neither docs groups nor docs sets are installed.')
  }

  let groups: DocsGroupSummary[] = []
  let sets: DocsSetSummary[] = []

  if (collections.docsGroups) {
    const slug = collections.docsGroups.slug

    assertDocsAgentAccess(req, slug, 'find', access)

    const result = await localApi(req.payload).find({
      collection: slug,
      depth: 0,
      overrideAccess: false,
      pagination: false,
      req,
      sort: 'order',
    })

    groups = result.docs.map((doc) => summarizeGroup(req, slug, doc))
  }

  if (collections.docsSets) {
    const setsCollection = collections.docsSets

    assertDocsAgentAccess(req, setsCollection.slug, 'find', access)

    const result = await localApi(req.payload).find({
      collection: setsCollection.slug,
      depth: 0,
      draft: setsCollection.drafts,
      overrideAccess: false,
      pagination: false,
      req,
      sort: 'title',
    })

    // Sync bookkeeping is written to the main record only (no new version), so drafts carry
    // a stale copy: take `sync` from the main records.
    const main = setsCollection.drafts
      ? await localApi(req.payload).find({
          collection: setsCollection.slug,
          depth: 0,
          draft: false,
          overrideAccess: false,
          pagination: false,
          req,
          select: { sync: true },
        })
      : result
    const syncById = new Map(main.docs.map((doc) => [String(doc.id), doc.sync]))

    sets = result.docs.map((doc) =>
      summarizeSet(req, setsCollection.slug, { ...doc, sync: syncById.get(String(doc.id)) ?? doc.sync }),
    )

    const docs = collections.docs

    if (docs && hasDocsAgentAccess(req, docs.slug, 'find', access)) {
      for (const set of sets) {
        try {
          const { totalDocs } = await localApi(req.payload).count({
            collection: docs.slug,
            overrideAccess: false,
            req,
            where: { and: [{ docsSet: { equals: set.id } }, notArchivedWhere()] },
          })

          set.docsCount = totalDocs
        } catch {
          // Counts are informational; access rules may hide docs from this user.
        }
      }
    } else if (docs) {
      notes.push(`docsCount is omitted: this connection may not read "${docs.slug}".`)
    }
  }

  return { groups, notes, sets }
}

const toValueRows = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map((row) => (typeof row === 'string' ? { value: row } : row))
    : value

/** Accepts plain string lists for `{ value }` array fields. */
const normalizeDocsSetData = (data: Record<string, unknown>): Record<string, unknown> => {
  const next: Record<string, unknown> = { ...data }

  if ('repositories' in next) {
    next.repositories = toValueRows(next.repositories)
  }

  if (isRecord(next.advancedSecurity) && 'allowedWorkflowRefs' in next.advancedSecurity) {
    next.advancedSecurity = {
      ...next.advancedSecurity,
      allowedWorkflowRefs: toValueRows(next.advancedSecurity.allowedWorkflowRefs),
    }
  }

  return next
}

const createRecord = async ({
  collection,
  data,
  publish,
  req,
}: {
  collection: DocsCollectionInfo
  data: Record<string, unknown>
  publish?: boolean
  req: PayloadRequest
}): Promise<DocsWriteResult> => {
  const draft = collection.drafts && !publish
  let created: Doc

  try {
    created = await localApi(req.payload).create({
      collection: collection.slug,
      data: collection.drafts && publish ? { ...data, _status: 'published' } : data,
      depth: 0,
      draft,
      overrideAccess: false,
      req,
    })
  } catch (error) {
    throw toDocsAgentError(error, { action: 'create', collection: collection.slug })
  }

  const id = created.id as number | string

  return {
    id,
    adminUrl: adminUrl(req, collection.slug, id),
    fields: Object.keys(data),
    saved: true,
    status: !collection.drafts ? 'live' : draft ? 'draft' : 'published',
    ...(typeof created.updatedAt === 'string' ? { updatedAt: created.updatedAt } : {}),
  }
}

export type SaveDocsSetOptions = {
  data: Record<string, unknown>
  dryRun?: boolean
  /** Update this docs set; omit to create one. */
  id?: number | string
  ifUpdatedAt?: string
  overrideLock?: boolean
  /** Publish instead of saving a draft. */
  publish?: boolean
} & BaseOptions

const DOCS_SET_HINT =
  'Docs set fields: title, slug (the Git --source id), description, group, routeMode, branch, allowPullRequests, allowTagRefs, repositories, advancedSecurity, meta (SEO), publishedAt. "sync" is written by Git sync.'

/** Creates or updates a docs set (saved as a draft unless `publish`). */
export const saveDocsSet = async (options: SaveDocsSetOptions): Promise<DocsWriteResult> => {
  const { access = 'user', req } = options
  const collection = requireDocsCollection(req, 'docsSets')
  const id = idArg(options.id)

  assertDocsAgentAccess(req, collection.slug, id === undefined ? 'create' : 'update', access)

  const data = normalizeDocsSetData(assertWritableData({ collection, data: options.data, editableHint: DOCS_SET_HINT }))

  if (id !== undefined) {
    return saveRecord({ ...options, id, collection, data })
  }

  if (options.dryRun) {
    return {
      id: '',
      adminUrl: adminUrl(req, collection.slug),
      fields: Object.keys(data),
      saved: false,
      status: options.publish ? 'published' : 'draft',
    }
  }

  return createRecord({ collection, data, publish: options.publish, req })
}

export type SaveDocsGroupOptions = {
  data: Record<string, unknown>
  dryRun?: boolean
  /** Update this group; omit to create one. */
  id?: number | string
  ifUpdatedAt?: string
  overrideLock?: boolean
} & BaseOptions

const DOCS_GROUP_HINT =
  'Docs group fields: title, slug, parent, description, navTitle, order, pageMode (auto or custom).'

/** Creates or updates a docs group (groups have no drafts: changes are live). */
export const saveDocsGroup = async (options: SaveDocsGroupOptions): Promise<DocsWriteResult> => {
  const { access = 'user', req } = options
  const collection = requireDocsCollection(req, 'docsGroups')
  const id = idArg(options.id)

  assertDocsAgentAccess(req, collection.slug, id === undefined ? 'create' : 'update', access)

  const data = assertWritableData({ collection, data: options.data, editableHint: DOCS_GROUP_HINT })

  if (id !== undefined) {
    return saveRecord({ ...options, id, collection, data, publish: false })
  }

  if (options.dryRun) {
    return { id: '', adminUrl: adminUrl(req, collection.slug), fields: Object.keys(data), saved: false, status: 'live' }
  }

  return createRecord({ collection, data, req })
}
