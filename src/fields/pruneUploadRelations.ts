import type { Block, Field } from 'payload'

type FieldLike = {
  blocks?: Block[]
  fields?: Field[]
  relationTo?: string | string[]
  tabs?: ({ fields?: Field[] } & Record<string, unknown>)[]
  type?: string
}

/**
 * Removes upload/relationship fields that point only at collections listed in
 * `missingSlugs` (and drops missing slugs from polymorphic `relationTo` lists), walking
 * nested groups, rows, collapsibles, arrays, tabs, and blocks. Used to keep plugin field
 * definitions valid in apps without a `media` upload collection (X-17).
 */
export const pruneUploadRelations = (fields: Field[], missingSlugs: Set<string>): Field[] => {
  if (missingSlugs.size === 0) {
    return fields
  }

  return fields.flatMap((field): Field[] => {
    const record = field as FieldLike

    if ((record.type === 'upload' || record.type === 'relationship') && record.relationTo) {
      if (typeof record.relationTo === 'string') {
        return missingSlugs.has(record.relationTo) ? [] : [field]
      }

      const remaining = record.relationTo.filter((slug) => !missingSlugs.has(slug))

      if (remaining.length === 0) {
        return []
      }

      return remaining.length === record.relationTo.length
        ? [field]
        : [{ ...field, relationTo: remaining.length === 1 ? remaining[0] : remaining } as Field]
    }

    let next: FieldLike = record

    if (Array.isArray(record.fields)) {
      next = { ...next, fields: pruneUploadRelations(record.fields, missingSlugs) }
    }

    if (Array.isArray(record.tabs)) {
      next = {
        ...next,
        tabs: record.tabs.map((tab) =>
          Array.isArray(tab.fields)
            ? { ...tab, fields: pruneUploadRelations(tab.fields, missingSlugs) }
            : tab,
        ),
      }
    }

    if (Array.isArray(record.blocks)) {
      next = { ...next, blocks: record.blocks.map((block) => pruneBlockUploadRelations(block, missingSlugs)) }
    }

    return [next === record ? field : (next as Field)]
  })
}

export const pruneBlockUploadRelations = (block: Block, missingSlugs: Set<string>): Block =>
  missingSlugs.size === 0
    ? block
    : {
        ...block,
        fields: pruneUploadRelations(block.fields, missingSlugs),
      }
