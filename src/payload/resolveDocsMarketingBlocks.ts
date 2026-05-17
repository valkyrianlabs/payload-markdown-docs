import type { CollectionAfterReadHook } from 'payload'

import type {
  DocsAssetReference,
  DocsCTAButtonInput,
  DocsPageReference,
  DocsRelationship,
  DocsRelationshipID,
  DocsSetReference,
  DocsWhere,
  SkillCTAGroupInput,
} from '../marketing/types.js'

import { isDocsSetHeroType } from '../fields/index.js'
import { resolveDocsSetSkills } from '../utilities/index.js'
import {
  getDocsPageTitle,
  getDocsRelationshipId,
  getDocsRelationshipRecord,
  getDocsSetTitle,
  getText,
  getTypedDocsPageHref,
  getTypedDocsSetPublicHref,
  isRecord,
} from '../utilities/normalizeShared.js'

type ResolveDocsMarketingBlocksOptions = {
  docsAssetsCollectionSlug: string
  docsCollectionSlug: string
  docsSetsCollectionSlug: string
}

type DocsMarketingBlocksPayloadOperations = {
  find: (args: {
    collection: string
    depth?: number
    limit?: number
    overrideAccess?: boolean
    sort?: string
    where?: DocsWhere
  }) => Promise<{
    docs: DocsAssetReference[]
  }>
  findByID: (args: {
    collection: string
    depth?: number
    id: DocsRelationshipID
    overrideAccess?: boolean
  }) => Promise<DocsPageReference | DocsSetReference | null>
}

type DocsMarketingBlockRecord = {
  blockType?: null | string
  ctaButtons?: DocsCTAButtonInput[] | null
  docsPage?: DocsRelationship<DocsPageReference> | null
  docsSet?: DocsRelationship<DocsSetReference> | null
  skills?: null | SkillCTAGroupInput
} & Record<string, unknown>

type ResolverContext = {
  docsPageById: Map<string, Promise<DocsPageReference | null>>
  docsSetById: Map<string, Promise<DocsSetReference | null>>
  options: ResolveDocsMarketingBlocksOptions
  payload: DocsMarketingBlocksPayloadOperations
}

const docsMarketingBlockTypes = new Set<string>([
  'docsBanner',
  'docsCallout',
  'docsCTA',
  'docsPreview',
])

const isDocsMarketingBlockRecord = (value: unknown): value is DocsMarketingBlockRecord =>
  isRecord(value) &&
  ((typeof value.blockType === 'string' && docsMarketingBlockTypes.has(value.blockType)) ||
    isDocsSetHeroType(value.type))

const shouldHydrateDocsSet = (
  docsSet: DocsRelationship<DocsSetReference> | null | undefined,
): boolean => {
  if (!getDocsRelationshipId(docsSet)) {
    return false
  }

  if (!getDocsSetTitle(docsSet)) {
    return true
  }

  const record = getDocsRelationshipRecord(docsSet)
  const group = getDocsRelationshipRecord(record?.group)
  const productNestedNeedsGroupRoute =
    record?.routeMode === 'product-nested' &&
    !getText(record.productRoute) &&
    !getText(record.routeBase) &&
    !getText(group?.routePath) &&
    !getText(group?.slug)

  return productNestedNeedsGroupRoute || !getTypedDocsSetPublicHref(docsSet)
}

const shouldHydrateDocsPage = (
  docsPage: DocsRelationship<DocsPageReference> | null | undefined,
): boolean =>
  Boolean(
    getDocsRelationshipId(docsPage) &&
      (!getDocsPageTitle(docsPage) || !getTypedDocsPageHref(docsPage)),
  )

const getCachedDocsSet = (
  id: string,
  context: ResolverContext,
): Promise<DocsSetReference | null> => {
  const existing = context.docsSetById.get(id)

  if (existing) {
    return existing
  }

  const promise = context.payload.findByID({
    id,
    collection: context.options.docsSetsCollectionSlug,
    depth: 2,
    overrideAccess: true,
  }) as Promise<DocsSetReference | null>

  context.docsSetById.set(id, promise)

  return promise
}

const getCachedDocsPage = (
  id: string,
  context: ResolverContext,
): Promise<DocsPageReference | null> => {
  const existing = context.docsPageById.get(id)

  if (existing) {
    return existing
  }

  const promise = context.payload.findByID({
    id,
    collection: context.options.docsCollectionSlug,
    depth: 1,
    overrideAccess: true,
  }) as Promise<DocsPageReference | null>

  context.docsPageById.set(id, promise)

  return promise
}

const resolveDocsSet = async (
  docsSet: DocsRelationship<DocsSetReference> | null | undefined,
  context: ResolverContext,
): Promise<DocsRelationship<DocsSetReference> | null | undefined> => {
  if (!shouldHydrateDocsSet(docsSet)) {
    return docsSet
  }

  const id = getDocsRelationshipId(docsSet)

  return id ? ((await getCachedDocsSet(id, context)) ?? docsSet) : docsSet
}

const resolveDocsPage = async (
  docsPage: DocsRelationship<DocsPageReference> | null | undefined,
  context: ResolverContext,
): Promise<DocsRelationship<DocsPageReference> | null | undefined> => {
  if (!shouldHydrateDocsPage(docsPage)) {
    return docsPage
  }

  const id = getDocsRelationshipId(docsPage)

  return id ? ((await getCachedDocsPage(id, context)) ?? docsPage) : docsPage
}

const resolveCTAButtons = async (
  buttons: DocsCTAButtonInput[] | null | undefined,
  context: ResolverContext,
): Promise<DocsCTAButtonInput[] | null | undefined> => {
  if (!Array.isArray(buttons)) {
    return buttons
  }

  return Promise.all(
    buttons.map(async (button) => {
      if (button.target !== 'setPage') {
        return button
      }

      return {
        ...button,
        page: await resolveDocsPage(button.page, context),
      }
    }),
  )
}

const resolveSkills = async (
  block: DocsMarketingBlockRecord,
  context: ResolverContext,
): Promise<SkillCTAGroupInput | undefined> => {
  if (block.skills?.enabled !== true) {
    return block.skills ?? undefined
  }

  return resolveDocsSetSkills({
    collectionSlug: context.options.docsAssetsCollectionSlug,
    docsSet: block.docsSet,
    payload: context.payload,
    skills: block.skills,
  })
}

const resolveDocsMarketingBlock = async (
  block: DocsMarketingBlockRecord,
  context: ResolverContext,
): Promise<void> => {
  block.docsSet = await resolveDocsSet(block.docsSet, context)
  block.docsPage = await resolveDocsPage(block.docsPage, context)
  block.ctaButtons = await resolveCTAButtons(block.ctaButtons, context)
  block.skills = await resolveSkills(block, context)
}

const traverseValue = async (value: unknown, context: ResolverContext): Promise<void> => {
  if (Array.isArray(value)) {
    await Promise.all(value.map((item) => traverseValue(item, context)))

    return
  }

  if (!isRecord(value)) {
    return
  }

  if (isDocsMarketingBlockRecord(value)) {
    await resolveDocsMarketingBlock(value, context)

    return
  }

  await Promise.all(Object.values(value).map((childValue) => traverseValue(childValue, context)))
}

export const resolveDocsMarketingBlocksAfterRead =
  (options: ResolveDocsMarketingBlocksOptions): CollectionAfterReadHook =>
  async ({ doc, req }) => {
    const context: ResolverContext = {
      docsPageById: new Map(),
      docsSetById: new Map(),
      options,
      payload: req.payload,
    }

    await traverseValue(doc, context)

    return doc
  }

export type { ResolveDocsMarketingBlocksOptions }
