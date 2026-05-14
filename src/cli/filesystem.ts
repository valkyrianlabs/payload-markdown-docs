import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import type { DocsManifestInputAsset } from '../sync/index.js'

import { normalizeAssetPath, normalizeDocsPath } from '../sync/index.js'

export type WalkDocsFilesOptions = {
  root: string
}

export type WalkedDocsFile = {
  content: string
  path: string
}

export type PublishPackageSummary = {
  assets: number
  docs: number
  llms: 'missing' | 'present'
  llmsFull: 'missing' | 'present'
  skills: number
}

export type PublishPackage = {
  assets: DocsManifestInputAsset[]
  files: WalkedDocsFile[]
  summary: PublishPackageSummary
}

export type CollectPublishPackageOptions = {
  docsRoot: string
  docsRootExplicit?: boolean
  includeDocs: boolean
  includeLlms: boolean
  includeLlmsFull: boolean
  includeSkills: boolean
  llmsFullPath: string
  llmsFullPathExplicit?: boolean
  llmsPath: string
  llmsPathExplicit?: boolean
  skillsRoot: string
  skillsRootExplicit?: boolean
  sourceId: string
}

const ignoredDirectories = new Set(['.git', '.next', 'build', 'dist', 'node_modules'])
const skillFileExtensions = new Set(['.json', '.md', '.txt', '.yaml', '.yml'])

const pathExists = async (inputPath: string): Promise<boolean> => {
  try {
    await stat(inputPath)
    return true
  } catch {
    return false
  }
}

export const walkDocsFiles = async ({
  root,
}: WalkDocsFilesOptions): Promise<WalkedDocsFile[]> => {
  const absoluteRoot = path.resolve(root)
  const files: WalkedDocsFile[] = []

  const walkDirectory = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, {
      withFileTypes: true,
    })

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue
      }

      const absolutePath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          await walkDirectory(absolutePath)
        }

        continue
      }

      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue
      }

      const relativePath = path.relative(absoluteRoot, absolutePath).split(path.sep).join('/')
      const normalizedPath = normalizeDocsPath(relativePath)

      if (!normalizedPath.ok) {
        throw new Error(normalizedPath.message)
      }

      files.push({
        content: await readFile(absolutePath, 'utf8'),
        path: normalizedPath.path,
      })
    }
  }

  await walkDirectory(absoluteRoot)

  return files.sort((left, right) => left.path.localeCompare(right.path))
}

const getAssetContentType = (assetPath: string): string => {
  const extension = path.extname(assetPath).toLowerCase()

  if (extension === '.md') {
    return 'text/markdown; charset=utf-8'
  }

  if (extension === '.json') {
    return 'application/json; charset=utf-8'
  }

  if (extension === '.yaml' || extension === '.yml') {
    return 'application/yaml; charset=utf-8'
  }

  return 'text/plain; charset=utf-8'
}

export const walkSkillFiles = async ({
  root,
  sourceId,
}: {
  root: string
  sourceId: string
}): Promise<DocsManifestInputAsset[]> => {
  const absoluteRoot = path.resolve(root)
  const absoluteSkillPackageRoot = path.join(absoluteRoot, sourceId)
  const files: DocsManifestInputAsset[] = []

  if (!(await pathExists(absoluteSkillPackageRoot))) {
    return files
  }

  const walkDirectory = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, {
      withFileTypes: true,
    })

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue
      }

      const absolutePath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          await walkDirectory(absolutePath)
        }

        continue
      }

      if (!entry.isFile() || !skillFileExtensions.has(path.extname(entry.name).toLowerCase())) {
        continue
      }

      const relativePath = path.relative(absoluteRoot, absolutePath).split(path.sep).join('/')
      const assetPath = `skills/${relativePath}`
      const normalizedPath = normalizeAssetPath(assetPath)

      if (!normalizedPath.ok) {
        throw new Error(normalizedPath.message)
      }

      files.push({
        content: await readFile(absolutePath, 'utf8'),
        contentType: getAssetContentType(normalizedPath.path),
        kind: 'skill',
        path: normalizedPath.path,
      })
    }
  }

  await walkDirectory(absoluteSkillPackageRoot)

  return files.sort((left, right) => left.path.localeCompare(right.path))
}

export const readOptionalAssetFile = async ({
  assetPath,
  filePath,
  kind,
  route,
}: {
  assetPath: string
  filePath: string
  kind: DocsManifestInputAsset['kind']
  route: string
}): Promise<DocsManifestInputAsset | undefined> => {
  const absolutePath = path.resolve(filePath)

  if (!(await pathExists(absolutePath))) {
    return undefined
  }

  const normalizedPath = normalizeAssetPath(assetPath)

  if (!normalizedPath.ok) {
    throw new Error(normalizedPath.message)
  }

  return {
    content: await readFile(absolutePath, 'utf8'),
    contentType: getAssetContentType(normalizedPath.path),
    kind,
    path: normalizedPath.path,
    route,
  }
}

export const collectPublishPackage = async ({
  docsRoot,
  docsRootExplicit = false,
  includeDocs,
  includeLlms,
  includeLlmsFull,
  includeSkills,
  llmsFullPath,
  llmsFullPathExplicit = false,
  llmsPath,
  llmsPathExplicit = false,
  skillsRoot,
  skillsRootExplicit = false,
  sourceId,
}: CollectPublishPackageOptions): Promise<PublishPackage> => {
  const files = includeDocs
    ? await (async () => {
        if (!(await pathExists(path.resolve(docsRoot)))) {
          throw new Error(
            docsRootExplicit
              ? `Docs root does not exist: ${docsRoot}`
              : 'Docs root does not exist: ./docs. Pass --docs <path> or --no-docs.',
          )
        }

        return walkDocsFiles({
          root: docsRoot,
        })
      })()
    : []

  let skillAssets: DocsManifestInputAsset[] = []

  if (includeSkills) {
    if (!(await pathExists(path.resolve(skillsRoot)))) {
      if (skillsRootExplicit) {
        throw new Error(`Skills root does not exist: ${skillsRoot}`)
      }
    } else {
      skillAssets = await walkSkillFiles({
        root: skillsRoot,
        sourceId,
      })
    }
  }

  const llmsAsset =
    includeLlms && ((await pathExists(path.resolve(llmsPath))) || llmsPathExplicit)
      ? await readOptionalAssetFile({
          assetPath: 'llms.txt',
          filePath: llmsPath,
          kind: 'llms',
          route: '/llms.txt',
        })
      : undefined

  if (includeLlms && llmsPathExplicit && !llmsAsset) {
    throw new Error(`llms.txt file does not exist: ${llmsPath}`)
  }

  const llmsFullAsset =
    includeLlmsFull && ((await pathExists(path.resolve(llmsFullPath))) || llmsFullPathExplicit)
      ? await readOptionalAssetFile({
          assetPath: 'llms-full.txt',
          filePath: llmsFullPath,
          kind: 'llms-full',
          route: '/llms-full.txt',
        })
      : undefined

  if (includeLlmsFull && llmsFullPathExplicit && !llmsFullAsset) {
    throw new Error(`llms-full.txt file does not exist: ${llmsFullPath}`)
  }

  const assets = [
    ...(llmsAsset ? [llmsAsset] : []),
    ...(llmsFullAsset ? [llmsFullAsset] : []),
    ...skillAssets,
  ]

  if (files.length === 0 && assets.length === 0) {
    throw new Error(
      'Publish package is empty. Enable at least one of docs, skills, llms.txt, or llms-full.txt.',
    )
  }

  return {
    assets,
    files,
    summary: {
      assets: assets.length,
      docs: files.length,
      llms: llmsAsset ? 'present' : 'missing',
      llmsFull: llmsFullAsset ? 'present' : 'missing',
      skills: skillAssets.length,
    },
  }
}
