import type { CollectionAfterReadHook } from 'payload'

import type {
  DocsAssetReference,
  DocsBackgroundMediaInput,
  DocsCTAButtonInput,
  DocsMediaReference,
  DocsPageReference,
  DocsRelationship,
  DocsRelationshipID,
  DocsSetReference,
  DocsWhere,
  SkillCTAGroupInput,
} from '../marketing/types.js'

import { DEFAULT_MEDIA_COLLECTION_SLUG } from '../constants.js'
import { isDocsSetHeroType } from '../fields/index.js'
import { resolveDocsSetSkills } from '../utilities/index.js'
import {
  getDocsPageTitle,
  getDocsRelationshipId,
  getDocsRelationshipRecord,
  getDocsSetTitle,
  getText,
  getTypedDocsPageHref,
  getTypedDocsSetDocsHref,
  getTypedDocsSetPublicHref,
  isRecord,
} from '../utilities/normalizeShared.js'

type ResolveDocsMarketingBlocksOptions = {
  docsAssetsCollectionSlug: string
  docsCollectionSlug: string
  docsSetsCollectionSlug: string
  mediaCollectionSlug?: string
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
    draft?: boolean
    id: DocsRelationshipID
    locale?: string
    overrideAccess?: boolean
    user?: unknown
  }) => Promise<(DocsMediaReference | DocsPageReference | DocsSetReference | Record<string, unknown>) | null>
}

type DocsMarketingBlockRecord = {
  actionType?: null | string
  background?: DocsBackgroundMediaInput | null
  blockType?: null | string
  ctaButtons?: DocsCTAButtonInput[] | null
  description?: null | string
  docsLabel?: null | string
  docsPage?: DocsRelationship<DocsPageReference> | null
  docsSet?: DocsRelationship<DocsSetReference> | null
  heading?: null | string
  image?: DocsRelationship<DocsMediaReference> | null
  overrideContent?: boolean | null
  skills?: null | SkillCTAGroupInput
  variant?: null | string
} & Record<string, unknown>

type ResolverContext = {
  docsPageById: Map<string, Promise<DocsPageReference | null>>
  docsSetById: Map<string, Promise<DocsSetReference | null>>
  mediaById: Map<string, Promise<DocsMediaReference | null>>
  options: ResolveDocsMarketingBlocksOptions
  payload: DocsMarketingBlocksPayloadOperations
}

type DocsBackgroundMediaRecord = DocsBackgroundMediaInput & Record<string, unknown>

const docsMarketingBlockTypes = new Set<string>(['docsCTA'])

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
  const productNestedNeedsDocsRoute =
    record?.routeMode === 'product-nested' &&
    !getText(record.routeBase) &&
    !getText(group?.routePath) &&
    !getText(group?.slug)

  return (
    productNestedNeedsDocsRoute ||
    !getTypedDocsSetPublicHref(docsSet) ||
    !getTypedDocsSetDocsHref(docsSet)
  )
}

const shouldHydrateDocsPage = (
  docsPage: DocsRelationship<DocsPageReference> | null | undefined,
): boolean =>
  Boolean(
    getDocsRelationshipId(docsPage) &&
      (!getDocsPageTitle(docsPage) || !getTypedDocsPageHref(docsPage)),
  )

const shouldHydrateMedia = (
  media: DocsRelationship<DocsMediaReference> | null | undefined,
): boolean => Boolean(getDocsRelationshipId(media) && !getText(getDocsRelationshipRecord(media)?.url))

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

const getCachedMedia = (
  id: string,
  context: ResolverContext,
): Promise<DocsMediaReference | null> => {
  const existing = context.mediaById.get(id)

  if (existing) {
    return existing
  }

  const promise = context.payload.findByID({
    id,
    collection: context.options.mediaCollectionSlug ?? DEFAULT_MEDIA_COLLECTION_SLUG,
    depth: 0,
    overrideAccess: true,
  }) as Promise<DocsMediaReference | null>

  context.mediaById.set(id, promise)

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

const resolveMedia = async (
  media: DocsRelationship<DocsMediaReference> | null | undefined,
  context: ResolverContext,
): Promise<DocsRelationship<DocsMediaReference> | null | undefined> => {
  if (!shouldHydrateMedia(media)) {
    return media
  }

  const id = getDocsRelationshipId(media)

  return id ? ((await getCachedMedia(id, context)) ?? media) : media
}

const resolveBackgroundMedia = async (
  background: DocsBackgroundMediaInput | null | undefined,
  context: ResolverContext,
): Promise<DocsBackgroundMediaInput | null | undefined> => {
  if (!isRecord(background)) {
    return background
  }

  const record = background as DocsBackgroundMediaRecord
  const resolvedRecord: DocsBackgroundMediaRecord = {
    ...record,
  }

  for (const key of ['media', 'image', 'backgroundImage'] as const) {
    const resolved = await resolveMedia(record[key], context)

    if (resolved !== record[key]) {
      resolvedRecord[key] = resolved
    }
  }

  return resolvedRecord
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

const resolveDocsCTASkills = async (
  block: DocsMarketingBlockRecord,
  context: ResolverContext,
): Promise<SkillCTAGroupInput | undefined> => {
  if (block.actionType !== 'skills') {
    return block.skills ?? undefined
  }

  return resolveDocsSetSkills({
    collectionSlug: context.options.docsAssetsCollectionSlug,
    docsSet: block.docsSet,
    payload: context.payload,
    skills: {
      ...(block.skills ?? {}),
      display: block.skills?.display ?? 'buttons',
      enabled: true,
    },
  })
}

const resolveDocsCTABlock = async (
  block: DocsMarketingBlockRecord,
  context: ResolverContext,
): Promise<void> => {
  block.docsSet = await resolveDocsSet(block.docsSet, context)
  block.background =
    block.variant === 'full' ? await resolveBackgroundMedia(block.background, context) : block.background
  block.skills = await resolveDocsCTASkills(block, context)
}

const resolveDocsSetHeroBlock = async (
  block: DocsMarketingBlockRecord,
  context: ResolverContext,
): Promise<void> => {
  block.docsSet = await resolveDocsSet(block.docsSet, context)
  block.docsPage = await resolveDocsPage(block.docsPage, context)
  block.background = await resolveBackgroundMedia(block.background, context)
  block.image = await resolveMedia(block.image, context)
  block.ctaButtons = await resolveCTAButtons(block.ctaButtons, context)
  block.skills = await resolveSkills(block, context)
}

const resolveDocsMarketingBlock = async (
  block: DocsMarketingBlockRecord,
  context: ResolverContext,
): Promise<void> => {
  if (block.blockType === 'docsCTA') {
    await resolveDocsCTABlock(block, context)

    return
  }

  await resolveDocsSetHeroBlock(block, context)
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
      mediaById: new Map(),
      options,
      payload: req.payload,
    }

    await traverseValue(doc, context)

    return doc
  }

export type { ResolveDocsMarketingBlocksOptions }
