import type { Payload, PayloadRequest, SanitizedCollectionConfig, Where } from 'payload'

import type { DocsAgentWritePolicy, DocsCollectionRole } from '../payload/agentGuard.js'

import { getDocsCollectionMarker } from '../payload/agentGuard.js'
import { isRecord } from '../shared/records.js'
import { DocsAgentError } from './errors.js'

type Args = Record<string, unknown>
type Doc = Record<string, unknown>

/**
 * The Local API with plain string slugs. Apps that generate Payload types narrow
 * collection slugs to literal unions; the docs operations address the plugin collections
 * by whatever slug the app configured, so they use this view instead.
 */
export type LooseLocalApi = {
  count(args: Args): Promise<{ totalDocs: number }>
  create(args: Args): Promise<Doc>
  delete(args: Args): Promise<Doc>
  find(args: Args): Promise<{ docs: Doc[]; hasNextPage?: boolean; page?: number; totalDocs: number }>
  findByID(args: Args): Promise<Doc>
  findVersionByID(args: Args): Promise<Doc>
  findVersions(args: Args): Promise<{ docs: Doc[]; totalDocs: number }>
  restoreVersion(args: Args): Promise<Doc>
  update(args: Args): Promise<Doc>
}

export const localApi = (payload: Payload): LooseLocalApi => payload as unknown as LooseLocalApi

export type DocsCollectionInfo = {
  config: SanitizedCollectionConfig
  /** Draft/publish workflow (`versions.drafts`). */
  drafts: boolean
  /** Name of the synced markdown field (docs collection only). */
  markdownField?: string
  /** What agents may do; `undefined` when the collection holds no Git-owned data. */
  policy?: DocsAgentWritePolicy
  role: DocsCollectionRole
  slug: string
  /** Version history (`versions` enabled). */
  versions: boolean
}

/** The payload-markdown-docs collections of this app, by role, found by their config tag. */
export const getDocsCollections = (
  payload: Payload,
): Partial<Record<DocsCollectionRole, DocsCollectionInfo>> => {
  const collections: Partial<Record<DocsCollectionRole, DocsCollectionInfo>> = {}

  for (const config of payload.config.collections) {
    const marker = getDocsCollectionMarker(config)

    if (!marker || collections[marker.role]) {
      continue
    }

    collections[marker.role] = {
      slug: config.slug,
      config,
      drafts: Boolean(config.versions && config.versions.drafts),
      markdownField: marker.markdownField,
      policy: marker.agentPolicy,
      role: marker.role,
      versions: Boolean(config.versions),
    }
  }

  return collections
}

const ROLE_LABELS: Record<DocsCollectionRole, string> = {
  docs: 'docs',
  docsAccess: 'docs access',
  docsAssets: 'docs assets',
  docsGroups: 'docs groups',
  docsSets: 'docs sets',
  nonces: 'sync nonces',
  syncRuns: 'sync runs',
}

/** The collection for `role`, or `not_enabled` when the app does not install it. */
export const requireDocsCollection = (
  req: PayloadRequest,
  role: DocsCollectionRole,
): DocsCollectionInfo => {
  const collection = getDocsCollections(req.payload)[role]

  if (!collection) {
    throw new DocsAgentError(
      'not_enabled',
      `The ${ROLE_LABELS[role]} collection is not installed. Add payloadMarkdownDocs() to the Payload config (and keep collections.${role}.enabled on).`,
    )
  }

  return collection
}

export const adminUrl = (req: PayloadRequest, slug: string, id?: number | string): string => {
  const { routes, serverURL } = req.payload.config
  const base = `${serverURL ?? ''}${routes.admin}/collections/${slug}`

  return id === undefined ? base : `${base}/${id}`
}

/** A positive integer within bounds, or the fallback. */
export const clampLimit = (value: unknown, fallback: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(Math.trunc(value), 1), max)
    : fallback

export const idArg = (value: unknown): number | string | undefined =>
  typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')
    ? typeof value === 'string'
      ? value.trim()
      : value
    : undefined

export const requireId = (value: unknown, label = 'id'): number | string => {
  const id = idArg(value)

  if (id === undefined) {
    throw new DocsAgentError('invalid_input', `Pass "${label}".`)
  }

  return id
}

export const combineWhere = (clauses: Where[]): undefined | Where =>
  clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : { and: clauses }

/** Loads one record as the request's user (latest draft for draft-enabled collections). */
export const loadRecord = async ({
  id,
  collection,
  req,
}: {
  collection: DocsCollectionInfo
  id: number | string
  req: PayloadRequest
}): Promise<Doc> => {
  try {
    return await localApi(req.payload).findByID({
      id,
      collection: collection.slug,
      depth: 0,
      draft: collection.drafts,
      overrideAccess: false,
      req,
    })
  } catch (error) {
    const status = (error as { status?: number }).status

    if (status === 404) {
      throw new DocsAgentError('not_found', `No record with id "${id}" in "${collection.slug}".`)
    }

    if (status === 403) {
      throw new DocsAgentError('forbidden', `Not allowed to read "${collection.slug}".`)
    }

    throw error
  }
}

/** Refuses a write when the record changed since the agent read it. */
export const assertUnchanged = (doc: Doc, ifUpdatedAt: unknown): void => {
  if (typeof ifUpdatedAt === 'string' && ifUpdatedAt && doc.updatedAt !== ifUpdatedAt) {
    throw new DocsAgentError(
      'conflict',
      `The record changed since it was read (updatedAt ${String(doc.updatedAt)}, expected ${ifUpdatedAt}). Read it again and reapply the change.`,
      { updatedAt: doc.updatedAt },
    )
  }
}

/** Top-level data keys that are not fields of the collection. */
export const unknownFields = (collection: DocsCollectionInfo, data: Record<string, unknown>): string[] => {
  const names = new Set(
    collection.config.flattenedFields.flatMap((field) => ('name' in field && field.name ? [field.name] : [])),
  )

  return Object.keys(data).filter((key) => !names.has(key))
}

/** Keys Payload manages itself; agents never send them. */
const SYSTEM_KEYS = new Set(['_status', 'createdAt', 'id', 'updatedAt'])

/**
 * Validates agent data for a collection: refuses Git-owned fields (`sync_owned`),
 * system keys and unknown fields before anything reaches Payload.
 */
export const assertWritableData = ({
  collection,
  data,
  editableHint,
}: {
  collection: DocsCollectionInfo
  data: unknown
  editableHint?: string
}): Record<string, unknown> => {
  if (!isRecord(data) || Object.keys(data).length === 0) {
    throw new DocsAgentError('invalid_input', 'Pass "data" with at least one field.')
  }

  const owned = collection.policy?.syncOwnedFields

  if (owned === '*') {
    throw new DocsAgentError('sync_owned', `"${collection.slug}" is written by Git sync only.`, {
      fields: ['*'],
    })
  }

  const syncOwned = Object.keys(data).filter((key) => owned?.includes(key))

  if (syncOwned.length > 0) {
    throw new DocsAgentError(
      'sync_owned',
      `${syncOwned.map((key) => `"${key}"`).join(', ')} on "${collection.slug}" are owned by Git sync. Edit the Markdown source in Git and sync instead.${editableHint ? ` ${editableHint}` : ''}`,
      { fields: syncOwned },
    )
  }

  const system = Object.keys(data).filter((key) => SYSTEM_KEYS.has(key))

  if (system.length > 0) {
    throw new DocsAgentError(
      'invalid_input',
      `${system.map((key) => `"${key}"`).join(', ')} cannot be set directly.${system.includes('_status') ? ' Use docsPublish to publish or unpublish.' : ''}`,
    )
  }

  const unknown = unknownFields(collection, data)

  if (unknown.length > 0) {
    throw new DocsAgentError(
      'invalid_input',
      `Unknown field(s) on "${collection.slug}": ${unknown.map((key) => `"${key}"`).join(', ')}.${editableHint ? ` ${editableHint}` : ''}`,
    )
  }

  return data
}

/** Field names an agent may write on a collection (top level). */
export const editableFieldNames = (collection: DocsCollectionInfo): string[] => {
  const owned = collection.policy?.syncOwnedFields

  if (owned === '*') {
    return []
  }

  return collection.config.flattenedFields.flatMap((field) =>
    'name' in field &&
    field.name &&
    !SYSTEM_KEYS.has(field.name) &&
    !owned?.includes(field.name) &&
    !(field.admin && 'hidden' in field.admin && field.admin.hidden === true)
      ? [field.name]
      : [],
  )
}
