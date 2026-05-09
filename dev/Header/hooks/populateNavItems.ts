import type { GlobalBeforeChangeHook } from 'payload'

import type { HeaderLink, HeaderNavItem, HeaderSubItem } from '../config.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && 'id' in value

const getRelationshipId = (
  value: HeaderLink['reference'] extends infer Reference
    ? Reference extends { value: infer Value }
      ? Value
      : never
    : never,
): null | number | string => {
  if (!value) {
    return null
  }

  return isRecord(value) ? String(value.id) : value
}

const getReferencedGroupId = (
  linkField: HeaderNavItem['link'] | null | undefined,
): null | number | string => {
  if (
    !linkField ||
    linkField.type !== 'reference' ||
    linkField.reference?.relationTo !== 'docs-groups'
  ) {
    return null
  }

  return getRelationshipId(linkField.reference.value)
}

const sortByOrderThenTitle = <T extends { order?: null | number; title: string }>(items: T[]) =>
  [...items].sort((first, second) => {
    const orderDiff = (first.order ?? 0) - (second.order ?? 0)

    return orderDiff === 0 ? first.title.localeCompare(second.title) : orderDiff
  })

export const populateNavItems: GlobalBeforeChangeHook = async ({ data, req }) => {
  if (!data || typeof data !== 'object' || !Array.isArray(data.navItems)) {
    return data
  }

  const nextNavItems = await Promise.all(
    data.navItems.map(async (navItem: HeaderNavItem) => {
      if (!Array.isArray(navItem.subItems) || !navItem.subItems.length) {
        return navItem
      }

      const nextSubItems = await Promise.all(
        navItem.subItems.map(async (subItem: HeaderSubItem) => {
          if (!subItem.populateChildren) {
            return subItem
          }

          const parentGroupId = getReferencedGroupId(subItem.link)
          if (!parentGroupId) {
            return subItem
          }

          const [groupsResult, setsResult] = await Promise.all([
            req.payload.find({
              collection: 'docs-groups',
              depth: 0,
              limit: 100,
              pagination: false,
              sort: 'order',
              where: {
                parent: {
                  equals: parentGroupId,
                },
              },
            }),
            req.payload.find({
              collection: 'docs-sets',
              depth: 0,
              limit: 100,
              pagination: false,
              sort: 'title',
              where: {
                group: {
                  equals: parentGroupId,
                },
              },
            }),
          ])

          const groupItems = sortByOrderThenTitle(groupsResult.docs).map((group) => ({
            link: {
              type: 'reference' as const,
              label: group.navTitle ?? group.title,
              reference: {
                relationTo: 'docs-groups' as const,
                value: group.id,
              },
            },
          }))

          const setItems = [...setsResult.docs]
            .sort((first, second) => first.title.localeCompare(second.title))
            .map((docsSet) => ({
              link: {
                type: 'reference' as const,
                label: docsSet.title,
                reference: {
                  relationTo: 'docs-sets' as const,
                  value: docsSet.id,
                },
              },
            }))

          return {
            ...subItem,
            childItems: [...groupItems, ...setItems],
          }
        }),
      )

      return {
        ...navItem,
        subItems: nextSubItems,
      }
    }),
  )

  return {
    ...data,
    navItems: nextNavItems,
  }
}
