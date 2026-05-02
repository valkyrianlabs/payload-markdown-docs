import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import { runCli } from './index.js'

const exampleDocsRoot = 'examples/docs'
const workflowPath = 'examples/github-actions/publish-docs.yml'

describe('example docs fixture', () => {
  it('validates through the CLI', async () => {
    const result = await runCli([
      'validate',
      exampleDocsRoot,
      '--source',
      'main-docs',
    ])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Source: main-docs')
    expect(result.stdout).toContain('Files: 3')
    expect(result.stdout).toContain('Status: valid')
  })

  it('builds a manifest through the CLI', async () => {
    const result = await runCli([
      'manifest',
      exampleDocsRoot,
      '--source',
      'main-docs',
    ])
    const manifest = JSON.parse(result.stdout ?? '{}') as {
      files?: {
        path?: string
      }[]
      source?: {
        id?: string
      }
    }

    expect(result.exitCode).toBe(0)
    expect(manifest.source?.id).toBe('main-docs')
    expect(manifest.files?.map((file) => file.path)).toEqual([
      'configuration/sync.md',
      'getting-started/installation.md',
      'index.md',
    ])
  })

  it('plans the example docs as creates against an empty target', async () => {
    const result = await runCli([
      'plan',
      exampleDocsRoot,
      '--source',
      'main-docs',
    ])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Create: 3')
    expect(result.stdout).toContain('Update: 0')
    expect(result.stdout).toContain('Archive: 0')
  })
})

describe('GitHub Actions docs workflow example', () => {
  it('documents validate, pull request dry-run, and main publish sync commands', async () => {
    const workflow = await readFile(workflowPath, 'utf8')

    expect(workflow).toContain('pnpm exec payload-markdown-docs validate ./docs --source main-docs')
    expect(workflow).toContain('if: github.event_name == \'pull_request\'')
    expect(workflow).toContain('--dry-run')
    expect(workflow).toContain('github.ref == \'refs/heads/main\'')
    expect(workflow).toContain('--sync')
    expect(workflow).toContain('--publish')
    expect(workflow).toContain('DOCS_SYNC_ENDPOINT')
    expect(workflow).toContain('id-token: write')
    expect(workflow).toContain('--github-oidc')
    expect(workflow).toContain('--oidc-audience payload-markdown-docs')
    expect(workflow).not.toContain('--push')
    expect(workflow).not.toContain('--publish-mode')
  })
})
