/**
 * Git owns generated docs content (MCP-1).
 *
 * The sync endpoint writes docs bodies, frontmatter fields, routes, assets and sync
 * bookkeeping from the Git manifest. AI agents connected through `@payloadcms/plugin-mcp`
 * (the built-in collection tools, payload-markdown's markdown tools, or this plugin's
 * own MCP tools) must never overwrite those fields: the next sync would either report a
 * manual-edit conflict or silently replace the agent's change.
 *
 * Every plugin collection is tagged with its role (`custom.payloadMarkdownDocs`) so the
 * MCP tools can find it under any slug, and the collections that hold Git-owned data get
 * guard hooks that reject agent writes to those fields. A request counts as an agent
 * request when plugin-mcp handles it (`req.payloadAPI === 'MCP'`) or when
 * `withPayloadMarkdownDocsMcp()` marked it. The sync endpoint, the admin UI and REST or
 * GraphQL clients are not affected.
 */
import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionConfig,
  PayloadRequest,
} from 'payload'

import { APIError } from 'payload'

import { isRecord } from '../shared/records.js'

/** Key on a collection's `custom` config that tags plugin collections with their role. */
export const PAYLOAD_MARKDOWN_DOCS_CUSTOM_KEY = 'payloadMarkdownDocs'

/** `req.context` key `withPayloadMarkdownDocsMcp()` sets on MCP requests (the key's permissions). */
export const PAYLOAD_MARKDOWN_DOCS_MCP_CONTEXT_KEY = 'payloadMarkdownDocsMcp'

/**
 * `req.context` key the `docsRestoreVersion` tool sets while it restores a version that
 * Git produced. Server code only: agents cannot set request context.
 */
export const PAYLOAD_MARKDOWN_DOCS_RESTORE_CONTEXT_KEY = 'payloadMarkdownDocsRestoreVersion'

/** Error `data.code` of guard rejections. */
export const SYNC_OWNED_ERROR_CODE = 'sync_owned'

export type DocsCollectionRole =
  | 'docs'
  | 'docsAccess'
  | 'docsAssets'
  | 'docsGroups'
  | 'docsSets'
  | 'nonces'
  | 'syncRuns'

export const DOCS_COLLECTION_ROLES: DocsCollectionRole[] = [
  'docs',
  'docsAccess',
  'docsAssets',
  'docsGroups',
  'docsSets',
  'nonces',
  'syncRuns',
]

/** What agents may do with a plugin collection. `'*'`: every field is Git- or sync-owned. */
export type DocsAgentWritePolicy = {
  create: boolean
  delete: boolean
  syncOwnedFields: '*' | string[]
}

/** Stored on `custom.payloadMarkdownDocs` of every plugin collection. */
export type DocsCollectionMarker = {
  agentPolicy?: DocsAgentWritePolicy
  /** Name of the synced markdown field (docs collection only). */
  markdownField?: string
  role: DocsCollectionRole
}

/**
 * Top-level docs fields the sync endpoint writes (`buildDocsData` / `buildArchiveData`).
 * Everything else on a generated doc (`heroImage`, `overrides`, `parent`, `publishedAt`,
 * fields other plugins add) is admin-owned presentation data.
 */
export const getSyncOwnedDocsFields = (markdownFieldName: string): string[] => [
  'title',
  'navTitle',
  'description',
  'dependencies',
  'depth',
  'order',
  'route',
  'sourcePath',
  'sourceHash',
  'docsSet',
  markdownFieldName,
  'sync',
]

/** Docs set fields only the sync endpoint writes (last sync status, stack from docs/stack.toml). */
export const SYNC_OWNED_DOCS_SET_FIELDS = ['stack', 'sync']

export const getDocsAgentWritePolicy = (
  role: DocsCollectionRole,
  markdownFieldName: string,
): DocsAgentWritePolicy | undefined => {
  switch (role) {
    case 'docs':
      // Docs are created, archived and deleted by sync only.
      return { create: false, delete: false, syncOwnedFields: getSyncOwnedDocsFields(markdownFieldName) }
    case 'docsAssets':
    case 'nonces':
    case 'syncRuns':
      return { create: false, delete: false, syncOwnedFields: '*' }
    case 'docsSets':
      return { create: true, delete: true, syncOwnedFields: SYNC_OWNED_DOCS_SET_FIELDS }
    default:
      return undefined
  }
}

/** True for requests from an MCP client (plugin-mcp, or marked by `withPayloadMarkdownDocsMcp()`). */
export const isAgentRequest = (req: Partial<PayloadRequest> | undefined): boolean =>
  // plugin-mcp sets `payloadAPI = 'MCP'`, a value Payload's own type does not list.
  (req?.payloadAPI as string | undefined) === 'MCP' ||
  isRecord(req?.context?.[PAYLOAD_MARKDOWN_DOCS_MCP_CONTEXT_KEY])

const isEmptyValue = (value: unknown): boolean => {
  if (value === undefined || value === null || value === '') {
    return true
  }

  if (Array.isArray(value)) {
    return value.length === 0
  }

  if (isRecord(value)) {
    return Object.values(value).every(isEmptyValue)
  }

  return false
}

const isScalar = (value: unknown): value is number | string =>
  typeof value === 'number' || typeof value === 'string'

/** The parts of a (flattened) field config the comparison needs. */
export type ComparableField = {
  defaultValue?: unknown
  flattenedFields?: ComparableField[]
  name?: string
}

const findField = (fields: ComparableField[] | undefined, name: string): ComparableField | undefined =>
  fields?.find((field) => field.name === name)

/** Payload fills a missing value with the field's static default on every save. */
const isFilledDefault = (incoming: unknown, field: ComparableField | undefined): boolean =>
  field !== undefined &&
  field.defaultValue !== undefined &&
  typeof field.defaultValue !== 'function' &&
  isSameFieldValue(incoming, field.defaultValue)

/**
 * Loose structural equality between an incoming value and the stored one: `null`,
 * `undefined` and `''` are equal, dates compare as ISO strings, ids compare as strings,
 * a relationship id equals the populated record with that id, and a static default that
 * Payload filled in for a missing stored value counts as unchanged.
 */
export const isSameFieldValue = (
  incoming: unknown,
  stored: unknown,
  field?: ComparableField,
): boolean => {
  const a = incoming instanceof Date ? incoming.toISOString() : incoming
  const b = stored instanceof Date ? stored.toISOString() : stored

  if (isRecord(a) && !isScalar(a.id) && (isRecord(b) || isEmptyValue(b))) {
    const storedRecord = isRecord(b) ? b : {}
    const keys = new Set([...Object.keys(a), ...Object.keys(storedRecord)])

    return [...keys].every((key) =>
      isSameFieldValue(a[key], storedRecord[key], findField(field?.flattenedFields, key)),
    )
  }

  if (isEmptyValue(b) && !isEmptyValue(a)) {
    return isFilledDefault(a, field)
  }

  if (isEmptyValue(a) || isEmptyValue(b)) {
    return isEmptyValue(a) && isEmptyValue(b)
  }

  if (isScalar(a) && isScalar(b)) {
    return String(a) === String(b)
  }

  if (isScalar(a) && isRecord(b)) {
    return isScalar(b.id) && String(b.id) === String(a)
  }

  if (isRecord(a) && isScalar(b)) {
    return isScalar(a.id) && String(a.id) === String(b)
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length &&
      a.every((value, index) => isSameFieldValue(value, b[index], { flattenedFields: field?.flattenedFields }))
    )
  }

  if (isRecord(a) && isRecord(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])

    return [...keys].every((key) => isSameFieldValue(a[key], b[key]))
  }

  return a === b
}

/** Fields of `fields` whose value in `data` differs from `originalDoc`. */
export const findChangedFields = ({
  collectionFields,
  data,
  fields,
  originalDoc,
}: {
  /** The collection's flattened fields, to recognise defaults Payload filled in. */
  collectionFields?: ComparableField[]
  data: Record<string, unknown>
  fields: string[]
  originalDoc: Record<string, unknown> | undefined
}): string[] =>
  fields.filter(
    (field) =>
      field in data &&
      !isSameFieldValue(data[field], originalDoc?.[field], findField(collectionFields, field)),
  )

const syncOwnedError = ({
  collection,
  fields,
  message,
}: {
  collection: string
  fields: '*' | string[]
  message: string
}): APIError =>
  new APIError(
    message,
    403,
    { code: SYNC_OWNED_ERROR_CODE, collection, fields: fields === '*' ? ['*'] : fields },
    true,
  )

const describeFields = (fields: string[]): string => fields.map((field) => `"${field}"`).join(', ')

const createAgentBeforeChangeHook =
  (policy: DocsAgentWritePolicy): CollectionBeforeChangeHook =>
  ({ collection, data, operation, originalDoc, req }) => {
    if (!isAgentRequest(req)) {
      return data
    }

    const slug = collection.slug
    const incoming = isRecord(data) ? data : {}

    if (operation === 'create') {
      if (!policy.create) {
        throw syncOwnedError({
          collection: slug,
          fields: policy.syncOwnedFields,
          message: `Records in "${slug}" are created by payload-markdown-docs Git sync. Agents cannot create them over MCP: add the source file in Git and sync.`,
        })
      }

      const provided =
        policy.syncOwnedFields === '*'
          ? []
          : policy.syncOwnedFields.filter((field) => !isEmptyValue(incoming[field]))

      if (provided.length > 0) {
        throw syncOwnedError({
          collection: slug,
          fields: provided,
          message: `${describeFields(provided)} on "${slug}" are written by payload-markdown-docs Git sync. Leave them out when creating records over MCP.`,
        })
      }

      return data
    }

    if (req.context?.[PAYLOAD_MARKDOWN_DOCS_RESTORE_CONTEXT_KEY] === true) {
      return data
    }

    if (policy.syncOwnedFields === '*') {
      throw syncOwnedError({
        collection: slug,
        fields: '*',
        message: `Records in "${slug}" are written by payload-markdown-docs Git sync only. Agents cannot change them over MCP.`,
      })
    }

    const changed = findChangedFields({
      collectionFields: (collection as { flattenedFields?: ComparableField[] }).flattenedFields,
      data: incoming,
      fields: policy.syncOwnedFields,
      originalDoc: isRecord(originalDoc) ? originalDoc : undefined,
    })

    if (changed.length > 0) {
      throw syncOwnedError({
        collection: slug,
        fields: changed,
        message: `${describeFields(changed)} on "${slug}" are owned by payload-markdown-docs Git sync. Agents cannot change them over MCP: edit the Markdown source in Git and sync, or change admin-owned fields instead.`,
      })
    }

    return data
  }

const createAgentBeforeDeleteHook =
  (policy: DocsAgentWritePolicy): CollectionBeforeDeleteHook =>
  ({ collection, req }) => {
    if (!policy.delete && isAgentRequest(req)) {
      throw syncOwnedError({
        collection: collection.slug,
        fields: policy.syncOwnedFields,
        message: `Records in "${collection.slug}" are removed by payload-markdown-docs Git sync. Agents cannot delete them over MCP: remove the source in Git and sync.`,
      })
    }
  }

/**
 * Tags a plugin collection with its role and, for collections that hold Git- or
 * sync-owned data, prepends the agent guard hooks.
 */
export const withDocsAgentGuard = ({
  collection,
  markdownFieldName,
  role,
}: {
  collection: CollectionConfig
  markdownFieldName: string
  role: DocsCollectionRole
}): CollectionConfig => {
  const policy = getDocsAgentWritePolicy(role, markdownFieldName)
  const marker: DocsCollectionMarker = {
    ...(policy ? { agentPolicy: policy } : {}),
    ...(role === 'docs' ? { markdownField: markdownFieldName } : {}),
    role,
  }

  return {
    ...collection,
    custom: {
      ...collection.custom,
      [PAYLOAD_MARKDOWN_DOCS_CUSTOM_KEY]: marker,
    },
    ...(policy
      ? {
          hooks: {
            ...collection.hooks,
            beforeChange: [createAgentBeforeChangeHook(policy), ...(collection.hooks?.beforeChange ?? [])],
            beforeDelete: [createAgentBeforeDeleteHook(policy), ...(collection.hooks?.beforeDelete ?? [])],
          },
        }
      : {}),
  }
}

/** The role marker of a (sanitized or raw) collection config, if it is a plugin collection. */
export const getDocsCollectionMarker = (collection: unknown): DocsCollectionMarker | undefined => {
  if (!isRecord(collection) || !isRecord(collection.custom)) {
    return undefined
  }

  const marker = collection.custom[PAYLOAD_MARKDOWN_DOCS_CUSTOM_KEY]

  return isRecord(marker) && DOCS_COLLECTION_ROLES.includes(marker.role as DocsCollectionRole)
    ? (marker as DocsCollectionMarker)
    : undefined
}
