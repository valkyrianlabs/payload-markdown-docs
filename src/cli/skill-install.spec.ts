import { randomUUID } from 'node:crypto'
import {
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { runCli } from './index.js'

const originalCwd = process.cwd()
const tempRoots: string[] = []

const createTempRoot = async (): Promise<string> => {
  const root = path.join(tmpdir(), `payload-markdown-docs-skill-${randomUUID()}`)
  await mkdir(root, {
    recursive: true,
  })
  tempRoots.push(root)

  return root
}

const readInstalledFile = (root: string, relativePath: string): Promise<string> =>
  readFile(path.join(root, relativePath), 'utf8')

const listFiles = async (root: string, basePath = ''): Promise<string[]> => {
  const entries = await readdir(path.join(root, basePath), {
    withFileTypes: true,
  })
  const files: string[] = []

  for (const entry of entries) {
    const relativePath = path.join(basePath, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, relativePath)))
      continue
    }

    if (entry.isFile()) {
      files.push(relativePath.split(path.sep).join('/'))
    }
  }

  return files.sort()
}

afterEach(async () => {
  process.chdir(originalCwd)
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      rm(root, {
        force: true,
        recursive: true,
      }),
    ),
  )
})

describe('install skill command', () => {
  it('writes the Codex skill pack to the default output path', async () => {
    const root = await createTempRoot()
    process.chdir(root)

    const result = await runCli(['install', 'skill', '--codex'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('.agents/skills/payload-markdown-docs')
    expect(await listFiles(path.join(root, '.agents/skills/payload-markdown-docs'))).toEqual([
      'SKILL.md',
      'examples/docs-page.md',
      'examples/github-actions.md',
      'reference/admin.md',
      'reference/frontmatter.md',
      'reference/payload-markdown-directives.md',
      'reference/routing.md',
      'reference/sync.md',
      'reference/troubleshooting.md',
      'reference/workflow.md',
    ])
  })

  it('supports the ai-skill alias and custom output directory', async () => {
    const root = await createTempRoot()
    const out = path.join(root, 'agent-skill')

    const result = await runCli([
      'install',
      'ai-skill',
      '--codex',
      '--out',
      out,
      '--docs-root',
      './content/docs',
      '--package-manager',
      'npm',
    ])
    const skill = await readInstalledFile(out, 'SKILL.md')

    expect(result.exitCode).toBe(0)
    expect(skill).toContain('npm exec payload-markdown-docs validate ./content/docs')
    expect(skill).toContain('npm exec payload-markdown-docs plan ./content/docs')
    expect(skill).toContain('npm exec payload-markdown-docs push ./content/docs')
  })

  it('refuses overwrites unless forced', async () => {
    const root = await createTempRoot()
    const out = path.join(root, 'skill')
    const first = await runCli(['install', 'skill', '--codex', '--out', out])
    const second = await runCli(['install', 'skill', '--codex', '--out', out])
    await writeFile(path.join(out, 'SKILL.md'), 'stale\n', 'utf8')
    const forced = await runCli([
      'install',
      'skill',
      '--codex',
      '--out',
      out,
      '--force',
    ])

    expect(first.exitCode).toBe(0)
    expect(second.exitCode).toBe(1)
    expect(second.stderr).toContain('Skill files already exist')
    expect(forced.exitCode).toBe(0)
    expect(await readInstalledFile(out, 'SKILL.md')).not.toBe('stale\n')
  })

  it('supports dry-run without writing files', async () => {
    const root = await createTempRoot()
    const out = path.join(root, 'skill')

    const result = await runCli([
      'install',
      'skill',
      '--codex',
      '--out',
      out,
      '--dry-run',
    ])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('dry-run')
    expect(result.stdout).toContain('SKILL.md')
    await expect(readdir(out)).rejects.toThrow()
  })

  it('does not write outside the target directory', async () => {
    const root = await createTempRoot()
    const out = path.join(root, 'skill')

    const result = await runCli(['install', 'skill', '--codex', '--out', out])
    const files = await listFiles(root)

    expect(result.exitCode).toBe(0)
    expect(files.every((file) => file.startsWith('skill/'))).toBe(true)
  })

  it('installs references with directives and supported frontmatter fields', async () => {
    const root = await createTempRoot()
    const out = path.join(root, 'skill')

    const result = await runCli(['install', 'skill', '--codex', '--out', out])
    const directives = await readInstalledFile(
      out,
      'reference/payload-markdown-directives.md',
    )
    const frontmatter = await readInstalledFile(out, 'reference/frontmatter.md')

    expect(result.exitCode).toBe(0)
    for (const directive of [':::toc', ':::callout', ':::details', ':::steps', ':::cards', ':::card']) {
      expect(directives).toContain(directive)
    }
    for (const field of [
      'title',
      'navTitle',
      'description',
      'order',
      'status',
      'slug',
      'tags',
      'redirectFrom',
      'draft',
    ]) {
      expect(frontmatter).toContain(`\`${field}\``)
    }
  })

  it('detects package manager from lockfiles', async () => {
    const root = await createTempRoot()
    process.chdir(root)
    await writeFile(path.join(root, 'yarn.lock'), '', 'utf8')

    const result = await runCli(['install', 'skill', '--codex'])
    const skill = await readInstalledFile(
      root,
      '.agents/skills/payload-markdown-docs/SKILL.md',
    )

    expect(result.exitCode).toBe(0)
    expect(skill).toContain('yarn exec payload-markdown-docs validate ./docs')
  })

  it('validates target, agent, package manager, and help behavior', async () => {
    const missingAgent = await runCli(['install', 'skill'])
    const badAgent = await runCli(['install', 'skill', '--agent', 'cursor'])
    const badTarget = await runCli(['install', 'plugin', '--codex'])
    const badPackageManager = await runCli([
      'install',
      'skill',
      '--codex',
      '--package-manager',
      'cargo',
    ])
    const help = await runCli(['install', 'skill', '--help'])

    expect(missingAgent.exitCode).toBe(1)
    expect(missingAgent.stderr).toContain('--codex')
    expect(badAgent.exitCode).toBe(1)
    expect(badAgent.stderr).toContain('only "codex"')
    expect(badTarget.exitCode).toBe(1)
    expect(badTarget.stderr).toContain('target "skill" or "ai-skill"')
    expect(badPackageManager.exitCode).toBe(1)
    expect(badPackageManager.stderr).toContain('pnpm, npm, yarn, or bun')
    expect(help.exitCode).toBe(0)
    expect(help.stdout).toContain('payload-markdown-docs install skill --codex')
  })
})
