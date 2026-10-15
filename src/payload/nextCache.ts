/**
 * Best-effort Next.js cache invalidation shared by the sync endpoint and the docs set /
 * docs group collection hooks.
 *
 * `next/cache` is imported dynamically so Payload keeps working outside Next (CLI,
 * scripts, migrations, tests); outside a Next request the calls throw and are ignored.
 *
 * Tags are expired with `{ expire: 0 }`, not the `'max'` profile: in Next 16 a
 * `'max'` revalidation is stale-while-revalidate, so the next request still gets the
 * stale entry (and a prerendered page re-renders against the stale nav and caches it
 * again). `{ expire: 0 }` expires the entry immediately.
 */
import type { PayloadMarkdownDocsSyncRevalidateConfig } from '../types.js'

import { DEFAULT_DOCS_REVALIDATE_TAGS, PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG } from '../constants.js'

export type NextCacheModule = {
  revalidatePath?: (path: string, type?: 'layout' | 'page') => void
  revalidateTag?: (tag: string, profile: { expire?: number } | string) => void
}

/** Immediate expiry for `revalidateTag` (Next 16). */
export const EXPIRE_NOW = { expire: 0 } as const

export const importNextCache = async (): Promise<NextCacheModule | undefined> => {
  try {
    return (await import('next/cache')) as unknown as NextCacheModule
  } catch {
    return undefined
  }
}

/**
 * Tags to expire for a docs change: the configured `sync.revalidate.tags` (or the
 * defaults), the per-source tag when a source id is known, and always the nav tag (the
 * nav cache is owned by the plugin, so it is expired even when `sync.revalidate` is
 * `false`).
 */
export const getDocsRevalidationTags = ({
  revalidate,
  sourceIds = [],
}: {
  revalidate?: false | PayloadMarkdownDocsSyncRevalidateConfig
  sourceIds?: string[]
}): string[] => {
  const configuredTags = typeof revalidate === 'object' ? revalidate.tags : undefined
  const tags =
    revalidate === false
      ? []
      : (configuredTags ?? [
          ...DEFAULT_DOCS_REVALIDATE_TAGS,
          ...sourceIds.map((sourceId) => `payload-markdown-docs:${sourceId}`),
        ])

  return [
    ...new Set([...tags, PAYLOAD_MARKDOWN_DOCS_NAV_CACHE_TAG].map((tag) => tag.trim()).filter(Boolean)),
  ]
}

export const shouldRevalidateDocsPaths = (
  revalidate?: false | PayloadMarkdownDocsSyncRevalidateConfig,
): boolean =>
  revalidate === undefined || (typeof revalidate === 'object' && revalidate.paths !== false)

/** Expires `tags` immediately and revalidates `paths`; never throws. */
export const revalidateNextCache = async ({
  paths = [],
  tags = [],
}: {
  paths?: Iterable<string>
  tags?: Iterable<string>
}): Promise<void> => {
  const tagList = [...new Set(tags)]
  const pathList = [...new Set(paths)].filter((path) => path.startsWith('/'))

  if (tagList.length === 0 && pathList.length === 0) {
    return
  }

  const nextCache = await importNextCache()

  if (!nextCache) {
    return
  }

  for (const tag of tagList) {
    try {
      nextCache.revalidateTag?.(tag, EXPIRE_NOW)
    } catch {
      // Best effort: outside a Next request (scripts, CLI) there is no cache to expire.
    }
  }

  for (const path of pathList) {
    try {
      nextCache.revalidatePath?.(path)
    } catch {
      // Best effort, as above.
    }
  }
}
