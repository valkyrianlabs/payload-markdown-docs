import { generateKeyPairSync, randomUUID } from 'node:crypto'
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

import type {
  HttpGetJson,
  HttpPostJson,
} from './http.js'

import { runPushCommand } from './commands/push.js'
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

const keyPair = () =>
  generateKeyPairSync('ed25519', {
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
  })

const createDocsRoot = async (): Promise<string> => {
  const root = await createTempRoot()
  await writeTempFile(root, 'index.md', '# Home\n\nDo not leak this body.\n')

  return root
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
    await writeTempFile(root, 'metadata.yml', 'ignored: true\n')
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
    const parsed = parseCliArgs(['deploy', './docs'])

    expect(parsed.ok).toBe(false)
    expect(parsed).toMatchObject({
      error: 'Unknown command "deploy". Run payload-markdown-docs --help.',
    })
  })

  it('parses push as a known command', () => {
    const parsed = parseCliArgs([
      'push',
      './docs',
      '--endpoint',
      'https://example.com/api/payload-markdown-docs/sync',
      '--key-id',
      'github-actions-main',
      '--private-key-file',
      '.docs-sync/docs-sync-private.pem',
    ])

    expect(parsed).toMatchObject({
      args: {
        command: 'push',
        flags: {
          endpoint: 'https://example.com/api/payload-markdown-docs/sync',
          'key-id': 'github-actions-main',
          'private-key-file': '.docs-sync/docs-sync-private.pem',
        },
        positionals: ['./docs'],
      },
      ok: true,
    })
  })

  it('handles command help', async () => {
    const result = await runCli(['validate', '--help'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('payload-markdown-docs validate [docs-root]')
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

  it('includes llms files and skills as manifest assets', async () => {
    const root = await createTempRoot()
    await writeTempFile(root, 'docs/index.md', '# Home\n')
    await writeTempFile(root, 'skills/main-docs/codex/SKILL.md', '# Codex skill\n')
    await writeTempFile(root, 'llms.txt', '# Main Docs\n')
    await writeTempFile(root, 'llms-full.txt', '# Full Main Docs\n')

    const result = await runCli([
      'manifest',
      '--docs',
      path.join(root, 'docs'),
      '--skills',
      path.join(root, 'skills'),
      '--llms',
      path.join(root, 'llms.txt'),
      '--llms-full',
      path.join(root, 'llms-full.txt'),
      '--source',
      'main-docs',
    ])
    const manifest = JSON.parse(result.stdout ?? '{}') as {
      assets?: Array<{ kind?: string; path?: string; route?: string }>
      files?: unknown[]
    }

    expect(result.exitCode).toBe(0)
    expect(manifest.files).toHaveLength(1)
    expect(manifest.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'llms',
          path: 'llms.txt',
          route: '/llms.txt',
        }),
        expect.objectContaining({
          kind: 'llms-full',
          path: 'llms-full.txt',
          route: '/llms-full.txt',
        }),
        expect.objectContaining({
          kind: 'skill',
          path: 'skills/main-docs/codex/SKILL.md',
        }),
      ]),
    )
  })

  it('fails for explicitly missing optional asset roots', async () => {
    const root = await createTempRoot()
    await writeTempFile(root, 'index.md', '# Home\n')

    const missingSkills = await runCli([
      'manifest',
      root,
      '--skills',
      path.join(root, 'missing-skills'),
    ])
    const missingLlms = await runCli(['manifest', root, '--llms', path.join(root, 'missing.txt')])

    expect(missingSkills.exitCode).toBe(1)
    expect(missingSkills.stderr).toContain('Skills root does not exist')
    expect(missingLlms.exitCode).toBe(1)
    expect(missingLlms.stderr).toContain('llms.txt file does not exist')
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
      docs?: {
        create?: unknown[]
      }
    }

    expect(result.exitCode).toBe(0)
    expect(plan.docs?.create).toHaveLength(1)
  })
})

describe('push command', () => {
  const endpoint = 'https://example.com/api/payload-markdown-docs/sync'

  const pushArgs = async (
    root: string,
    extraArgs: string[] = [],
  ): Promise<{
    privateKey: string
    requests: Parameters<HttpPostJson>[0][]
    result: Awaited<ReturnType<typeof runPushCommand>>
  }> => {
    const { privateKey } = keyPair()
    const requests: Parameters<HttpPostJson>[0][] = []
    const httpPost: HttpPostJson = (request) => {
      requests.push(request)

      return Promise.resolve({
        body: {
          ok: true,
          summary: {
            archive: 0,
            create: 1,
            delete: 0,
            draft: 0,
            unchanged: 0,
            update: 0,
            warnings: 0,
          },
          syncRunId: 'sync-run-1',
        },
        ok: true,
        status: 200,
        text: '{"ok":true}',
      })
    }
    const privateKeyPath = path.join(root, 'docs-sync-private.pem')
    await writeFile(privateKeyPath, privateKey.toString(), 'utf8')
    const parsed = parseCliArgs([
      'push',
      root,
      '--endpoint',
      endpoint,
      '--key-id',
      'github-actions-main',
      '--private-key-file',
      privateKeyPath,
      ...extraArgs,
    ])

    if (!parsed.ok) {
      throw new Error(parsed.error)
    }

    return {
      privateKey: privateKey.toString(),
      requests,
      result: await runPushCommand(parsed.args, httpPost),
    }
  }

  it('defaults to sync and signs a JSON manifest body', async () => {
    const root = await createDocsRoot()
    const { requests, result } = await pushArgs(root)
    const request = requests[0]
    const manifest = JSON.parse(request?.body ?? '{}') as {
      files?: unknown[]
      mode?: string
    }

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Mode: sync')
    expect(manifest.mode).toBe('sync')
    expect(manifest.files).toHaveLength(1)
    expect(request?.url).toBe(endpoint)
    expect(request?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-VL-MD-DOCS-Key-Id': 'github-actions-main',
    })
    expect(request?.headers['X-VL-MD-DOCS-Signature']).toEqual(expect.any(String))
  })

  it('sends sync mode when --sync is used', async () => {
    const root = await createDocsRoot()
    const { requests, result } = await pushArgs(root, ['--sync'])
    const manifest = JSON.parse(requests[0]?.body ?? '{}') as {
      mode?: string
    }

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Mode: sync')
    expect(manifest.mode).toBe('sync')
  })

  it('sends dry-run mode only when --dry-run is used', async () => {
    const root = await createDocsRoot()
    const { requests, result } = await pushArgs(root, ['--dry-run'])
    const manifest = JSON.parse(requests[0]?.body ?? '{}') as {
      mode?: string
    }

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Mode: dry-run')
    expect(manifest.mode).toBe('dry-run')
  })

  it('rejects --dry-run with --sync', async () => {
    const root = await createDocsRoot()
    const { privateKey } = keyPair()
    const privateKeyPath = path.join(root, 'docs-sync-private.pem')
    await writeFile(privateKeyPath, privateKey.toString(), 'utf8')

    const result = await runCli([
      'push',
      root,
      '--endpoint',
      endpoint,
      '--key-id',
      'github-actions-main',
      '--private-key-file',
      privateKeyPath,
      '--dry-run',
      '--sync',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Use either --dry-run or --sync')
  })

  it('requires endpoint, key id, and one private key source', async () => {
    const root = await createDocsRoot()
    const { privateKey } = keyPair()
    const privateKeyPath = path.join(root, 'docs-sync-private.pem')
    await writeFile(privateKeyPath, privateKey.toString(), 'utf8')

    const missingEndpoint = await runCli([
      'push',
      root,
      '--key-id',
      'github-actions-main',
      '--private-key-file',
      privateKeyPath,
    ])
    const missingKeyId = await runCli([
      'push',
      root,
      '--endpoint',
      endpoint,
      '--private-key-file',
      privateKeyPath,
    ])
    const missingPrivateKey = await runCli([
      'push',
      root,
      '--endpoint',
      endpoint,
      '--key-id',
      'github-actions-main',
    ])

    process.env.DOCS_SYNC_PRIVATE_KEY_TEST = privateKey.toString()
    const bothPrivateKeySources = await runCli([
      'push',
      root,
      '--endpoint',
      endpoint,
      '--key-id',
      'github-actions-main',
      '--private-key-file',
      privateKeyPath,
      '--private-key-env',
      'DOCS_SYNC_PRIVATE_KEY_TEST',
    ])
    delete process.env.DOCS_SYNC_PRIVATE_KEY_TEST

    expect(missingEndpoint.exitCode).toBe(1)
    expect(missingEndpoint.stderr).toContain('Push requires --endpoint')
    expect(missingKeyId.exitCode).toBe(1)
    expect(missingKeyId.stderr).toContain('Push requires --key-id')
    expect(missingPrivateKey.exitCode).toBe(1)
    expect(missingPrivateKey.stderr).toContain('Push requires --private-key-file')
    expect(bothPrivateKeySources.exitCode).toBe(1)
    expect(bothPrivateKeySources.stderr).toContain('Use either --private-key-file')
  })

  it('supports private keys from environment variables', async () => {
    const root = await createDocsRoot()
    const { privateKey } = keyPair()
    const requests: Parameters<HttpPostJson>[0][] = []
    const httpPost: HttpPostJson = (request) => {
      requests.push(request)

      return Promise.resolve({
        body: {
          ok: true,
          summary: {},
        },
        ok: true,
        status: 200,
        text: '{"ok":true}',
      })
    }
    process.env.DOCS_SYNC_PRIVATE_KEY_TEST = privateKey.toString()
    const parsed = parseCliArgs([
      'push',
      root,
      '--endpoint',
      endpoint,
      '--key-id',
      'github-actions-main',
      '--private-key-env',
      'DOCS_SYNC_PRIVATE_KEY_TEST',
    ])

    if (!parsed.ok) {
      throw new Error(parsed.error)
    }

    const result = await runPushCommand(parsed.args, httpPost)
    delete process.env.DOCS_SYNC_PRIVATE_KEY_TEST

    expect(result.exitCode).toBe(0)
    expect(requests[0]?.headers['X-VL-MD-DOCS-Signature']).toEqual(
      expect.any(String),
    )
  })

  it('returns a friendly error for unsupported private key files', async () => {
    const root = await createDocsRoot()
    const privateKeyPath = path.join(root, 'not-a-docs-key')
    await writeFile(privateKeyPath, 'not a private key', 'utf8')
    const result = await runCli([
      'push',
      root,
      '--endpoint',
      endpoint,
      '--key-id',
      'github-actions-main',
      '--private-key-file',
      privateKeyPath,
    ])

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Private key must be an Ed25519')
    expect(result.stderr).not.toContain('node:internal/crypto')
  })

  it('supports GitHub OIDC push with a token environment variable', async () => {
    const root = await createDocsRoot()
    const requests: Parameters<HttpPostJson>[0][] = []
    const httpPost: HttpPostJson = (request) => {
      requests.push(request)

      return Promise.resolve({
        body: {
          ok: true,
          summary: {},
        },
        ok: true,
        status: 200,
        text: '{"ok":true}',
      })
    }
    process.env.GITHUB_OIDC_TOKEN_TEST = 'test-oidc-token'
    const parsed = parseCliArgs([
      'push',
      root,
      '--endpoint',
      endpoint,
      '--github-oidc',
      '--oidc-token-env',
      'GITHUB_OIDC_TOKEN_TEST',
    ])

    if (!parsed.ok) {
      throw new Error(parsed.error)
    }

    const result = await runPushCommand(parsed.args, httpPost)
    delete process.env.GITHUB_OIDC_TOKEN_TEST

    expect(result.exitCode).toBe(0)
    expect(requests[0]?.headers).toMatchObject({
      Authorization: 'Bearer test-oidc-token',
      'Content-Type': 'application/json',
      'X-VL-MD-DOCS-Body-SHA256': expect.any(String),
    })
    expect(requests[0]?.headers['X-VL-MD-DOCS-Signature']).toBeUndefined()
    expect(requests[0]?.headers['X-VL-MD-DOCS-Key-Id']).toBeUndefined()
    expect(result.stdout).not.toContain('test-oidc-token')
  })

  it('fetches GitHub OIDC tokens from the Actions runner environment', async () => {
    const root = await createDocsRoot()
    const requests: Parameters<HttpPostJson>[0][] = []
    const tokenRequests: Parameters<HttpGetJson>[0][] = []
    const httpPost: HttpPostJson = (request) => {
      requests.push(request)

      return Promise.resolve({
        body: {
          ok: true,
          summary: {},
        },
        ok: true,
        status: 200,
        text: '{"ok":true}',
      })
    }
    const httpGet: HttpGetJson = (request) => {
      tokenRequests.push(request)

      return Promise.resolve({
        body: {
          value: 'runner-oidc-token',
        },
        ok: true,
        status: 200,
        text: '{"value":"runner-oidc-token"}',
      })
    }
    process.env.ACTIONS_ID_TOKEN_REQUEST_URL =
      'https://token.actions.githubusercontent.com/request?job=docs'
    process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'runner-request-token'
    const parsed = parseCliArgs([
      'push',
      root,
      '--endpoint',
      endpoint,
      '--github-oidc',
      '--source',
      'payload-markdown-docs',
    ])

    if (!parsed.ok) {
      throw new Error(parsed.error)
    }

    const result = await runPushCommand(parsed.args, httpPost, httpGet)
    delete process.env.ACTIONS_ID_TOKEN_REQUEST_URL
    delete process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN

    expect(result.exitCode).toBe(0)
    expect(tokenRequests[0]?.url).toContain('audience=payload-markdown-docs')
    expect(tokenRequests[0]?.headers).toMatchObject({
      Authorization: 'bearer runner-request-token',
    })
    expect(requests[0]?.headers.Authorization).toBe('Bearer runner-oidc-token')
  })

  it('rejects GitHub OIDC with Ed25519 key flags', async () => {
    const root = await createDocsRoot()
    const { privateKey } = keyPair()
    const privateKeyPath = path.join(root, 'docs-sync-private.pem')
    await writeFile(privateKeyPath, privateKey.toString(), 'utf8')

    const keyIdResult = await runCli([
      'push',
      root,
      '--endpoint',
      endpoint,
      '--github-oidc',
      '--key-id',
      'github-actions-main',
    ])
    const privateKeyResult = await runCli([
      'push',
      root,
      '--endpoint',
      endpoint,
      '--github-oidc',
      '--private-key-file',
      privateKeyPath,
    ])

    expect(keyIdResult.exitCode).toBe(1)
    expect(keyIdResult.stderr).toContain('Do not use --key-id')
    expect(privateKeyResult.exitCode).toBe(1)
    expect(privateKeyResult.stderr).toContain('Do not use Ed25519 private key flags')
  })

  it('rejects invalid endpoint URLs and invalid delete behavior', async () => {
    const root = await createDocsRoot()
    const { privateKey } = keyPair()
    const privateKeyPath = path.join(root, 'docs-sync-private.pem')
    await writeFile(privateKeyPath, privateKey.toString(), 'utf8')
    const validBaseArgs = [
      'push',
      root,
      '--endpoint',
      endpoint,
      '--key-id',
      'github-actions-main',
      '--private-key-file',
      privateKeyPath,
    ]

    const invalidEndpoint = await runCli([
      'push',
      root,
      '--endpoint',
      'ftp://example.com/sync',
      '--key-id',
      'github-actions-main',
      '--private-key-file',
      privateKeyPath,
    ])
    const deleteBehavior = await runCli([
      ...validBaseArgs,
      '--delete-behavior',
      'remove',
    ])

    expect(invalidEndpoint.exitCode).toBe(1)
    expect(invalidEndpoint.stderr).toContain('http:// or https://')
    expect(deleteBehavior.exitCode).toBe(1)
    expect(deleteBehavior.stderr).toContain('archive, delete, draft, or ignore')
  })

  it('allows publish and lifecycle delete behavior flags client-side', async () => {
    const root = await createDocsRoot()
    const { requests: publishDryRunRequests, result: publishDryRunResult } =
      await pushArgs(root, ['--publish'])
    const publishDryRunManifest = JSON.parse(
      publishDryRunRequests[0]?.body ?? '{}',
    ) as {
      mode?: string
      publish?: boolean
    }
    const { requests: publishSyncRequests, result: publishSyncResult } =
      await pushArgs(root, ['--sync', '--publish', '--delete-behavior', 'draft'])
    const publishSyncManifest = JSON.parse(publishSyncRequests[0]?.body ?? '{}') as {
      deleteBehavior?: string
      mode?: string
      publish?: boolean
    }
    const { requests: deleteRequests, result: deleteResult } = await pushArgs(root, [
      '--sync',
      '--delete-behavior',
      'delete',
    ])
    const deleteManifest = JSON.parse(deleteRequests[0]?.body ?? '{}') as {
      deleteBehavior?: string
    }

    expect(publishDryRunResult.exitCode).toBe(0)
    expect(publishDryRunManifest).toMatchObject({
      mode: 'sync',
      publish: true,
    })
    expect(publishSyncResult.exitCode).toBe(0)
    expect(publishSyncManifest).toMatchObject({
      deleteBehavior: 'draft',
      mode: 'sync',
      publish: true,
    })
    expect(deleteResult.exitCode).toBe(0)
    expect(deleteManifest.deleteBehavior).toBe('delete')
  })

  it('exits failure for server errors and non-2xx responses', async () => {
    const root = await createDocsRoot()
    const { privateKey } = keyPair()
    const privateKeyPath = path.join(root, 'docs-sync-private.pem')
    await writeFile(privateKeyPath, privateKey.toString(), 'utf8')
    const parsed = parseCliArgs([
      'push',
      root,
      '--endpoint',
      endpoint,
      '--key-id',
      'github-actions-main',
      '--private-key-file',
      privateKeyPath,
    ])

    if (!parsed.ok) {
      throw new Error(parsed.error)
    }

    const serverError = await runPushCommand(parsed.args, () =>
      Promise.resolve({
        body: {
          error: {
            message: 'Invalid sync request signature.',
          },
          ok: false,
        },
        ok: true,
        status: 200,
        text: '{"ok":false}',
      }),
    )
    const httpError = await runPushCommand(parsed.args, () =>
      Promise.resolve({
        body: undefined,
        ok: false,
        status: 500,
        text: 'Internal Server Error',
      }),
    )

    expect(serverError.exitCode).toBe(1)
    expect(serverError.stderr).toContain('Invalid sync request signature.')
    expect(httpError.exitCode).toBe(1)
    expect(httpError.stderr).toContain('HTTP status 500')
  })

  it('prints JSON output and does not print private keys or document bodies by default', async () => {
    const root = await createDocsRoot()
    const { privateKey, requests, result } = await pushArgs(root, ['--json'])
    const output = JSON.parse(result.stdout ?? '{}') as {
      mode?: string
      response?: {
        ok?: boolean
      }
    }
    const humanResult = await pushArgs(root)

    expect(result.exitCode).toBe(0)
    expect(output.mode).toBe('sync')
    expect(output.response?.ok).toBe(true)
    expect(humanResult.result.stdout).not.toContain(privateKey.trim())
    expect(humanResult.result.stdout).not.toContain('Do not leak this body.')
    expect(requests[0]?.body).toContain('Do not leak this body.')
  })

  it('shows publish and hard-delete server gates in push help', async () => {
    const result = await runCli(['push', '--help'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('--publish')
    expect(result.stdout).toContain('--github-oidc')
    expect(result.stdout).toContain('id-token: write')
    expect(result.stdout).toContain('sync.allowHardDelete')
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
