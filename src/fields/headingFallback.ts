import type { Validate } from 'payload'

import {
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
} from '../constants.js'
import {
  getRelationshipId,
  getRelationshipValue,
  getRouteLikeTitle,
  getString,
  isRecord,
} from '../utilities/normalizeShared.js'

type HeadingFallbackData = Record<string, unknown>

type HeadingFallbackPayload = {
  findByID?: (args: {
    collection: string
    depth?: number
    id: number | string
    overrideAccess?: boolean
  }) => Promise<unknown>
}

const missingHeadingMessage = (fallbackLabel: string): string =>
  `Add a heading or select a ${fallbackLabel} with a title.`

export const validateHeadingFallback =
  ({
    collectionSlug,
    fallbackField,
    fallbackLabel,
  }: {
    collectionSlug: string
    fallbackField: string
    fallbackLabel: string
  }): Validate<null | string | undefined, HeadingFallbackData, HeadingFallbackData> =>
  async (value, { req, siblingData }) => {
    if (getString(value)) {
      return true
    }

    const fallback = siblingData?.[fallbackField]
    const fallbackValue = getRelationshipValue(fallback)

    if (getRouteLikeTitle(fallbackValue)) {
      return true
    }

    const fallbackId = getRelationshipId(fallback)

    if (!fallbackId) {
      return missingHeadingMessage(fallbackLabel)
    }

    const payload = req?.payload as HeadingFallbackPayload | undefined

    if (!payload?.findByID) {
      return isRecord(fallbackValue) ? missingHeadingMessage(fallbackLabel) : true
    }

    const fallbackRecord = await payload.findByID({
      id: fallbackId,
      collection: collectionSlug,
      depth: 0,
      overrideAccess: true,
    })

    return getRouteLikeTitle(fallbackRecord) ? true : missingHeadingMessage(fallbackLabel)
  }

export const validateDocsSetHeadingFallback = ({
  fallbackField = 'docsSet',
  fallbackLabel = 'docs set',
}: {
  fallbackField?: string
  fallbackLabel?: string
} = {}) =>
  validateHeadingFallback({
    collectionSlug: DEFAULT_DOCS_SETS_COLLECTION_SLUG,
    fallbackField,
    fallbackLabel,
  })

export const validateDocsPageHeadingFallback = ({
  fallbackField = 'docsPage',
  fallbackLabel = 'docs page',
}: {
  fallbackField?: string
  fallbackLabel?: string
} = {}) =>
  validateHeadingFallback({
    collectionSlug: DEFAULT_DOCS_COLLECTION_SLUG,
    fallbackField,
    fallbackLabel,
  })
