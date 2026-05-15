import type {
  NormalizedSkillCTAGroup,
  NormalizedSkillCTAItem,
  SkillCTAGroupInput,
  SkillCTAItemInput,
  SkillCTAType,
} from '../marketing/types.js'

import { getBoolean, getRouteLikeHref, getString, isRecord } from './normalizeShared.js'

const skillTypes: SkillCTAType[] = ['claude', 'codex', 'custom']

const getSkillType = (value: unknown): SkillCTAType =>
  typeof value === 'string' && skillTypes.includes(value as SkillCTAType)
    ? (value as SkillCTAType)
    : 'custom'

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
    downloadLabel: getString(input.downloadLabel),
    href: getString(input.href) ?? getString(input.url) ?? getRouteLikeHref(input.routeReference),
    icon: getString(input.icon),
    label,
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

  const items = normalizeSkillItems(input.items)

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
