import type { PayloadRequest } from 'payload'

import type { DocsSetPayloadOperations, ResolvedDocsSet } from '../payload/index.js'
import type { SkillBundle, SkillBundleAsset } from '../skillBundles.js'

import { findAllDocsSets } from '../payload/index.js'
import {
  isPublicDocsAssetRecord,
  isPublicDocsRecord,
  notArchivedWhere,
} from '../payload/visibility.js'
import { rewritePayloadMarkdownDocsLinks } from '../routing/docsLinks.js'
import { normalizeRoutePath } from '../routing/index.js'
import { getRelationshipId, getString, isRecord } from '../shared/records.js'
import { formatSkillAgentTitle, getSkillBundles } from '../skillBundles.js'
import { createSafeAssetHeaders } from './assetContentTypes.js'
import { createPublicUrl, getPublicRequestOrigin } from './publicOrigin.js'

export type LlmsKind = 'llms' | 'llms-full'

export type LlmsPayloadOperations = {
  find: (args: {
    collection: string
    depth?: number
    draft?: boolean
    limit?: number
    overrideAccess?: boolean
    pagination?: boolean
    select?: Record<string, boolean>
    sort?: string
    where?: unknown
  }) => Promise<{
    docs: unknown[]
  }>
} & DocsSetPayloadOperations

export type GenerateLlmsOptions = {
  docsAssetsCollectionSlug: string
  docsCollectionSlug: string
  docsGroupsCollectionSlug: string
  docsSet?: ResolvedDocsSet
  docsSetsCollectionSlug: string
  kind: LlmsKind
  markdownFieldName: string
  payload: LlmsPayloadOperations
  req: PayloadRequest
  /** Honor X-Forwarded-Host/-Proto when no public origin is configured (DOCS-18). */
  trustForwardedHeaders?: boolean
}

type LlmsDocRecord = {
  content: string
  dependencies: string[]
  depth: number
  description?: string
  navTitle?: string
  order: number
  route: string
  sourcePath: string
  title: string
}

type LlmsSkillAsset = {
  content: string
  contentType: string
  route: string
  sourcePath: string
} & SkillBundleAsset

type DocsSetLlmsData = {
  docs: LlmsDocRecord[]
  relatedDocsSets: ResolvedDocsSet[]
  skills: SkillBundle[]
}

type RootLlmsData = {
  docsSet: ResolvedDocsSet
} & DocsSetLlmsData

const textContentType = 'text/plain; charset=utf-8'

const getNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const getStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    const value = getString(item)

    return value ? [value] : []
  })
}

const compactText = (value: string): string => value.replace(/\s+/g, ' ').trim()

const toLlmsDocRecord = (doc: unknown, markdownFieldName: string): LlmsDocRecord | undefined => {
  // Drafts (including never-published docs returned by `draft: false`) and archived docs
  // must never reach public AI discovery files.
  if (!isRecord(doc) || !isPublicDocsRecord(doc)) {
    return undefined
  }

  const route = getString(doc.route)
  const sourcePath = getString(doc.sourcePath)
  const title = getString(doc.title)

  if (!route || !sourcePath || !title) {
    return undefined
  }

  const overrides = isRecord(doc.overrides) ? doc.overrides : undefined
  const content = getString(doc[markdownFieldName]) ?? ''

  return {
    content,
    dependencies: getStringArray(doc.dependencies),
    depth: getNumber(doc.depth) ?? 0,
    description: getString(doc.description),
    navTitle: getString(overrides?.navTitle) ?? getString(doc.navTitle),
    order: getNumber(doc.order) ?? 0,
    route: normalizeRoutePath(route),
    sourcePath,
    title,
  }
}

const toLlmsSkillAsset = (asset: unknown): LlmsSkillAsset | undefined => {
  if (!isRecord(asset) || !isPublicDocsAssetRecord(asset)) {
    return undefined
  }

  if (asset.kind !== 'skill') {
    return undefined
  }

  const content = getString(asset.content)
  const contentType = getString(asset.contentType)
  const route = getString(asset.route)
  const sourcePath = getString(asset.sourcePath)

  if (!content || !contentType || !route || !sourcePath) {
    return undefined
  }

  return {
    content,
    contentType,
    route: normalizeRoutePath(route),
    sourcePath,
  }
}

const compareDocs = (first: LlmsDocRecord, second: LlmsDocRecord): number =>
  first.order - second.order ||
  first.depth - second.depth ||
  first.route.localeCompare(second.route)

const compareSkills = (first: LlmsSkillAsset, second: LlmsSkillAsset): number =>
  first.sourcePath.localeCompare(second.sourcePath)

/**
 * Docs sets per docs/assets query. Root llms.txt / llms-full.txt used to issue two
 * queries per docs set; they are now batched with `in` constraints (bounded by this
 * size) and partitioned per docs set in memory.
 */
export const LLMS_DOCS_SET_BATCH_SIZE = 100

/**
 * Runs one query per batch of at most LLMS_DOCS_SET_BATCH_SIZE docs sets (at most
 * ceil(n / batch size) queries in flight) and returns the results in batch order.
 */
const findForDocsSetBatches = (
  docsSets: readonly ResolvedDocsSet[],
  query: (batch: ResolvedDocsSet[]) => Promise<{ docs: unknown[] }>,
): Promise<Array<{ batch: ResolvedDocsSet[]; docs: unknown[] }>> => {
  const batches: ResolvedDocsSet[][] = []

  for (let index = 0; index < docsSets.length; index += LLMS_DOCS_SET_BATCH_SIZE) {
    batches.push(docsSets.slice(index, index + LLMS_DOCS_SET_BATCH_SIZE))
  }

  return Promise.all(
    batches.map(async (batch) => ({
      batch,
      docs: (await query(batch)).docs,
    })),
  )
}

/** Fields the index renderers read; leaves out the markdown body. */
const LLMS_DOC_INDEX_SELECT = {
  _status: true,
  dependencies: true,
  depth: true,
  description: true,
  docsSet: true,
  navTitle: true,
  order: true,
  overrides: true,
  route: true,
  sourcePath: true,
  sync: true,
  title: true,
}

/**
 * Public docs of each docs set (keyed by docs set id), sorted for rendering. Without
 * `includeContent` the markdown body is not loaded (index renderers do not use it).
 */
const findDocsByDocsSet = async ({
  docsCollectionSlug,
  docsSets,
  includeContent,
  markdownFieldName,
  payload,
}: {
  docsCollectionSlug: string
  docsSets: readonly ResolvedDocsSet[]
  includeContent: boolean
  markdownFieldName: string
  payload: LlmsPayloadOperations
}): Promise<Map<string, LlmsDocRecord[]>> => {
  const docsByDocsSet = new Map(
    docsSets.map((docsSet) => [String(docsSet.id), [] as LlmsDocRecord[]]),
  )

  const results = await findForDocsSetBatches(docsSets, (batch) =>
    payload.find({
      collection: docsCollectionSlug,
      depth: 0,
      draft: false,
      overrideAccess: true,
      pagination: false,
      ...(includeContent ? {} : { select: LLMS_DOC_INDEX_SELECT }),
      sort: 'order',
      where: {
        and: [
          {
            docsSet: {
              in: batch.map((docsSet) => docsSet.id),
            },
          },
          notArchivedWhere(),
        ],
      },
    }),
  )

  for (const { docs: batchDocs } of results) {
    for (const doc of batchDocs) {
      const docsSetId = isRecord(doc) ? getRelationshipId(doc.docsSet) : undefined
      const docs = docsSetId === undefined ? undefined : docsByDocsSet.get(docsSetId)
      const record = docs ? toLlmsDocRecord(doc, markdownFieldName) : undefined

      if (docs && record) {
        docs.push(record)
      }
    }
  }

  for (const docs of docsByDocsSet.values()) {
    docs.sort(compareDocs)
  }

  return docsByDocsSet
}

/** Same ownership rule as the per-docs-set asset query: relationship, source id, or sync source id. */
const isSkillAssetOfDocsSet = (asset: Record<string, unknown>, docsSet: ResolvedDocsSet): boolean =>
  getRelationshipId(asset.docsSet) === String(docsSet.id) ||
  asset.sourceId === docsSet.slug ||
  (isRecord(asset.sync) && asset.sync.sourceId === docsSet.slug)

/** Public skill assets of each docs set (keyed by docs set id), sorted by source path. */
const findSkillAssetsByDocsSet = async ({
  docsAssetsCollectionSlug,
  docsSets,
  payload,
}: {
  docsAssetsCollectionSlug: string
  docsSets: readonly ResolvedDocsSet[]
  payload: LlmsPayloadOperations
}): Promise<Map<string, LlmsSkillAsset[]>> => {
  const assetsByDocsSet = new Map(
    docsSets.map((docsSet) => [String(docsSet.id), [] as LlmsSkillAsset[]]),
  )

  const results = await findForDocsSetBatches(docsSets, (batch) => {
    const slugs = batch.map((docsSet) => docsSet.slug)

    return payload.find({
      collection: docsAssetsCollectionSlug,
      depth: 0,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [
          {
            kind: {
              equals: 'skill',
            },
          },
          {
            or: [
              {
                docsSet: {
                  in: batch.map((docsSet) => docsSet.id),
                },
              },
              {
                sourceId: {
                  in: slugs,
                },
              },
              {
                'sync.sourceId': {
                  in: slugs,
                },
              },
            ],
          },
          notArchivedWhere(),
        ],
      },
    })
  })

  for (const { batch, docs: assets } of results) {
    for (const asset of assets) {
      const record = isRecord(asset) ? toLlmsSkillAsset(asset) : undefined

      if (!record || !isRecord(asset)) {
        continue
      }

      for (const docsSet of batch) {
        if (isSkillAssetOfDocsSet(asset, docsSet)) {
          assetsByDocsSet.get(String(docsSet.id))?.push(record)
        }
      }
    }
  }

  for (const assets of assetsByDocsSet.values()) {
    assets.sort(compareSkills)
  }

  return assetsByDocsSet
}

const normalizeDependencySlug = (dependency: string): string | undefined => {
  const cleanDependency = dependency.trim().replace(/^npm:/, '')

  if (!cleanDependency) {
    return undefined
  }

  if (cleanDependency.startsWith('@')) {
    const slashIndex = cleanDependency.indexOf('/')

    if (slashIndex === -1) {
      return undefined
    }

    return cleanDependency.slice(slashIndex + 1).split('@')[0]
  }

  return cleanDependency.split('@')[0]
}

const findRelatedDocsSets = ({
  allDocsSets,
  currentDocsSet,
  docs,
}: {
  allDocsSets: ResolvedDocsSet[]
  currentDocsSet: ResolvedDocsSet
  docs: LlmsDocRecord[]
}): ResolvedDocsSet[] => {
  const docsSetsBySlug = new Map(allDocsSets.map((docsSet) => [docsSet.slug, docsSet]))
  const docsSetsById = new Map(allDocsSets.map((docsSet) => [String(docsSet.id), docsSet]))
  const relatedDocsSets = new Map<string, ResolvedDocsSet>()

  for (const dependency of docs.flatMap((doc) => doc.dependencies)) {
    const slug = normalizeDependencySlug(dependency)
    const docsSet = slug ? (docsSetsBySlug.get(slug) ?? docsSetsById.get(slug)) : undefined

    if (docsSet && docsSet.id !== currentDocsSet.id) {
      relatedDocsSets.set(String(docsSet.id), docsSet)
    }
  }

  return [...relatedDocsSets.values()].sort((first, second) =>
    first.routeBase.localeCompare(second.routeBase),
  )
}

/** Llms data for each of `docsSets`, in the same order, from batched queries. */
const loadLlmsData = async ({
  allDocsSets,
  docsAssetsCollectionSlug,
  docsCollectionSlug,
  docsSets,
  includeContent,
  markdownFieldName,
  payload,
}: {
  allDocsSets: ResolvedDocsSet[]
  docsAssetsCollectionSlug: string
  docsCollectionSlug: string
  docsSets: ResolvedDocsSet[]
  includeContent: boolean
  markdownFieldName: string
  payload: LlmsPayloadOperations
}): Promise<RootLlmsData[]> => {
  const [docsByDocsSet, skillAssetsByDocsSet] = await Promise.all([
    findDocsByDocsSet({
      docsCollectionSlug,
      docsSets,
      includeContent,
      markdownFieldName,
      payload,
    }),
    findSkillAssetsByDocsSet({
      docsAssetsCollectionSlug,
      docsSets,
      payload,
    }),
  ])

  return docsSets.map((docsSet) => {
    const docs = docsByDocsSet.get(String(docsSet.id)) ?? []

    return {
      docs,
      docsSet,
      relatedDocsSets: findRelatedDocsSets({
        allDocsSets,
        currentDocsSet: docsSet,
        docs,
      }),
      skills: getSkillBundles(skillAssetsByDocsSet.get(String(docsSet.id)) ?? []),
    }
  })
}

const renderLinkList = (
  items: Array<{
    description?: string
    title: string
    url: string
  }>,
): string[] =>
  items.map((item) =>
    item.description
      ? `- ${compactText(item.title)}: ${item.url} - ${compactText(item.description)}`
      : `- ${compactText(item.title)}: ${item.url}`,
  )

const getSkillBundleLinkItems = ({
  bundle,
  origin,
  titlePrefix = '',
}: {
  bundle: SkillBundle
  origin?: string
  titlePrefix?: string
}): Array<{
  title: string
  url: string
}> => [
  {
    title: `${titlePrefix}${bundle.title}`,
    url: createPublicUrl(origin, bundle.rootRoute),
  },
  {
    title: `${titlePrefix}${formatSkillAgentTitle(bundle.agent)} SKILL.md`,
    url: createPublicUrl(origin, bundle.skillRoute),
  },
  {
    title: `${titlePrefix}${formatSkillAgentTitle(bundle.agent)} skill archive`,
    url: createPublicUrl(origin, bundle.archiveRoute),
  },
]

const renderDocsSetLlms = ({
  data,
  docsSet,
  origin,
}: {
  data: DocsSetLlmsData
  docsSet: ResolvedDocsSet
  origin?: string
}): string => {
  const lines = [`# ${compactText(docsSet.title)}`, '']

  if (docsSet.description) {
    lines.push(compactText(docsSet.description), '')
  }

  lines.push(`Canonical URL: ${createPublicUrl(origin, docsSet.routeBase)}`, '')

  if (data.docs.length > 0) {
    lines.push(
      '## Documentation',
      ...renderLinkList(
        data.docs.map((doc) => ({
          description: doc.description,
          title: doc.navTitle ?? doc.title,
          url: createPublicUrl(origin, doc.route),
        })),
      ),
      '',
    )
  }

  if (data.skills.length > 0) {
    lines.push(
      '## Native Agent Skills',
      ...renderLinkList(
        data.skills.flatMap((bundle) =>
          getSkillBundleLinkItems({
            bundle,
            origin,
          }),
        ),
      ),
      '',
    )
  }

  if (data.relatedDocsSets.length > 0) {
    lines.push(
      '## Related Documentation',
      ...renderLinkList(
        data.relatedDocsSets.map((relatedDocsSet) => ({
          description: relatedDocsSet.description,
          title: relatedDocsSet.title,
          url: createPublicUrl(origin, relatedDocsSet.routeBase),
        })),
      ),
      '',
    )
  }

  return `${lines.join('\n').replace(/\n+$/g, '')}\n`
}

const renderDocsSetLlmsFull = ({
  data,
  docsSet,
  origin,
}: {
  data: DocsSetLlmsData
  docsSet: ResolvedDocsSet
  origin?: string
}): string => {
  const lines = [`# ${compactText(docsSet.title)} Full Documentation`, '']

  if (docsSet.description) {
    lines.push(compactText(docsSet.description), '')
  }

  lines.push(`Canonical URL: ${createPublicUrl(origin, docsSet.routeBase)}`, '')

  for (const doc of data.docs) {
    lines.push(
      `## ${compactText(doc.title)}`,
      '',
      `URL: ${createPublicUrl(origin, doc.route)}`,
      `Source: ${doc.sourcePath}`,
      '',
      // Resolve relative and docs-root links exactly like the HTML page (X-6).
      rewritePayloadMarkdownDocsLinks({
        doc,
        docsSet,
        markdown: doc.content.trim(),
      }),
      '',
    )
  }

  if (data.skills.length > 0) {
    lines.push('## Native Agent Skills', '')

    for (const bundle of data.skills) {
      lines.push(
        `### ${compactText(bundle.title)}`,
        '',
        `Root: ${createPublicUrl(origin, bundle.rootRoute)}`,
        `SKILL.md: ${createPublicUrl(origin, bundle.skillRoute)}`,
        `Archive: ${createPublicUrl(origin, bundle.archiveRoute)}`,
        '',
      )

      for (const artifact of bundle.files) {
        lines.push(
          `#### ${compactText(formatSkillAgentTitle(bundle.agent))} ${compactText(artifact.relativePath)}`,
          '',
          `URL: ${createPublicUrl(origin, artifact.route)}`,
          `Source: ${artifact.sourcePath}`,
          '',
          (artifact.content ?? '').trim(),
          '',
        )
      }
    }
  }

  if (data.relatedDocsSets.length > 0) {
    lines.push(
      '## Related Documentation',
      ...renderLinkList(
        data.relatedDocsSets.map((relatedDocsSet) => ({
          description: relatedDocsSet.description,
          title: relatedDocsSet.title,
          url: createPublicUrl(origin, relatedDocsSet.routeBase),
        })),
      ),
      '',
    )
  }

  return `${lines.join('\n').replace(/\n+$/g, '')}\n`
}

const renderRootLlms = ({
  docsSets,
  origin,
  rootData,
}: {
  docsSets: ResolvedDocsSet[]
  origin?: string
  rootData: RootLlmsData[]
}): string => {
  const skillLinks = rootData.flatMap((entry) =>
    entry.skills.flatMap((bundle) =>
      getSkillBundleLinkItems({
        bundle,
        origin,
        titlePrefix: `${entry.docsSet.title} `,
      }),
    ),
  )
  const lines = [
    '# Documentation',
    '',
    'Generated index for published documentation packages on this site.',
    '',
    '## Documentation Packages',
    ...renderLinkList(
      docsSets.map((docsSet) => ({
        description: docsSet.description,
        title: docsSet.title,
        url: createPublicUrl(origin, docsSet.routeBase),
      })),
    ),
    '',
  ]

  if (skillLinks.length > 0) {
    lines.push('## Native Agent Skills', ...renderLinkList(skillLinks), '')
  }

  lines.push('## Full Index', `- llms-full.txt: ${createPublicUrl(origin, '/llms-full.txt')}`, '')

  return `${lines.join('\n').replace(/\n+$/g, '')}\n`
}

const renderRootLlmsFull = ({
  docsSets,
  origin,
  rootData,
}: {
  docsSets: ResolvedDocsSet[]
  origin?: string
  rootData: RootLlmsData[]
}): string => {
  const lines = [
    '# AI Documentation Index',
    '',
    'Generated index for published documentation packages on this site.',
    '',
    '## Documentation Packages',
    ...renderLinkList(
      docsSets.map((docsSet) => ({
        description: docsSet.description,
        title: docsSet.title,
        url: createPublicUrl(origin, docsSet.routeBase),
      })),
    ),
    '',
  ]

  for (const entry of rootData) {
    lines.push(
      `## ${compactText(entry.docsSet.title)}`,
      '',
      `Canonical URL: ${createPublicUrl(origin, entry.docsSet.routeBase)}`,
      '',
    )

    if (entry.docs.length > 0) {
      lines.push(
        '### Documentation',
        ...renderLinkList(
          entry.docs.map((doc) => ({
            description: doc.description,
            title: doc.navTitle ?? doc.title,
            url: createPublicUrl(origin, doc.route),
          })),
        ),
        '',
      )
    }

    if (entry.skills.length > 0) {
      lines.push(
        '### Native Agent Skills',
        ...renderLinkList(
          entry.skills.flatMap((bundle) =>
            getSkillBundleLinkItems({
              bundle,
              origin,
            }),
          ),
        ),
        '',
      )

      for (const bundle of entry.skills) {
        lines.push(
          `#### ${compactText(bundle.title)}`,
          '',
          `Root: ${createPublicUrl(origin, bundle.rootRoute)}`,
          `SKILL.md: ${createPublicUrl(origin, bundle.skillRoute)}`,
          `Archive: ${createPublicUrl(origin, bundle.archiveRoute)}`,
          '',
        )

        for (const artifact of bundle.files) {
          lines.push(
            `##### ${compactText(formatSkillAgentTitle(bundle.agent))} ${compactText(artifact.relativePath)}`,
            '',
            `URL: ${createPublicUrl(origin, artifact.route)}`,
            `Source: ${artifact.sourcePath}`,
            '',
            (artifact.content ?? '').trim(),
            '',
          )
        }
      }
    }
  }

  return `${lines.join('\n').replace(/\n+$/g, '')}\n`
}

export const createLlmsResponse = (content: string): Response =>
  new Response(content, {
    headers: createSafeAssetHeaders(textContentType),
  })

export const generateDocsSetLlms = async ({
  docsAssetsCollectionSlug,
  docsCollectionSlug,
  docsGroupsCollectionSlug,
  docsSet,
  docsSetsCollectionSlug,
  kind,
  markdownFieldName,
  payload,
  req,
  trustForwardedHeaders,
}: GenerateLlmsOptions): Promise<string | undefined> => {
  if (!docsSet) {
    return undefined
  }

  const allDocsSets = await findAllDocsSets({
    collectionSlug: docsSetsCollectionSlug,
    docsGroupsCollectionSlug,
    payload,
  })
  const [data] = await loadLlmsData({
    allDocsSets,
    docsAssetsCollectionSlug,
    docsCollectionSlug,
    docsSets: [docsSet],
    includeContent: true,
    markdownFieldName,
    payload,
  })

  if (!data) {
    return undefined
  }

  if (data.docs.length === 0 && data.skills.length === 0) {
    return undefined
  }

  const origin = getPublicRequestOrigin(req, { trustForwardedHeaders })

  return kind === 'llms'
    ? renderDocsSetLlms({
        data,
        docsSet,
        origin,
      })
    : renderDocsSetLlmsFull({
        data,
        docsSet,
        origin,
      })
}

export const generateRootLlms = async ({
  docsAssetsCollectionSlug,
  docsCollectionSlug,
  docsGroupsCollectionSlug,
  docsSetsCollectionSlug,
  kind,
  markdownFieldName,
  payload,
  req,
  trustForwardedHeaders,
}: GenerateLlmsOptions): Promise<string | undefined> => {
  const docsSets = await findAllDocsSets({
    collectionSlug: docsSetsCollectionSlug,
    docsGroupsCollectionSlug,
    payload,
  })

  if (docsSets.length === 0) {
    return undefined
  }

  // The root index renders links only, so doc bodies are not loaded.
  const rootData = await loadLlmsData({
    allDocsSets: docsSets,
    docsAssetsCollectionSlug,
    docsCollectionSlug,
    docsSets,
    includeContent: false,
    markdownFieldName,
    payload,
  })
  const origin = getPublicRequestOrigin(req, { trustForwardedHeaders })

  return kind === 'llms'
    ? renderRootLlms({
        docsSets,
        origin,
        rootData,
      })
    : renderRootLlmsFull({
        docsSets,
        origin,
        rootData,
      })
}
