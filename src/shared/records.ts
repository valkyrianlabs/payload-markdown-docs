/**
 * Shared guards for raw Payload records (`depth: 0` ids or populated relationships).
 * Every reader of plugin collections uses these instead of local copies.
 */

export type PayloadRecordId = number | string

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The record's `id` as stored (string or number). */
export const getRawRecordId = (doc: unknown): PayloadRecordId | undefined =>
  isRecord(doc) && (typeof doc.id === 'string' || typeof doc.id === 'number') ? doc.id : undefined

/** The record's `id` as a string. */
export const getRecordId = (doc: unknown): string | undefined => {
  const id = getRawRecordId(doc)

  return id === undefined ? undefined : String(id)
}

/**
 * The id of a monomorphic relationship value: a raw id (`depth: 0`) or a populated
 * record. Polymorphic `{ relationTo, value }` values are not unwrapped.
 */
export const getRelationshipId = (value: unknown): string | undefined =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : getRecordId(value)

/** A trimmed, non-empty string. */
export const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
