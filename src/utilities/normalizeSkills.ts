import type {
  DocsAssetReference,
  DocsPageReference,
  DocsRelationship,
  DocsSetReference,
  DocsWhere,
  NormalizedSkillCTAGroup,
  NormalizedSkillCTAItem,
  SkillCTAGroupInput,
  SkillCTAItemInput,
  SkillCTAType,
} from '../marketing/types.js'
import type { SkillBundleAsset } from '../skillBundles.js'

import { DEFAULT_DOCS_ASSETS_COLLECTION_SLUG } from '../constants.js'
import { getSkillBundles } from '../skillBundles.js'
import {
  getBoolean,
  getRelationshipId,
  getRouteLikeHref,
  getString,
  isRecord,
} from './normalizeShared.js'

const skillTypes: SkillCTAType[] = ['claude', 'codex', 'custom']

export type SkillAssetPayloadOperations = {
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
}

const getSkillType = (value: null | string | undefined): SkillCTAType =>
  typeof value === 'string' && skillTypes.includes(value as SkillCTAType)
    ? (value as SkillCTAType)
    : 'custom'

const formatAgentLabel = (agent: string): string =>
  `${agent.charAt(0).toUpperCase()}${agent.slice(1)} skill`

type LegacySkillCTAItemInput = {
  routeReference?: DocsRelationship<DocsPageReference> | null
} & SkillCTAItemInput

const normalizeSkillItem = (
  input: LegacySkillCTAItemInput | null | undefined,
): NormalizedSkillCTAItem | undefined => {
  if (!input) {
    return undefined
  }

  const label = getString(input.label)

  if (!label) {
    return undefined
  }

  return {
    type: getSkillType(input.type),
    description: getString(input.description),
    href: getString(input.href) ?? getString(input.url) ?? getRouteLikeHref(input.routeReference),
    icon: getString(input.icon),
    label,
  }
}

export const normalizeSkillAssetItems = (
  input: DocsAssetReference[],
  options: { docsSetId?: string } = {},
): NormalizedSkillCTAItem[] => {
  const assets = input.flatMap((asset): SkillBundleAsset[] => {
    if (
      asset.kind !== 'skill' ||
      (options.docsSetId && getRelationshipId(asset.docsSet) !== options.docsSetId)
    ) {
      return []
    }

    return [
      {
        id: getRelationshipId(asset.id),
        kind: asset.kind,
        route: getString(asset.route),
        sourcePath: getString(asset.sourcePath),
      },
    ]
  })

  return getSkillBundles(assets)
    .map((bundle) => ({
      type: getSkillType(bundle.agent),
      href: bundle.archiveRoute,
      icon: bundle.agent,
      label: formatAgentLabel(bundle.agent),
    }))
    .sort((first, second) => first.label.localeCompare(second.label))
}

export const resolveDocsSetSkills = async ({
  collectionSlug = DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
  docsSet,
  payload,
  skills,
}: {
  collectionSlug?: string
  docsSet: DocsRelationship<DocsSetReference> | null | undefined
  payload: SkillAssetPayloadOperations
  skills: null | SkillCTAGroupInput | undefined
}): Promise<SkillCTAGroupInput | undefined> => {
  if (!isRecord(skills) || getBoolean(skills.enabled) === false) {
    return undefined
  }

  const docsSetId = getRelationshipId(docsSet)

  if (!docsSetId) {
    return {
      ...skills,
      resolvedItems: [],
    }
  }

  const result = await payload.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    sort: 'sourcePath',
    where: {
      and: [
        {
          docsSet: {
            equals: docsSetId,
          },
        },
        {
          kind: {
            equals: 'skill',
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

  return {
    ...skills,
    resolvedItems: normalizeSkillAssetItems(result.docs, {
      docsSetId,
    }),
  }
}

export const normalizeSkillItems = (
  input: null | SkillCTAItemInput[] | undefined,
): NormalizedSkillCTAItem[] => {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map(normalizeSkillItem)
    .filter((item): item is NormalizedSkillCTAItem => item !== undefined)
}

export const normalizeSkills = (
  input: null | SkillCTAGroupInput | undefined,
): NormalizedSkillCTAGroup | undefined => {
  if (!isRecord(input) || getBoolean(input.enabled) === false) {
    return undefined
  }

  const legacyItems = (input as { items?: null | SkillCTAItemInput[] }).items
  const items = Array.isArray(input.resolvedItems)
    ? input.resolvedItems
    : normalizeSkillItems(legacyItems)

  if (items.length === 0) {
    return undefined
  }

  return {
    description: getString(input.description),
    display:
      input.display === 'tabs' || input.display === 'cards' || input.display === 'buttons'
        ? input.display
        : 'buttons',
    heading: getString(input.heading),
    items,
  }
}
