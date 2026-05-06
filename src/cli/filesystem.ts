import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import type {
  DocsAiExportManifest,
  DocsValidationIssue,
} from '../sync/index.js'

import {
  AI_MARKDOWN_EXPORT_MANIFEST_FILENAMES,
  normalizeDocsPath,
  parseDocsAiExportManifestYaml,
} from '../sync/index.js'

export type WalkDocsFilesOptions = {
  root: string
}

export type WalkedDocsFile = {
  content: string
  path: string
}

export type ReadDocsAiExportManifestResult =
  | {
      issues: DocsValidationIssue[]
      manifest?: DocsAiExportManifest
      ok: true
      warnings: DocsValidationIssue[]
    }
  | {
      issues: DocsValidationIssue[]
      ok: false
      warnings: DocsValidationIssue[]
    }

const ignoredDirectories = new Set(['.git', '.next', 'build', 'dist', 'node_modules'])

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath)

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

export const readDocsAiExportManifest = async ({
  root,
}: WalkDocsFilesOptions): Promise<ReadDocsAiExportManifestResult> => {
  const absoluteRoot = path.resolve(root)
  const manifestPaths: string[] = []

  for (const filename of AI_MARKDOWN_EXPORT_MANIFEST_FILENAMES) {
    const manifestPath = path.join(absoluteRoot, filename)

    if (await fileExists(manifestPath)) {
      manifestPaths.push(filename)
    }
  }

  if (manifestPaths.length === 0) {
    return {
      issues: [],
      ok: true,
      warnings: [],
    }
  }

  const selectedPath = manifestPaths[0] ?? AI_MARKDOWN_EXPORT_MANIFEST_FILENAMES[0]
  const warnings: DocsValidationIssue[] =
    manifestPaths.length > 1
      ? [
          {
            code: 'invalid_ai_export_manifest',
            message:
              'Both index.ai.yml and index.ai.yaml exist. Using index.ai.yml.',
            path: selectedPath,
          },
        ]
      : []
  const parsed = parseDocsAiExportManifestYaml({
    content: await readFile(path.join(absoluteRoot, selectedPath), 'utf8'),
    sourcePath: selectedPath,
  })

  if (!parsed.ok) {
    return parsed
  }

  return {
    issues: [],
    manifest: parsed.manifest,
    ok: true,
    warnings: [...warnings, ...parsed.warnings],
  }
}
