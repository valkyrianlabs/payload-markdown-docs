import type { Validate } from 'payload'

import type {
  DocsPageReference,
  DocsRelationship,
  DocsSetReference,
} from '../marketing/types.js'

import {
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
} from '../constants.js'
import {
  getDocsPageTitle,
  getDocsRelationshipId,
  getDocsRelationshipRecord,
  getDocsSetTitle,
  getText,
} from '../utilities/normalizeShared.js'

type HeadingFallbackRelationship = DocsRelationship<DocsPageReference | DocsSetReference> | null

type HeadingFallbackData = {
  [field: string]: HeadingFallbackRelationship | null | string | undefined
}

type HeadingFallbackPayload = {
  findByID?: (args: {
    collection: string
    depth?: number
    id: number | string
    overrideAccess?: boolean
  }) => Promise<DocsPageReference | DocsSetReference | null>
}

const missingHeadingMessage = (fallbackLabel: string): string =>
  `Add a heading or select a ${fallbackLabel} with a title.`

const getHeadingFallbackTitle = (
  fallback: HeadingFallbackRelationship | string | undefined,
): string | undefined =>
  getDocsSetTitle(fallback as DocsRelationship<DocsSetReference> | null | undefined) ??
  getDocsPageTitle(fallback as DocsRelationship<DocsPageReference> | null | undefined)

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
    if (getText(value)) {
      return true
    }

    const fallback = siblingData?.[fallbackField]

    if (getHeadingFallbackTitle(fallback)) {
      return true
    }

    const fallbackId = getDocsRelationshipId(fallback)

    if (!fallbackId) {
      return missingHeadingMessage(fallbackLabel)
    }

    const payload = req?.payload as HeadingFallbackPayload | undefined

    if (!payload?.findByID) {
      return getDocsRelationshipRecord(fallback)
        ? missingHeadingMessage(fallbackLabel)
        : true
    }

    const fallbackRecord = await payload.findByID({
      id: fallbackId,
      collection: collectionSlug,
      depth: 0,
      overrideAccess: true,
    })

    return getHeadingFallbackTitle(fallbackRecord) ? true : missingHeadingMessage(fallbackLabel)
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
