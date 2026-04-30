import { randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { walkDocsFiles } from './filesystem.js'
import { runCli } from './index.js'
import { parseCliArgs } from './parseArgs.js'

const tempRoots: string[] = []

const createTempRoot = async (): Promise<string> => {
  const root = path.join(tmpdir(), `payload-markdown-docs-${randomUUID()}`)
  await mkdir(root, {
    recursive: true,
  })
  tempRoots.push(root)

  return root
}

const writeTempFile = async (
  root: string,
  relativePath: string,
  content: string,
): Promise<void> => {
  const filePath = path.join(root, relativePath)
  await mkdir(path.dirname(filePath), {
    recursive: true,
  })
  await writeFile(filePath, content, 'utf8')
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      rm(root, {
        force: true,
        recursive: true,
      }),
    ),
  )
})

describe('walkDocsFiles', () => {
  it('reads sorted nested Markdown files and ignores unsafe or generated entries', async () => {
    const root = await createTempRoot()
    await writeTempFile(root, 'guide/install.md', '# Install\n')
    await writeTempFile(root, 'index.md', '# Home\n')
    await writeTempFile(root, 'notes.txt', 'ignore me')
    await writeTempFile(root, 'node_modules/pkg/ignored.md', '# Ignored\n')
    await writeTempFile(root, '.git/ignored.md', '# Ignored\n')
    await writeTempFile(root, '.next/ignored.md', '# Ignored\n')
    await writeTempFile(root, 'dist/ignored.md', '# Ignored\n')
    await writeTempFile(root, 'build/ignored.md', '# Ignored\n')

    try {
      await symlink(path.join(root, 'index.md'), path.join(root, 'linked.md'))
    } catch {
      // Some filesystems disallow symlink creation in tests; the walker still skips
      // symlinks where they can be created.
    }

    const files = await walkDocsFiles({
      root,
    })

    expect(files.map((file) => file.path)).toEqual(['guide/install.md', 'index.md'])
    expect(files[0]?.content).toBe('# Install\n')
  })
})

describe('parseCliArgs', () => {
  it('parses command positionals and common flags', () => {
    const parsed = parseCliArgs([
      'validate',
      './docs',
      '--source',
      'main-docs',
      '--json',
    ])

    expect(parsed).toEqual({
      args: {
        command: 'validate',
        flags: {
          json: true,
          source: 'main-docs',
        },
        positionals: ['./docs'],
      },
      ok: true,
    })
  })

  it('rejects unknown commands', () => {
    const parsed = parseCliArgs(['push', './docs'])

    expect(parsed.ok).toBe(false)
    expect(parsed).toMatchObject({
      error: 'Unknown command "push". Run payload-markdown-docs --help.',
    })
  })

  it('handles command help', async () => {
    const result = await runCli(['validate', '--help'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('payload-markdown-docs validate <docs-root>')
  })
})

describe('validate command', () => {
  it('exits successfully for a valid docs directory', async () => {
    const root = await createTempRoot()
    await writeTempFile(root, 'index.md', '# Home\n')

    const result = await runCli(['validate', root, '--source', 'main-docs'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Source: main-docs')
    expect(result.stdout).toContain('Status: valid')
  })

  it('exits with validation failure for invalid frontmatter', async () => {
    const root = await createTempRoot()
    await writeTempFile(root, 'index.md', '---\norder: nope\n---\n# Home\n')

    const result = await runCli(['validate', root])

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('Status: invalid')
    expect(result.stdout).toContain('Frontmatter field "order" must be a number.')
  })

  it('prints JSON output', async () => {
    const root = await createTempRoot()
    await writeTempFile(root, 'index.md', '# Home\n')

    const result = await runCli(['validate', root, '--json'])
    const output = JSON.parse(result.stdout ?? '{}') as {
      fileCount?: number
      validation?: {
        ok?: boolean
      }
    }

    expect(result.exitCode).toBe(0)
    expect(output.fileCount).toBe(1)
    expect(output.validation?.ok).toBe(true)
  })

  it('prints warnings without failing validation', async () => {
    const root = await createTempRoot()
    await writeTempFile(root, 'index.md', '---\nunknown: value\n---\n# Home\n')

    const result = await runCli(['validate', root])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Warnings:')
    expect(result.stdout).toContain('Unknown frontmatter field "unknown" was ignored.')
  })
})

describe('manifest command', () => {
  it('prints a JSON manifest', async () => {
    const root = await createTempRoot()
    await writeTempFile(root, 'index.md', '# Home\n')

    const result = await runCli(['manifest', root, '--source', 'main-docs'])
    const manifest = JSON.parse(result.stdout ?? '{}') as {
      files?: unknown[]
      source?: {
        id?: string
      }
      version?: number
    }

    expect(result.exitCode).toBe(0)
    expect(manifest.version).toBe(1)
    expect(manifest.source?.id).toBe('main-docs')
    expect(manifest.files).toHaveLength(1)
  })

  it('supports pretty output', async () => {
    const root = await createTempRoot()
    await writeTempFile(root, 'index.md', '# Home\n')

    const result = await runCli(['manifest', root, '--pretty'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout?.startsWith('{\n')).toBe(true)
  })

  it('fails when the generated manifest is invalid', async () => {
    const root = await createTempRoot()
    await writeTempFile(root, 'index.md', '---\nstatus: live\n---\n# Home\n')

    const result = await runCli(['manifest', root])

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Manifest is invalid.')
  })
})

describe('plan command', () => {
  it('plans creates against an empty existing docs list', async () => {
    const root = await createTempRoot()
    await writeTempFile(root, 'index.md', '# Home\n')
    await writeTempFile(root, 'guide/install.md', '# Install\n')

    const result = await runCli(['plan', root])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Create: 2')
    expect(result.stdout).toContain('Archive: 0')
  })

  it('plans against provided existing records', async () => {
    const root = await createTempRoot()
    const existingPath = path.join(root, 'existing.json')
    await writeTempFile(root, 'index.md', '# Home\n')
    await writeFile(
      existingPath,
      JSON.stringify([
        {
          route: '/docs',
          sourceHash: 'old-hash',
          sourcePath: 'index.md',
          title: 'Home',
        },
        {
          route: '/docs/old',
          sourceHash: 'old-hash',
          sourcePath: 'old.md',
          title: 'Old',
        },
      ]),
      'utf8',
    )

    const result = await runCli(['plan', root, '--existing', existingPath])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Update: 1')
    expect(result.stdout).toContain('Archive: 1')
  })

  it('supports delete behavior ignore', async () => {
    const root = await createTempRoot()
    const existingPath = path.join(root, 'existing.json')
    await writeTempFile(root, 'index.md', '# Home\n')
    await writeFile(
      existingPath,
      JSON.stringify([
        {
          route: '/docs/old',
          sourceHash: 'old-hash',
          sourcePath: 'old.md',
          title: 'Old',
        },
      ]),
      'utf8',
    )

    const result = await runCli([
      'plan',
      root,
      '--existing',
      existingPath,
      '--delete-behavior',
      'ignore',
    ])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Archive: 0')
  })

  it('prints JSON output', async () => {
    const root = await createTempRoot()
    await writeTempFile(root, 'index.md', '# Home\n')

    const result = await runCli(['plan', root, '--json'])
    const plan = JSON.parse(result.stdout ?? '{}') as {
      create?: unknown[]
    }

    expect(result.exitCode).toBe(0)
    expect(plan.create).toHaveLength(1)
  })
})

describe('keygen command', () => {
  it('prints PEM public and private keys', async () => {
    const result = await runCli(['keygen'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('-----BEGIN PUBLIC KEY-----')
    expect(result.stdout).toContain('-----BEGIN PRIVATE KEY-----')
  })

  it('writes key files and refuses overwrite unless forced', async () => {
    const root = await createTempRoot()

    const firstResult = await runCli(['keygen', '--out', root])
    const secondResult = await runCli(['keygen', '--out', root])
    const forcedResult = await runCli(['keygen', '--out', root, '--force'])
    const publicKey = await readFile(path.join(root, 'docs-sync-public.pem'), 'utf8')
    const privateKey = await readFile(path.join(root, 'docs-sync-private.pem'), 'utf8')

    expect(firstResult.exitCode).toBe(0)
    expect(secondResult.exitCode).toBe(1)
    expect(secondResult.stderr).toContain('Key files already exist.')
    expect(forcedResult.exitCode).toBe(0)
    expect(publicKey).toContain('BEGIN PUBLIC KEY')
    expect(privateKey).toContain('BEGIN PRIVATE KEY')
  })
})
