export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

export const getNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

export const getBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined

export const getRecordString = (
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined => (record ? getString(record[key]) : undefined)

export const getRelationshipValue = (value: unknown): unknown =>
  isRecord(value) && 'value' in value ? value.value : value

export const getRouteLikeHref = (value: unknown): string | undefined => {
  const record = getRelationshipValue(value)

  if (!isRecord(record)) {
    return undefined
  }

  return (
    getRecordString(record, 'href') ??
    getRecordString(record, 'url') ??
    getRecordString(record, 'route') ??
    getRecordString(record, 'routePath') ??
    getRecordString(record, 'routeBase') ??
    getRecordString(record, 'productRoute')
  )
}

export const getRouteLikeTitle = (value: unknown): string | undefined => {
  const record = getRelationshipValue(value)

  if (!isRecord(record)) {
    return undefined
  }

  return (
    getRecordString(record, 'navTitle') ??
    getRecordString(record, 'title') ??
    getRecordString(record, 'label')
  )
}

export const getRouteLikeDescription = (value: unknown): string | undefined => {
  const record = getRelationshipValue(value)

  if (!isRecord(record)) {
    return undefined
  }

  return getRecordString(record, 'description') ?? getRecordString(record, 'excerpt')
}
