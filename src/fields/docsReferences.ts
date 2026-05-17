import type { Field } from 'payload'

import {
  DEFAULT_DOCS_COLLECTION_SLUG,
  DEFAULT_DOCS_SETS_COLLECTION_SLUG,
} from '../constants.js'

const docsSetDescription =
  'Select the docs set this block should reference. Links, page choices, and skill buttons are derived from this set.'

type RelationshipFilterArgs = {
  blockData?: Record<string, unknown>
  siblingData?: Record<string, unknown>
}

const getRelationshipId = (value: unknown): string | undefined => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>

    if (typeof record.id === 'string' || typeof record.id === 'number') {
      return String(record.id)
    }

    if ('value' in record) {
      return getRelationshipId(record.value)
    }
  }

  return undefined
}

export const docsSetRelationshipField = ({
  name = 'docsSet',
  required = false,
}: {
  name?: string
  required?: boolean
} = {}): Field =>
  ({
    name,
    type: 'relationship',
    admin: {
      description: docsSetDescription,
    },
    label: 'Docs set',
    maxDepth: 2,
    relationTo: DEFAULT_DOCS_SETS_COLLECTION_SLUG,
    required,
  }) as Field

export const getDocsPageFilter = ({
  blockData,
  siblingData,
}: RelationshipFilterArgs): { docsSet: { equals: string } } | false => {
  const docsSetId = getRelationshipId(blockData?.docsSet) ?? getRelationshipId(siblingData?.docsSet)

  if (!docsSetId) {
    return false
  }

  return {
    docsSet: {
      equals: docsSetId,
    },
  }
}

export const docsPageRelationshipField = ({
  name = 'docsPage',
  condition,
  required = false,
}: {
  condition?: (data: unknown, siblingData: Record<string, unknown>) => boolean
  name?: string
  required?: boolean
} = {}): Field =>
  ({
    name,
    type: 'relationship',
    admin: {
      condition,
      description: 'Select a docs page from the selected docs set.',
    },
    filterOptions: getDocsPageFilter,
    label: 'Docs page',
    maxDepth: 1,
    relationTo: DEFAULT_DOCS_COLLECTION_SLUG,
    required,
  }) as Field
