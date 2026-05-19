import type {
  DocsAssetReference,
  DocsCTASkillOverride,
  DocsPageReference,
  DocsRelationship,
  DocsSetReference,
  DocsWhere,
  NormalizedSkillCTAGroup,
  NormalizedSkillCTAItem,
  SkillCTAGroupInput,
  SkillCTAItemInput,
} from '../marketing/types.js'
import type { SkillBundleAsset } from '../skillBundles.js'

import { DEFAULT_DOCS_ASSETS_COLLECTION_SLUG } from '../constants.js'
import { formatSkillAgentTitle, getSkillBundles } from '../skillBundles.js'
import {
  getBoolean,
  getRelationshipId,
  getRouteLikeHref,
  getString,
  isRecord,
} from './normalizeShared.js'

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

const getSkillAgent = (value: null | string | undefined): string | undefined => {
  const agent = getString(value)

  return agent ? agent.toLowerCase() : undefined
}

const getSkillLabel = (agent: string): string => `${formatSkillAgentTitle(agent)} skill`

const getOverridesByAgent = (
  overrides: DocsCTASkillOverride[] | null | undefined,
): Map<string, DocsCTASkillOverride> => {
  const overridesByAgent = new Map<string, DocsCTASkillOverride>()

  if (!Array.isArray(overrides)) {
    return overridesByAgent
  }

  for (const override of overrides) {
    const agent = getSkillAgent(override.agent)

    if (agent) {
      overridesByAgent.set(agent, override)
    }
  }

  return overridesByAgent
}

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
  const href = getString(input.href) ?? getString(input.url) ?? getRouteLikeHref(input.routeReference)

  if (!label || !href) {
    return undefined
  }

  const agent = getSkillAgent(input.agent) ?? getSkillAgent(input.type) ?? 'custom'

  return {
    type: getString(input.type),
    agent,
    description: getString(input.description),
    href,
    icon: getString(input.icon),
    label,
  }
}

export const normalizeSkillAssetItems = (
  input: DocsAssetReference[],
  options: { docsSetId?: string; skillOverrides?: DocsCTASkillOverride[] | null } = {},
): NormalizedSkillCTAItem[] => {
  const overridesByAgent = getOverridesByAgent(options.skillOverrides)
  const assets = input.flatMap((asset): SkillBundleAsset[] => {
    if (
      asset.kind !== 'skill' ||
      asset.sync?.archived === true ||
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
    .map((bundle) => {
      const override = overridesByAgent.get(bundle.agent.toLowerCase())

      return {
        type: bundle.agent,
        agent: bundle.agent,
        description: getString(override?.description),
        href: bundle.archiveRoute,
        icon: bundle.agent,
        label: getString(override?.label) ?? bundle.title ?? getSkillLabel(bundle.agent),
      }
    })
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
      skillOverrides: skills.skillOverrides,
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
