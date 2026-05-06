import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import { walkDocsFiles } from './filesystem.js'
import { runCli } from './index.js'
import { parseCliArgs } from './parseArgs.js'

const sourceId = 'payload-markdown-docs'
const routeBase = '/plugins/payload-markdown-docs'

const docsFlags = [
  '--source',
  sourceId,
  '--root',
  'docs',
  '--route-base',
  routeBase,
]

describe('dev docs fixtures', () => {
  it('validates the basic dev fixture through the CLI', async () => {
    const result = await runCli([
      'validate',
      'dev/docs-fixtures/basic',
      ...docsFlags,
    ])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain(`Source: ${sourceId}`)
    expect(result.stdout).toContain('Files: 3')
    expect(result.stdout).toContain('Status: valid')
  })

  it('validates the publishing dev fixture through the CLI', async () => {
    const result = await runCli([
      'validate',
      'dev/docs-fixtures/publishing',
      ...docsFlags,
    ])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Files: 2')
    expect(result.stdout).toContain('Status: valid')
  })

  it('keeps invalid fixtures out of happy-path manifests', async () => {
    const files = await walkDocsFiles({
      root: 'dev/docs-fixtures/invalid',
    })
    const result = await runCli([
      'validate',
      'dev/docs-fixtures/invalid',
      ...docsFlags,
    ])

    expect(files.map((file) => file.path)).toEqual(['bad-frontmatter.md'])
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('Status: invalid')
    expect(result.stdout).toContain('Frontmatter field "order" must be a number.')
    expect(result.stdout).toContain('Frontmatter field "status" must be "draft" or "published".')
  })
})

describe('dev harness docs and scripts', () => {
  it('documents dev commands with implemented CLI flags and source id', async () => {
    const readme = await readFile('dev/README.md', 'utf8')
    const parsedPush = parseCliArgs([
      'push',
      './dev/docs-fixtures/basic',
      '--endpoint',
      'http://localhost:3000/api/payload-markdown-docs/sync',
      '--source',
      sourceId,
      '--root',
      'docs',
      '--key-id',
      'dev-local',
      '--private-key-file',
      'dev/.docs-sync/docs-sync-private.pem',
      '--sync',
      '--publish',
    ])

    expect(parsedPush.ok).toBe(true)
    expect(readme).toContain(`--source ${sourceId}`)
    expect(readme).toContain('--root docs')
    expect(readme).toContain(`--endpoint "http://localhost:3000/api/${sourceId}/sync"`)
    expect(readme).toContain('--private-key-file dev/.docs-sync/docs-sync-private.pem')
    expect(readme).toContain('node --import @swc-node/register/esm-register ./src/cli/index.ts push')
    expect(readme).toContain('push ./dev/docs-fixtures/publishing')
    expect(readme).toContain('load `dev/.env` directly')
    expect(readme).toContain('stores it on the')
    expect(readme).not.toContain('pnpm exec payload-markdown-docs push')
    expect(readme).not.toContain('cp dev/.env.example .env')
    expect(readme).not.toMatch(/\bmv\s+dev\/\.env/i)
    expect(readme).not.toContain('--source main-docs')
    expect(readme).not.toContain('--publish-mode')
    expect(readme).not.toContain('--push')
  })

  it('keeps package scripts focused on non-secret dev workflow commands', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts?: Record<string, string>
    }
    const scripts = packageJson.scripts ?? {}

    expect(scripts['dev:docs:validate']).toContain('dev/docs-fixtures/basic')
    expect(scripts['dev:docs:validate']).toContain(`--source ${sourceId}`)
    expect(scripts['dev:docs:manifest']).toContain('--pretty')
    expect(scripts['dev:docs:plan']).toContain(`--route-base ${routeBase}`)
    expect(scripts['dev:docs:keygen']).toContain('dev/scripts/create-docs-keypair.ts')
    expect(scripts['dev:docs:seed']).toContain('dev/scripts/seed-docs.ts')
    expect(scripts['dev:docs:reset']).toContain('dev/scripts/reset-docs.ts')
    expect(scripts['dev:docs:seed']).toContain('pnpm dev:payload run')
    expect(scripts['dev:docs:reset']).toContain('pnpm dev:payload run')
    expect(Object.keys(scripts)).not.toContain('dev:docs:push:sync')
    expect(Object.keys(scripts)).not.toContain('dev:docs:push:dry-run')
  })

  it('keeps docs set seed data relationship ids in Payload-compatible shape', async () => {
    const helper = await readFile('dev/helpers/docsSeedData.ts', 'utf8')
    const seedScript = await readFile('dev/scripts/seed-docs.ts', 'utf8')

    expect(helper).toContain('group: groupId')
    expect(helper).toContain('auth:')
    expect(helper).toContain('publicKey,')
    expect(helper).toContain('sourceId: devDocsSourceId')
    expect(helper).toContain(`routeBase: '${routeBase}'`)
    expect(helper).toContain("sourceRoot: 'docs'")
    expect(helper).not.toContain('String(groupId)')
    expect(seedScript).toContain('buildDevDocsSetSeedData({')
    expect(seedScript).toContain('groupId,')
    expect(seedScript).toContain('publicKey: docsSyncPublicKey,')
  })

  it('mounts the dev frontend route adapter catch-all', async () => {
    const routeFile = await readFile(
      'dev/app/(frontend)/[[...slug]]/page.tsx',
      'utf8',
    )

    expect(routeFile).toContain('resolvePayloadMarkdownDocsRoute')
    expect(routeFile).toContain('PayloadMarkdownDocsPage')
    expect(routeFile).toContain('slug.length === 0')
    expect(routeFile).toContain('/plugins/payload-markdown-docs')
    expect(routeFile).toContain('/plugins/payload-markdown-docs/getting-started/installation')
    expect(routeFile).toContain('/admin')
    expect(routeFile).toContain('notFound()')
    expect(routeFile.indexOf('slug.length === 0')).toBeLessThan(
      routeFile.indexOf('notFound()'),
    )
  })

  it('loads Tailwind sources and theme tokens for markdown rendering', async () => {
    const globals = await readFile('dev/app/globals.css', 'utf8')
    const layout = await readFile('dev/app/(frontend)/layout.tsx', 'utf8')

    expect(globals).toContain('@import "tailwindcss"')
    expect(globals).toContain('@plugin "@tailwindcss/typography"')
    expect(globals).toContain('@source "../../src"')
    expect(globals).toContain('@source "../../node_modules/@valkyrianlabs/payload-markdown/dist"')
    expect(globals).toContain('--color-background')
    expect(globals).toContain('--color-foreground')
    expect(globals).toContain('--color-border')
    expect(layout).toContain('className="dark"')
  })
})
