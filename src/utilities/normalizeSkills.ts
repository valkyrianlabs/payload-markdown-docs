import type {
  NormalizedSkillCTAGroup,
  NormalizedSkillCTAItem,
  SkillCTAGroupInput,
  SkillCTAItemInput,
  SkillCTAType,
} from '../marketing/types.js'

import { DEFAULT_DOCS_ASSETS_COLLECTION_SLUG } from '../constants.js'
import {
  getBoolean,
  getRelationshipId,
  getRouteLikeHref,
  getString,
  isRecord,
} from './normalizeShared.js'

const skillTypes: SkillCTAType[] = ['claude', 'codex', 'custom']
const knownAgents = new Set(['claude', 'codex'])

export type SkillAssetPayloadOperations = {
  find: (args: {
    collection: string
    depth?: number
    limit?: number
    overrideAccess?: boolean
    sort?: string
    where?: unknown
  }) => Promise<{
    docs: unknown[]
  }>
}

const getSkillType = (value: unknown): SkillCTAType =>
  typeof value === 'string' && skillTypes.includes(value as SkillCTAType)
    ? (value as SkillCTAType)
    : 'custom'

const formatAgentLabel = (agent: string): string =>
  `${agent.charAt(0).toUpperCase()}${agent.slice(1)} skill`

const normalizePathSegments = (value: string): string[] =>
  value
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)

const getAgentFromSkillPath = (value: unknown): string | undefined => {
  const path = getString(value)

  if (!path) {
    return undefined
  }

  const segments = normalizePathSegments(path)
  const skillsIndex = segments.findIndex((segment) => segment === 'skills')

  if (skillsIndex === -1) {
    return undefined
  }

  const afterSkills = segments.slice(skillsIndex + 1)

  if (afterSkills.length === 0) {
    return undefined
  }

  if (knownAgents.has(afterSkills[0] ?? '')) {
    return afterSkills[0]
  }

  return afterSkills.length > 1 ? afterSkills[1] : afterSkills[0]
}

const isRootSkillAsset = (asset: Record<string, unknown>): boolean => {
  const route = getString(asset.route)
  const sourcePath = getString(asset.sourcePath)

  return [route, sourcePath].some((value) => value?.toLowerCase().endsWith('/skill.md'))
}

const normalizeSkillItem = (input: unknown): NormalizedSkillCTAItem | undefined => {
  if (!isRecord(input)) {
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

const normalizeSkillAssetItem = (
  input: unknown,
  options: { docsSetId?: string } = {},
): NormalizedSkillCTAItem | undefined => {
  if (!isRecord(input) || input.kind !== 'skill') {
    return undefined
  }

  if (options.docsSetId && getRelationshipId(input.docsSet) !== options.docsSetId) {
    return undefined
  }

  const href = getString(input.route)

  if (!href) {
    return undefined
  }

  const agent = getAgentFromSkillPath(input.route) ?? getAgentFromSkillPath(input.sourcePath)

  if (!agent) {
    return undefined
  }

  return {
    type: getSkillType(agent),
    href,
    icon: agent,
    label: formatAgentLabel(agent),
  }
}

export const normalizeSkillAssetItems = (
  input: unknown[],
  options: { docsSetId?: string } = {},
): NormalizedSkillCTAItem[] => {
  const itemsByAgent = new Map<
    string,
    {
      item: NormalizedSkillCTAItem
      root: boolean
    }
  >()

  for (const asset of input) {
    const item = normalizeSkillAssetItem(asset, options)

    if (!item) {
      continue
    }

    const key = item.icon ?? item.label
    const existing = itemsByAgent.get(key)
    const root = isRecord(asset) ? isRootSkillAsset(asset) : false

    if (!existing || (root && !existing.root)) {
      itemsByAgent.set(key, {
        item,
        root,
      })
    }
  }

  return [...itemsByAgent.values()]
    .map(({ item }) => item)
    .sort((first, second) => first.label.localeCompare(second.label))
}

export const resolveDocsSetSkills = async ({
  collectionSlug = DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
  docsSet,
  payload,
  skills,
}: {
  collectionSlug?: string
  docsSet: unknown
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
