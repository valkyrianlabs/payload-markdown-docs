/**
 * Best-effort Next.js cache revalidation after an applied sync: configured (or default)
 * tags plus the nav tag, expired immediately (`{ expire: 0 }`), then every route the
 * sync touched. Failures never roll back sync writes.
 */
import type { ResolvedDocsSet } from '../../payload/index.js'
import type { DocsAssetsSyncPlan, DocsSyncPlan, ValidatedDocsManifest } from '../../sync/index.js'
import type { CreateSyncEndpointOptions } from './context.js'

import {
  getDocsRevalidationTags,
  revalidateNextCache,
  shouldRevalidateDocsPaths,
} from '../../payload/nextCache.js'

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
  // The nav tag is always expired: a sync can publish a docs set (and with it a nav
  // entry), and the nav cache is owned by the plugin even when revalidate is false.
  await revalidateNextCache({
    paths: shouldRevalidateDocsPaths(options.revalidate)
      ? getRevalidationPaths({
          assetPlan,
          docsSet,
          manifest,
          plan,
        })
      : [],
    tags: getDocsRevalidationTags({
      revalidate: options.revalidate,
      sourceIds: [manifest.source.id],
    }),
  })
}
