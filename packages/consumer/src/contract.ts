/**
 * Wire contract of the public projects API (`GET /api/documentation/projects` and
 * `GET /api/documentation/projects/:slug`), schema version 1.
 *
 * This file exists byte-identically in two places: `src/projects/contract.ts` (the
 * payload-markdown-docs server, which builds responses with these types) and
 * `packages/consumer/src/contract.ts` (the consumer package,
 * which validates responses with the parsers below). `src/projects/contract.spec.ts`
 * fails when the copies differ, so edit both together. It must stay dependency-free.
 *
 * Compatibility: `schemaVersion` changes only for breaking changes. Within a version,
 * fields are only ever added; parsers ignore fields they do not know.
 */

export const DOCS_PROJECTS_SCHEMA_VERSION = 1

export type DocsProjectsStackItem = {
  name: string
}

export type DocsProjectsStackCategory = {
  /** Free-form key from `docs/stack.toml`, such as `languages` or `infrastructure`. */
  category: string
  items: DocsProjectsStackItem[]
}

export type DocsProjectsImage = {
  alt?: string
  height?: number
  /** Absolute URL. */
  url: string
  width?: number
}

export type DocsProjectsGroup = {
  slug: string
  title: string
}

export type DocsProject = {
  /** The docs set description. */
  description: null | string
  /** The docs group the docs set belongs to, or null for an ungrouped docs set. */
  group: DocsProjectsGroup | null
  /** ISO timestamp of the last successful docs sync, if any. */
  lastSyncedAt: null | string
  /** What the docs set's own page uses for metadata: plugin-seo values with fallbacks applied. */
  seo: {
    description: null | string
    image: DocsProjectsImage | null
    title: string
  }
  /** The docs set slug: unique within one site, not across sites. */
  slug: string
  stack: DocsProjectsStackCategory[]
  /** The docs set title. */
  title: string
  /** ISO timestamp of the docs set's last update, if known. */
  updatedAt: null | string
  /** Absolute canonical URLs on the docs site. */
  urls: {
    docs: string
    product: string
  }
}

export type DocsProjectsListResponse = {
  /** Groups that have at least one listed project, in display order. */
  groups: DocsProjectsGroup[]
  /** Published docs sets in display order. */
  projects: DocsProject[]
  schemaVersion: typeof DOCS_PROJECTS_SCHEMA_VERSION
}

export type DocsProjectResponse = {
  project: DocsProject
  schemaVersion: typeof DOCS_PROJECTS_SCHEMA_VERSION
}

export type DocsProjectsErrorResponse = {
  error: {
    code: 'not_found'
    message: string
  }
  schemaVersion: typeof DOCS_PROJECTS_SCHEMA_VERSION
}

export type DocsProjectsParseErrorCode = 'invalid_response' | 'schema_missing' | 'schema_unsupported'

export type DocsProjectsParseResult<T> =
  | {
      code: DocsProjectsParseErrorCode
      message: string
      ok: false
    }
  | {
      ok: true
      value: T
      /** Entries that were skipped because they did not match the schema. */
      warnings: string[]
    }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isString = (value: unknown): value is string => typeof value === 'string'

const nullableString = (value: unknown): null | string | undefined =>
  value === null ? null : isString(value) ? value : undefined

const parseImage = (value: unknown): DocsProjectsImage | null | undefined => {
  if (value === null) {
    return null
  }

  if (!isRecord(value) || !isString(value.url)) {
    return undefined
  }

  return {
    ...(isString(value.alt) ? { alt: value.alt } : {}),
    ...(typeof value.height === 'number' ? { height: value.height } : {}),
    url: value.url,
    ...(typeof value.width === 'number' ? { width: value.width } : {}),
  }
}

const parseGroup = (value: unknown): DocsProjectsGroup | undefined =>
  isRecord(value) && isString(value.slug) && isString(value.title)
    ? { slug: value.slug, title: value.title }
    : undefined

const parseStack = (value: unknown): DocsProjectsStackCategory[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined
  }

  const stack: DocsProjectsStackCategory[] = []

  for (const entry of value) {
    if (!isRecord(entry) || !isString(entry.category) || !Array.isArray(entry.items)) {
      return undefined
    }

    const items: DocsProjectsStackItem[] = []

    for (const item of entry.items) {
      if (!isRecord(item) || !isString(item.name)) {
        return undefined
      }

      items.push({ name: item.name })
    }

    stack.push({ category: entry.category, items })
  }

  return stack
}

/** Validates one project; returns a reason string when it does not match the schema. */
export const parseDocsProject = (value: unknown): DocsProject | string => {
  if (!isRecord(value)) {
    return 'project is not an object'
  }

  const slug = value.slug
  const title = value.title
  const description = nullableString(value.description)
  const group = value.group === null ? null : parseGroup(value.group)
  const seo = isRecord(value.seo) ? value.seo : undefined
  const seoDescription = seo ? nullableString(seo.description) : undefined
  const seoImage = seo ? parseImage(seo.image) : undefined
  const urls = isRecord(value.urls) ? value.urls : undefined
  const stack = parseStack(value.stack)
  const updatedAt = nullableString(value.updatedAt)
  const lastSyncedAt = nullableString(value.lastSyncedAt)

  if (!isString(slug) || slug === '') {
    return 'slug is missing'
  }

  if (
    !isString(title) ||
    description === undefined ||
    group === undefined ||
    !seo ||
    !isString(seo.title) ||
    seoDescription === undefined ||
    seoImage === undefined ||
    !urls ||
    !isString(urls.docs) ||
    !isString(urls.product) ||
    !stack ||
    updatedAt === undefined ||
    lastSyncedAt === undefined
  ) {
    return `project "${slug}" does not match schema version ${DOCS_PROJECTS_SCHEMA_VERSION}`
  }

  return {
    slug,
    description,
    group,
    lastSyncedAt,
    seo: { description: seoDescription, image: seoImage, title: seo.title },
    stack,
    title,
    updatedAt,
    urls: { docs: urls.docs, product: urls.product },
  }
}

const checkSchemaVersion = (
  value: unknown,
): { code: DocsProjectsParseErrorCode; message: string; ok: false } | { ok: true } => {
  if (!isRecord(value)) {
    return { code: 'invalid_response', message: 'Response is not a JSON object.', ok: false }
  }

  if (value.schemaVersion === undefined) {
    return {
      code: 'schema_missing',
      message: 'Response has no schemaVersion; the site does not serve the projects API.',
      ok: false,
    }
  }

  if (value.schemaVersion !== DOCS_PROJECTS_SCHEMA_VERSION) {
    return {
      code: 'schema_unsupported',
      message: `Response uses schema version ${JSON.stringify(value.schemaVersion)}; this client understands version ${DOCS_PROJECTS_SCHEMA_VERSION}.`,
      ok: false,
    }
  }

  return { ok: true }
}

export const parseDocsProjectsListResponse = (
  value: unknown,
): DocsProjectsParseResult<DocsProjectsListResponse> => {
  const version = checkSchemaVersion(value)

  if (!version.ok) {
    return version
  }

  const record = value as Record<string, unknown>

  if (!Array.isArray(record.projects) || !Array.isArray(record.groups)) {
    return { code: 'invalid_response', message: 'Response has no projects or groups array.', ok: false }
  }

  const warnings: string[] = []
  const projects: DocsProject[] = []
  const groups: DocsProjectsGroup[] = []

  for (const entry of record.projects) {
    const project = parseDocsProject(entry)

    if (typeof project === 'string') {
      warnings.push(project)
    } else {
      projects.push(project)
    }
  }

  for (const entry of record.groups) {
    const group = parseGroup(entry)

    if (group) {
      groups.push(group)
    } else {
      warnings.push('a group does not match the schema')
    }
  }

  return {
    ok: true,
    value: { groups, projects, schemaVersion: DOCS_PROJECTS_SCHEMA_VERSION },
    warnings,
  }
}

export const parseDocsProjectResponse = (value: unknown): DocsProjectsParseResult<DocsProjectResponse> => {
  const version = checkSchemaVersion(value)

  if (!version.ok) {
    return version
  }

  const project = parseDocsProject((value as Record<string, unknown>).project)

  if (typeof project === 'string') {
    return { code: 'invalid_response', message: project, ok: false }
  }

  return {
    ok: true,
    value: { project, schemaVersion: DOCS_PROJECTS_SCHEMA_VERSION },
    warnings: [],
  }
}
