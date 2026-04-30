import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { normalizeDocsPath } from '../sync/index.js'

export type WalkDocsFilesOptions = {
  root: string
}

export type WalkedDocsFile = {
  content: string
  path: string
}

const ignoredDirectories = new Set(['.git', '.next', 'build', 'dist', 'node_modules'])

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

