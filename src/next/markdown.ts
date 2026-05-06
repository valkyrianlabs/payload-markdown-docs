import type {
  DocsAiExportManifest,
  DocsValidationIssue,
} from '../sync/index.js'
import type {
  PayloadMarkdownDocsCollectionSlugs,
  PayloadMarkdownDocsReadPayload,
  ResolvedPayloadMarkdownDocsRecord,
  ResolvedPayloadMarkdownDocsSet,
  ResolvePayloadMarkdownDocsRouteOptions,
} from './types.js'

import {
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
  DEFAULT_MARKDOWN_FIELD_NAME,
} from '../constants.js'
import { normalizeRoutePath } from '../routing/index.js'
import {
  isExcludedFromAiExport,
} from '../sync/index.js'
import {
  isVisibleDocsRecord,
  toResolvedDocsRecord,
  toResolvedDocsSet,
} from './records.js'

export type ResolvedPayloadMarkdownDocsMarkdownRoute = {
  contentType: 'text/markdown; charset=utf-8'
  docsSet: ResolvedPayloadMarkdownDocsSet
  markdown: string
  output: string
  route: string
  type: 'markdown'
  warnings: DocsValidationIssue[]
}

export type ResolvePayloadMarkdownDocsMarkdownRouteOptions =
  ResolvePayloadMarkdownDocsRouteOptions

type ResolvedCollectionSlugs = {
  docs: string
  docsGroups: string
  docsSets: string
}

const resolveCollectionSlugs = (
  collections?: PayloadMarkdownDocsCollectionSlugs,
): ResolvedCollectionSlugs => ({
  docs: collections?.docs ?? DEFAULT_DOCS_COLLECTION_SLUG,
  docsGroups: collections?.docsGroups ?? DEFAULT_DOCS_GROUPS_COLLECTION_SLUG,
  docsSets: collections?.docsSets ?? DEFAULT_DOCS_SETS_COLLECTION_SLUG,
})

const getRoutePath = ({
  path,
  slug,
}: Pick<ResolvePayloadMarkdownDocsRouteOptions, 'path' | 'slug'>): string => {
  if (path !== undefined) {
    return normalizeRoutePath(path)
  }

  if (Array.isArray(slug)) {
    return normalizeRoutePath(slug.length === 0 ? '/' : slug.join('/'))
  }

  if (typeof slug === 'string') {
    return normalizeRoutePath(slug)
  }

  return '/'
}

const stripMarkdownRouteSuffix = (route: string): string | undefined =>
  route.toLowerCase().endsWith('.md') ? route.slice(0, -3) : undefined

const findDocsSetByRouteBase = async ({
  collections,
  overrideAccess,
  payload,
  routeBase,
}: {
  collections: ResolvedCollectionSlugs
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
  routeBase: string
}): Promise<ResolvedPayloadMarkdownDocsSet | undefined> => {
  const result = await payload.find({
    collection: collections.docsSets,
    depth: 0,
    limit: 1,
    overrideAccess,
    where: {
      routeBase: {
        equals: routeBase,
      },
    },
  })

  return result.docs
    .map(toResolvedDocsSet)
    .find((docsSet) => docsSet?.routeBase === routeBase)
}

const findDocsSetByAiExportOutput = async ({
  collections,
  overrideAccess,
  output,
  payload,
}: {
  collections: ResolvedCollectionSlugs
  output: string
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
}): Promise<ResolvedPayloadMarkdownDocsSet | undefined> => {
  const result = await payload.find({
    collection: collections.docsSets,
    depth: 0,
    limit: 1000,
    overrideAccess,
  })

  return result.docs
    .map(toResolvedDocsSet)
    .find((docsSet) => docsSet?.aiExport?.output === output)
}

const findDocsSetForMarkdownRoute = async ({
  collections,
  overrideAccess,
  payload,
  route,
}: {
  collections: ResolvedCollectionSlugs
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
  route: string
}): Promise<ResolvedPayloadMarkdownDocsSet | undefined> => {
  const routeBase = stripMarkdownRouteSuffix(route)

  if (!routeBase) {
    return undefined
  }

  const docsSet = await findDocsSetByRouteBase({
    collections,
    overrideAccess,
    payload,
    routeBase,
  })

  return (
    docsSet ??
    findDocsSetByAiExportOutput({
      collections,
      output: route,
      overrideAccess,
      payload,
    })
  )
}

const getDocsRecords = async ({
  collections,
  docsSet,
  includeDrafts,
  markdownField,
  overrideAccess,
  payload,
}: {
  collections: ResolvedCollectionSlugs
  docsSet: ResolvedPayloadMarkdownDocsSet
  includeDrafts: boolean
  markdownField: string
  overrideAccess: boolean
  payload: PayloadMarkdownDocsReadPayload
}): Promise<ResolvedPayloadMarkdownDocsRecord[]> => {
  const result = await payload.find({
    collection: collections.docs,
    depth: 0,
    limit: 1000,
    overrideAccess,
    where: {
      docsSet: {
        equals: docsSet.id,
      },
    },
  })

  return result.docs
    .map((doc) =>
      toResolvedDocsRecord({
        doc,
        markdownField,
      }),
    )
    .filter(
      (record): record is ResolvedPayloadMarkdownDocsRecord =>
        record !== undefined &&
        isVisibleDocsRecord({
          includeDrafts,
          record,
        }),
    )
}

const compareDocsRecords = (
  first: ResolvedPayloadMarkdownDocsRecord,
  second: ResolvedPayloadMarkdownDocsRecord,
): number => {
  if (first.order !== second.order) {
    return first.order - second.order
  }

  const titleCompare = first.title.localeCompare(second.title)

  if (titleCompare !== 0) {
    return titleCompare
  }

  const pathCompare = first.sourcePath.localeCompare(second.sourcePath)

  return pathCompare !== 0 ? pathCompare : first.id.localeCompare(second.id)
}

const getDefaultAiExportManifest = (
  docsSet: ResolvedPayloadMarkdownDocsSet,
): DocsAiExportManifest => ({
  canonical: docsSet.routeBase,
  exclude: [],
  headingMode: 'normalize',
  order: [],
  orphans: 'append',
  output: `${docsSet.routeBase}.md`,
  sourcePath: 'fallback',
  title: docsSet.title,
  version: 1,
})

const orderDocsRecords = ({
  manifest,
  records,
}: {
  manifest: DocsAiExportManifest
  records: ResolvedPayloadMarkdownDocsRecord[]
}): {
  ordered: ResolvedPayloadMarkdownDocsRecord[]
  warnings: DocsValidationIssue[]
} => {
  const recordsBySourcePath = new Map(records.map((record) => [record.sourcePath, record]))
  const listedRecords: ResolvedPayloadMarkdownDocsRecord[] = []
  const listedSourcePaths = new Set<string>()
  const warnings: DocsValidationIssue[] = []

  for (const orderedPath of manifest.order) {
    listedSourcePaths.add(orderedPath)
    const record = recordsBySourcePath.get(orderedPath)

    if (!record) {
      warnings.push({
        code: 'missing_ai_export_order_path',
        message: `AI export manifest order path "${orderedPath}" does not exist in the generated docs records.`,
        path: manifest.sourcePath,
      })
      continue
    }

    listedRecords.push(record)
  }

  if (manifest.orphans === 'ignore') {
    return {
      ordered: listedRecords,
      warnings,
    }
  }

  const orphans = records
    .filter((record) => !listedSourcePaths.has(record.sourcePath))
    .sort(compareDocsRecords)

  return {
    ordered: [...listedRecords, ...orphans],
    warnings,
  }
}

const shiftMarkdownHeadings = (markdown: string): string =>
  markdown.replace(/^(#{1,6})(\s+)/gm, (match, hashes: string, whitespace: string) =>
    hashes.length >= 5 ? `${'#'.repeat(6)}${whitespace}` : `${hashes}##${whitespace}`,
  )

const sectionTitle = (record: ResolvedPayloadMarkdownDocsRecord): string =>
  record.title.trim() || record.sourcePath

const renderMarkdownExport = ({
  docsSet,
  manifest,
  records,
}: {
  docsSet: ResolvedPayloadMarkdownDocsSet
  manifest: DocsAiExportManifest
  records: ResolvedPayloadMarkdownDocsRecord[]
}): string => {
  const lines: string[] = []
  const title = manifest.title ?? docsSet.title
  const canonical = manifest.canonical ?? docsSet.routeBase
  const output = manifest.output ?? `${docsSet.routeBase}.md`

  lines.push(`# ${title}`)
  lines.push('')
  lines.push(`Canonical: ${canonical}`)
  lines.push(`Output: ${output}`)

  if (manifest.description) {
    lines.push('', manifest.description.trim())
  }

  if (manifest.preamble) {
    lines.push('', manifest.preamble.trim())
  }

  for (const record of records) {
    const content = record.content?.trim()

    if (!content) {
      continue
    }

    if (manifest.headingMode === 'preserve') {
      lines.push('', content)
      continue
    }

    lines.push('', `## ${sectionTitle(record)}`, '', shiftMarkdownHeadings(content))
  }

  return `${lines.join('\n').replace(/\n{4,}/g, '\n\n\n').trimEnd()}\n`
}

export const resolvePayloadMarkdownDocsMarkdownRoute = async ({
  slug,
  collections: collectionOptions,
  includeDrafts = false,
  markdownField = DEFAULT_MARKDOWN_FIELD_NAME,
  // Route adapter reads plugin-owned generated docs collections server-side.
  // Access is overridden here, then public visibility and manifest exclusions are enforced.
  overrideAccess = true,
  path,
  payload,
}: ResolvePayloadMarkdownDocsMarkdownRouteOptions): Promise<
  null | ResolvedPayloadMarkdownDocsMarkdownRoute
> => {
  const route = getRoutePath({
    path,
    slug,
  })
  const collections = resolveCollectionSlugs(collectionOptions)
  const docsSet = await findDocsSetForMarkdownRoute({
    collections,
    overrideAccess,
    payload,
    route,
  })

  if (!docsSet) {
    return null
  }

  const manifest = docsSet.aiExport ?? getDefaultAiExportManifest(docsSet)
  const records = (
    await getDocsRecords({
      collections,
      docsSet,
      includeDrafts,
      markdownField,
      overrideAccess,
      payload,
    })
  ).filter(
    (record) =>
      !isExcludedFromAiExport({
        exclude: manifest.exclude,
        sourcePath: record.sourcePath,
      }),
  )
  const ordered = orderDocsRecords({
    manifest,
    records,
  })

  return {
    contentType: 'text/markdown; charset=utf-8',
    docsSet,
    markdown: renderMarkdownExport({
      docsSet,
      manifest,
      records: ordered.ordered,
    }),
    output: manifest.output ?? `${docsSet.routeBase}.md`,
    route,
    type: 'markdown',
    warnings: ordered.warnings,
  }
}

export const createPayloadMarkdownDocsMarkdownResponse = async (
  options: ResolvePayloadMarkdownDocsMarkdownRouteOptions,
): Promise<Response | null> => {
  const resolved = await resolvePayloadMarkdownDocsMarkdownRoute(options)

  if (!resolved) {
    return null
  }

  return new Response(resolved.markdown, {
    headers: {
      'Content-Type': resolved.contentType,
    },
    status: 200,
  })
}
