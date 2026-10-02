/**
 * Best-effort Next.js cache revalidation after an applied sync: configured (or default)
 * tags, then every route the sync touched. Failures never roll back sync writes.
 */
import type { ResolvedDocsSet } from '../../payload/index.js'
import type { DocsAssetsSyncPlan, DocsSyncPlan, ValidatedDocsManifest } from '../../sync/index.js'
import type { PayloadMarkdownDocsSyncRevalidateConfig } from '../../types.js'
import type { CreateSyncEndpointOptions } from './context.js'

const DEFAULT_REVALIDATE_TAGS = [
  'payload-markdown-docs',
  'payload-markdown-docs:docs',
  'sitemap',
  'sitemap:docs',
]

type NextCacheModule = {
  revalidatePath?: (path: string, type?: 'layout' | 'page') => void
  revalidateTag?: (tag: string, profile?: { expire?: number } | string) => void
}

const importNextCache = async (): Promise<NextCacheModule | undefined> => {
  try {
    return (await import('next/cache')) as unknown as NextCacheModule
  } catch {
    return undefined
  }
}

const getRevalidationTags = ({
  revalidate,
  sourceId,
}: {
  revalidate?: false | PayloadMarkdownDocsSyncRevalidateConfig
  sourceId: string
}): string[] => {
  if (revalidate === false) {
    return []
  }

  const configuredTags = typeof revalidate === 'object' ? revalidate.tags : undefined
  const tags = configuredTags ?? [...DEFAULT_REVALIDATE_TAGS, `payload-markdown-docs:${sourceId}`]

  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
}

const getRevalidationPaths = ({
  assetPlan,
  docsSet,
  manifest,
  plan,
}: {
  assetPlan: DocsAssetsSyncPlan
  docsSet?: ResolvedDocsSet
  manifest: ValidatedDocsManifest
  plan: DocsSyncPlan
}): string[] => {
  const paths = new Set<string>()

  if (docsSet?.groupPageMode === 'auto' && docsSet.groupRoutePath) {
    paths.add(docsSet.groupRoutePath)
  }

  for (const file of manifest.files) {
    paths.add(file.route)
  }

  for (const asset of manifest.assets) {
    if (asset.route) {
      paths.add(asset.route)
    }
  }

  for (const change of [...plan.archive, ...plan.delete, ...plan.draft, ...plan.update]) {
    if (change.current?.route) {
      paths.add(change.current.route)
    }

    if (change.desired?.route) {
      paths.add(change.desired.route)
    }
  }

  for (const change of [...assetPlan.archive, ...assetPlan.delete, ...assetPlan.update]) {
    if (change.current?.route) {
      paths.add(change.current.route)
    }

    if (change.desired?.route) {
      paths.add(change.desired.route)
    }
  }

  return [...paths].filter((path) => path.startsWith('/'))
}

export const revalidateDocsSyncCache = async ({
  assetPlan,
  docsSet,
  manifest,
  options,
  plan,
}: {
  assetPlan: DocsAssetsSyncPlan
  docsSet?: ResolvedDocsSet
  manifest: ValidatedDocsManifest
  options: CreateSyncEndpointOptions
  plan: DocsSyncPlan
}): Promise<void> => {
  if (options.revalidate === false) {
    return
  }

  const nextCache = await importNextCache()

  if (!nextCache) {
    return
  }

  const tags = getRevalidationTags({
    revalidate: options.revalidate,
    sourceId: manifest.source.id,
  })

  for (const tag of tags) {
    try {
      nextCache.revalidateTag?.(tag, 'max')
    } catch {
      // Revalidation is best effort so sync writes are not rolled back by cache runtime limits.
    }
  }

  const shouldRevalidatePaths =
    options.revalidate === undefined ||
    (typeof options.revalidate === 'object' && options.revalidate.paths !== false)

  if (!shouldRevalidatePaths) {
    return
  }

  for (const path of getRevalidationPaths({
    assetPlan,
    docsSet,
    manifest,
    plan,
  })) {
    try {
      nextCache.revalidatePath?.(path)
    } catch {
      // Revalidation is best effort so sync writes are not rolled back by cache runtime limits.
    }
  }
}
