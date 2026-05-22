import type { PayloadRequest } from 'payload'

import type { DocsSetPayloadOperations, ResolvedDocsSet } from '../payload/index.js'
import type { SkillBundle, SkillBundleAsset } from '../skillBundles.js'

import { findAllDocsSets } from '../payload/index.js'
import { normalizeRoutePath } from '../routing/index.js'
import { formatSkillAgentTitle, getSkillBundles } from '../skillBundles.js'
import { createPublicUrl, getPublicRequestOrigin } from './publicOrigin.js'

export type LlmsKind = 'llms' | 'llms-full'

export type LlmsPayloadOperations = {
  find: (args: {
    collection: string
    depth?: number
    draft?: boolean
    limit?: number
    overrideAccess?: boolean
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

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
  if (!isRecord(doc)) {
    return undefined
  }

  const sync = isRecord(doc.sync) ? doc.sync : undefined

  if (sync?.archived === true) {
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
  if (!isRecord(asset)) {
    return undefined
  }

  const sync = isRecord(asset.sync) ? asset.sync : undefined

  if (sync?.archived === true || asset.kind !== 'skill') {
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

const findDocsForDocsSet = async ({
  docsCollectionSlug,
  docsSet,
  markdownFieldName,
  payload,
}: {
  docsCollectionSlug: string
  docsSet: ResolvedDocsSet
  markdownFieldName: string
  payload: LlmsPayloadOperations
}): Promise<LlmsDocRecord[]> => {
  const result = await payload.find({
    collection: docsCollectionSlug,
    depth: 0,
    draft: false,
    limit: 1000,
    overrideAccess: true,
    sort: 'order',
    where: {
      and: [
        {
          docsSet: {
            equals: docsSet.id,
          },
        },
        {
          'sync.archived': {
            not_equals: true,
          },
        },
      ],
    },
  })

  return result.docs
    .flatMap((doc) => {
      const record = toLlmsDocRecord(doc, markdownFieldName)

      return record ? [record] : []
    })
    .sort(compareDocs)
}

const findSkillAssetsForDocsSet = async ({
  docsAssetsCollectionSlug,
  docsSet,
  payload,
}: {
  docsAssetsCollectionSlug: string
  docsSet: ResolvedDocsSet
  payload: LlmsPayloadOperations
}): Promise<LlmsSkillAsset[]> => {
  const result = await payload.find({
    collection: docsAssetsCollectionSlug,
    depth: 0,
    limit: 1000,
    overrideAccess: true,
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
                equals: docsSet.id,
              },
            },
            {
              sourceId: {
                equals: docsSet.slug,
              },
            },
            {
              'sync.sourceId': {
                equals: docsSet.slug,
              },
            },
          ],
        },
        {
          'sync.archived': {
            not_equals: true,
          },
        },
      ],
    },
  })

  return result.docs
    .flatMap((asset) => {
      const record = toLlmsSkillAsset(asset)

      return record ? [record] : []
    })
    .sort(compareSkills)
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

const loadDocsSetLlmsData = async ({
  allDocsSets,
  docsAssetsCollectionSlug,
  docsCollectionSlug,
  docsSet,
  markdownFieldName,
  payload,
}: {
  allDocsSets: ResolvedDocsSet[]
  docsAssetsCollectionSlug: string
  docsCollectionSlug: string
  docsSet: ResolvedDocsSet
  markdownFieldName: string
  payload: LlmsPayloadOperations
}): Promise<DocsSetLlmsData> => {
  const [docs, skillAssets] = await Promise.all([
    findDocsForDocsSet({
      docsCollectionSlug,
      docsSet,
      markdownFieldName,
      payload,
    }),
    findSkillAssetsForDocsSet({
      docsAssetsCollectionSlug,
      docsSet,
      payload,
    }),
  ])

  return {
    docs,
    relatedDocsSets: findRelatedDocsSets({
      allDocsSets,
      currentDocsSet: docsSet,
      docs,
    }),
    skills: getSkillBundles(skillAssets),
  }
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
      doc.content.trim(),
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
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': textContentType,
    },
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
}: GenerateLlmsOptions): Promise<string | undefined> => {
  if (!docsSet) {
    return undefined
  }

  const allDocsSets = await findAllDocsSets({
    collectionSlug: docsSetsCollectionSlug,
    docsGroupsCollectionSlug,
    payload,
  })
  const data = await loadDocsSetLlmsData({
    allDocsSets,
    docsAssetsCollectionSlug,
    docsCollectionSlug,
    docsSet,
    markdownFieldName,
    payload,
  })

  if (data.docs.length === 0 && data.skills.length === 0) {
    return undefined
  }

  const origin = getPublicRequestOrigin(req)

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
}: GenerateLlmsOptions): Promise<string | undefined> => {
  const docsSets = await findAllDocsSets({
    collectionSlug: docsSetsCollectionSlug,
    docsGroupsCollectionSlug,
    payload,
  })

  if (docsSets.length === 0) {
    return undefined
  }

  const rootData = await Promise.all(
    docsSets.map(async (docsSet) => ({
      docsSet,
      ...(await loadDocsSetLlmsData({
        allDocsSets: docsSets,
        docsAssetsCollectionSlug,
        docsCollectionSlug,
        docsSet,
        markdownFieldName,
        payload,
      })),
    })),
  )
  const origin = getPublicRequestOrigin(req)

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
