import type { DocsFrontmatter } from './frontmatter.js'
import type { DocsAiExportManifest } from './aiExportManifest.js'

import { sha256Hex } from './hash.js'

export type DocsSyncMode = 'dry-run' | 'sync'

export type DocsDeleteBehavior = 'archive' | 'delete' | 'draft' | 'ignore'

export type DocsManifestSource = {
  branch?: string
  commit?: string
  id: string
  repository?: string
  root?: string
}

export type DocsManifestFile = {
  content: string
  path: string
  sha256?: string
}

export type DocsManifest = {
  aiExport?: DocsAiExportManifest
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

export type ValidatedDocsManifest = {
  aiExport?: DocsAiExportManifest
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

export const buildDocsManifest = ({
  aiExport,
  branch,
  commit,
  deleteBehavior,
  files,
  mode,
  publish,
  repository,
  root,
  sourceId,
}: {
  aiExport?: DocsAiExportManifest
  branch?: string
  commit?: string
  deleteBehavior?: DocsDeleteBehavior
  files: DocsManifestInputFile[]
  mode?: DocsSyncMode
  publish?: boolean
  repository?: string
  root?: string
  sourceId: string
}): DocsManifest => ({
  aiExport,
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
    root,
  },
  version: 1,
})
