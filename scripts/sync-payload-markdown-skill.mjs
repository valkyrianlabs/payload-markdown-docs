#!/usr/bin/env node
/**
 * Vendors payload-markdown's agent skill into skills/payload-markdown/.
 *
 * The payload-markdown-docs skill builds on the payload-markdown skill (directives,
 * styling, layout, MCP) and links to its files, so `pmdocs install skill` installs
 * both. The native package builds (Debian, Homebrew, plain Meson) bundle this copy:
 * the Homebrew formula builds from the source archive, which has no node_modules.
 *
 *   node scripts/sync-payload-markdown-skill.mjs           copy from node_modules
 *   node scripts/sync-payload-markdown-skill.mjs --check   fail when the copy drifted
 *
 * The copy is byte for byte, skill.json manifest included, so
 * `payload-markdown skill check` accepts what pmdocs installs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const VENDORED_SKILL_DIR = path.join(REPO_ROOT, 'skills', 'payload-markdown')

/** The installed payload-markdown package directory (the unscoped name first). */
export function installedPackageDir(root = REPO_ROOT) {
  for (const name of ['payload-markdown', '@valkyrianlabs/payload-markdown']) {
    const dir = path.join(root, 'node_modules', name)

    if (fs.existsSync(path.join(dir, 'skills', 'payload-markdown'))) {
      return dir
    }
  }

  throw new Error('payload-markdown is not installed: run pnpm install first.')
}

/** Skill files below `dir` (POSIX paths, sorted), skipping dotfiles and __pycache__ like payload-markdown does. */
export function listFiles(dir) {
  const files = []

  const visit = (relative) => {
    for (const entry of fs.readdirSync(path.join(dir, relative), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === '__pycache__') {
        continue
      }

      const child = relative ? `${relative}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        visit(child)
      } else if (entry.isFile()) {
        files.push(child)
      }
    }
  }

  if (fs.existsSync(dir)) {
    visit('')
  }

  return files.sort()
}

/** Differences between the installed package's skill and the vendored copy (empty when in sync). */
export function skillDrift({ packageDir = installedPackageDir(), vendoredDir = VENDORED_SKILL_DIR } = {}) {
  const sourceDir = path.join(packageDir, 'skills', 'payload-markdown')
  const source = listFiles(sourceDir)
  const vendored = listFiles(vendoredDir)
  const drift = []

  for (const file of source) {
    if (!vendored.includes(file)) {
      drift.push(`missing: ${file}`)
    } else if (!fs.readFileSync(path.join(sourceDir, file)).equals(fs.readFileSync(path.join(vendoredDir, file)))) {
      drift.push(`changed: ${file}`)
    }
  }

  for (const file of vendored) {
    if (!source.includes(file)) {
      drift.push(`extra: ${file}`)
    }
  }

  return drift
}

export function syncSkill({ packageDir = installedPackageDir(), vendoredDir = VENDORED_SKILL_DIR } = {}) {
  const sourceDir = path.join(packageDir, 'skills', 'payload-markdown')

  fs.rmSync(vendoredDir, { force: true, recursive: true })

  for (const file of listFiles(sourceDir)) {
    fs.mkdirSync(path.dirname(path.join(vendoredDir, file)), { recursive: true })
    fs.copyFileSync(path.join(sourceDir, file), path.join(vendoredDir, file))
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const packageDir = installedPackageDir()
  const { version } = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'))

  if (process.argv.includes('--check')) {
    const drift = skillDrift({ packageDir })

    if (drift.length > 0) {
      console.error(
        `skills/payload-markdown differs from payload-markdown ${version}:\n${drift.map((line) => `  ${line}`).join('\n')}\n` +
          'Run `pnpm sync:pm-skill` and commit the result.',
      )
      process.exit(1)
    }

    console.log(`skills/payload-markdown matches payload-markdown ${version}`)
  } else {
    syncSkill({ packageDir })
    console.log(`skills/payload-markdown synced from payload-markdown ${version}`)
  }
}
