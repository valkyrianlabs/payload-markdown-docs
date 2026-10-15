import type { PayloadRequest, Where } from 'payload'

import type { DocsAgentAccessMode } from './access.js'
import type { DocsWriteResult } from './docs.js'

import { getEd25519PublicKeyInput } from '../security/ed25519Keys.js'
import { getRelationshipId, isRecord } from '../shared/records.js'
import { assertDocsAgentAccess } from './access.js'
import {
  adminUrl,
  assertWritableData,
  clampLimit,
  combineWhere,
  idArg,
  loadRecord,
  localApi,
  requireDocsCollection,
  requireId,
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

export type DocsAccessSummary = {
  accessType?: string
  adminUrl: string
  /** Docs sets the credential may sync; empty means every docs set. */
  docsSets: string[]
  id: number | string
  keyId?: string
  limitRepos?: boolean
  owner?: string
  publicKey?: string
  repositories: string[]
  title?: string
  updatedAt?: string
}

const summarize = (req: PayloadRequest, slug: string, doc: Doc): DocsAccessSummary => ({
  id: doc.id as number | string,
  ...(text(doc.accessType) ? { accessType: text(doc.accessType) } : {}),
  adminUrl: adminUrl(req, slug, doc.id as number | string),
  docsSets: Array.isArray(doc.docsSets)
    ? doc.docsSets.flatMap((value) => (getRelationshipId(value) ? [getRelationshipId(value) as string] : []))
    : [],
  ...(text(doc.keyId) ? { keyId: text(doc.keyId) } : {}),
  ...(typeof doc.limitRepos === 'boolean' ? { limitRepos: doc.limitRepos } : {}),
  ...(text(doc.owner) ? { owner: text(doc.owner) } : {}),
  ...(text(doc.publicKey) ? { publicKey: text(doc.publicKey) } : {}),
  repositories: Array.isArray(doc.repositories)
    ? doc.repositories.flatMap((row) => (isRecord(row) && typeof row.value === 'string' ? [row.value] : []))
    : [],
  ...(text(doc.title) ? { title: text(doc.title) } : {}),
  ...(text(doc.updatedAt) ? { updatedAt: text(doc.updatedAt) } : {}),
})

export type ListDocsAccessOptions = {
  accessType?: 'ed25519' | 'githubOidc'
  id?: number | string
  limit?: number
} & BaseOptions

/** Lists the credentials allowed to sync docs (Ed25519 public keys, trusted GitHub owners). */
export const listDocsAccess = async (
  options: ListDocsAccessOptions,
): Promise<{ access: DocsAccessSummary[]; totalDocs: number }> => {
  const { access = 'user', req } = options
  const collection = requireDocsCollection(req, 'docsAccess')

  assertDocsAgentAccess(req, collection.slug, 'find', access)

  if (options.id !== undefined) {
    const doc = await loadRecord({ id: options.id, collection, req })

    return { access: [summarize(req, collection.slug, doc)], totalDocs: 1 }
  }

  const clauses: Where[] = options.accessType ? [{ accessType: { equals: options.accessType } }] : []
  const result = await localApi(req.payload).find({
    collection: collection.slug,
    depth: 0,
    limit: clampLimit(options.limit, 25, 100),
    overrideAccess: false,
    req,
    sort: 'title',
    where: combineWhere(clauses),
  })

  return {
    access: result.docs.map((doc) => summarize(req, collection.slug, doc)),
    totalDocs: result.totalDocs,
  }
}

const DOCS_ACCESS_HINT =
  'Access fields: title, accessType (ed25519 or githubOidc), keyId and publicKey (ed25519), owner, limitRepos and repositories (githubOidc), docsSets (ids; empty allows every docs set).'

const assertNoPrivateKey = (data: Record<string, unknown>) => {
  const serialized = JSON.stringify(data)

  if (/PRIVATE KEY/.test(serialized)) {
    throw new DocsAgentError(
      'invalid_input',
      'That is a private key. Payload stores public keys only: keep the private key in the publishing environment (for example a CI secret) and pass its public key.',
    )
  }
}

const normalizeAccessData = (data: Record<string, unknown>): Record<string, unknown> => {
  const next: Record<string, unknown> = { ...data }

  if (Array.isArray(next.repositories)) {
    next.repositories = next.repositories.map((row) => (typeof row === 'string' ? { value: row } : row))
  }

  if (typeof next.publicKey === 'string') {
    try {
      getEd25519PublicKeyInput(next.publicKey)
    } catch (error) {
      throw new DocsAgentError(
        'invalid_input',
        `"publicKey" is not an Ed25519 public key: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return next
}

export type SaveDocsAccessOptions = {
  data: Record<string, unknown>
  dryRun?: boolean
  /** Update this credential; omit to create one. */
  id?: number | string
  ifUpdatedAt?: string
} & BaseOptions

/**
 * Creates or updates a sync credential. Ed25519 entries take the public key only; GitHub
 * OIDC entries trust an owner (optionally limited to repositories). Scope credentials to
 * docs sets with `docsSets`.
 */
export const saveDocsAccess = async (options: SaveDocsAccessOptions): Promise<DocsWriteResult> => {
  const { access = 'user', req } = options
  const collection = requireDocsCollection(req, 'docsAccess')
  const id = idArg(options.id)

  assertDocsAgentAccess(req, collection.slug, id === undefined ? 'create' : 'update', access)
  assertNoPrivateKey(isRecord(options.data) ? options.data : {})

  const data = normalizeAccessData(assertWritableData({ collection, data: options.data, editableHint: DOCS_ACCESS_HINT }))

  if (id !== undefined) {
    return saveRecord({ ...options, id, collection, data })
  }

  if (options.dryRun) {
    return { id: '', adminUrl: adminUrl(req, collection.slug), fields: Object.keys(data), saved: false, status: 'live' }
  }

  let created: Doc

  try {
    created = await localApi(req.payload).create({
      collection: collection.slug,
      data,
      depth: 0,
      overrideAccess: false,
      req,
    })
  } catch (error) {
    throw toDocsAgentError(error, { action: 'create', collection: collection.slug })
  }

  return {
    id: created.id as number | string,
    adminUrl: adminUrl(req, collection.slug, created.id as number | string),
    fields: Object.keys(data),
    saved: true,
    status: 'live',
    ...(typeof created.updatedAt === 'string' ? { updatedAt: created.updatedAt } : {}),
  }
}

/** Deletes a sync credential: syncs signed with it, or from that GitHub owner, stop working. */
export const deleteDocsAccess = async (
  options: { id: number | string } & BaseOptions,
): Promise<{ deleted: true; id: number | string; title?: string }> => {
  const { access = 'user', req } = options
  const collection = requireDocsCollection(req, 'docsAccess')
  const id = requireId(options.id)

  assertDocsAgentAccess(req, collection.slug, 'delete', access)

  let deleted: Doc

  try {
    deleted = await localApi(req.payload).delete({
      id,
      collection: collection.slug,
      depth: 0,
      overrideAccess: false,
      req,
    })
  } catch (error) {
    throw toDocsAgentError(error, { action: 'delete', collection: collection.slug })
  }

  return { id, deleted: true, ...(text(deleted.title) ? { title: text(deleted.title) } : {}) }
}
