import type { DocsFrontmatter } from './frontmatter.js'

import { sha256Hex } from './hash.js'

export type DocsSyncMode = 'dry-run' | 'sync'

export type DocsDeleteBehavior = 'archive' | 'delete' | 'draft' | 'ignore'

export type DocsManifestSource = {
  branch?: string
  commit?: string
  id: string
  repository?: string
}

export type DocsManifestFile = {
  content: string
  path: string
  sha256?: string
}

export type DocsManifestAssetKind = 'llms' | 'llms-full' | 'skill' | 'static'

export type DocsManifestAsset = {
  content: string
  contentType: string
  kind: DocsManifestAssetKind
  path: string
  route?: string
  sha256?: string
}

export type DocsManifest = {
  assets?: DocsManifestAsset[]
  deleteBehavior?: DocsDeleteBehavior
  files: DocsManifestFile[]
  mode?: DocsSyncMode
  publish?: boolean
  source: DocsManifestSource
  version: 1
}

export type ValidatedDocsManifestFile = {
  content: string
  frontmatter: DocsFrontmatter
  path: string
  route: string
  sha256: string
  title: string
}

export type ValidatedDocsManifestAsset = {
  content: string
  contentType: string
  kind: DocsManifestAssetKind
  path: string
  route?: string
  sha256: string
}

export type ValidatedDocsManifest = {
  assets: ValidatedDocsManifestAsset[]
  deleteBehavior: DocsDeleteBehavior
  files: ValidatedDocsManifestFile[]
  mode: DocsSyncMode
  publish: boolean
  source: DocsManifestSource
  version: 1
}

export type DocsManifestInputFile = {
  content: string
  path: string
}

export type DocsManifestInputAsset = {
  content: string
  contentType: string
  kind: DocsManifestAssetKind
  path: string
  route?: string
}

export const buildDocsManifest = ({
  assets = [],
  branch,
  commit,
  deleteBehavior,
  files,
  mode,
  publish,
  repository,
  sourceId,
}: {
  assets?: DocsManifestInputAsset[]
  branch?: string
  commit?: string
  deleteBehavior?: DocsDeleteBehavior
  files: DocsManifestInputFile[]
  mode?: DocsSyncMode
  publish?: boolean
  repository?: string
  sourceId: string
}): DocsManifest => ({
  assets: assets.map((asset) => ({
    ...asset,
    sha256: sha256Hex(asset.content),
  })),
  deleteBehavior,
  files: files.map((file) => ({
    ...file,
    sha256: sha256Hex(file.content),
  })),
  mode,
  publish,
  source: {
    id: sourceId,
    branch,
    commit,
    repository,
  },
  version: 1,
})
