import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import { buildDocsManifest, planDocsSync, validateDocsManifest } from '../sync/index.js'
import { walkDocsFiles } from './filesystem.js'

const docsRoot = 'docs'
const workflowPath = 'examples/github-actions/publish-docs.yml'
const requiredDirectives = [
  ':::toc',
  ':::callout',
  ':::details',
  ':::steps',
  ':::cards',
  ':::card',
]

const markdownLinkRegex = /\[[^\]]+\]\(([^)]+)\)/g

describe('dogfood docs assets', () => {
  it('validates the root docs tree as a docs manifest', async () => {
    const files = await walkDocsFiles({
      root: docsRoot,
    })
    const manifest = buildDocsManifest({
      files,
      root: 'docs',
      sourceId: 'main-docs',
    })
    const validated = validateDocsManifest(manifest, {
      allowedSourceIds: ['main-docs'],
      routeBase: '/plugins/payload-markdown-docs',
    })

    expect(validated.ok).toBe(true)
    expect(files.length).toBeGreaterThan(20)

    if (!validated.ok) {
      return
    }

    expect(validated.data.files.find((file) => file.path === 'index.md')?.route).toBe(
      '/plugins/payload-markdown-docs',
    )
  })

  it('plans the dogfood docs as creates against an empty target', async () => {
    const files = await walkDocsFiles({
      root: docsRoot,
    })
    const manifest = buildDocsManifest({
      files,
      sourceId: 'main-docs',
    })
    const validated = validateDocsManifest(manifest, {
      allowedSourceIds: ['main-docs'],
      routeBase: '/plugins/payload-markdown-docs',
    })

    expect(validated.ok).toBe(true)

    if (!validated.ok) {
      return
    }

    const plan = planDocsSync({
      desired: validated.data,
      existing: [],
    })

    expect(plan.create).toHaveLength(files.length)
    expect(plan.update).toHaveLength(0)
    expect(plan.archive).toHaveLength(0)
  })

  it('uses frontmatter on every dogfood docs page', async () => {
    const files = await walkDocsFiles({
      root: docsRoot,
    })

    expect(files).not.toHaveLength(0)

    for (const file of files) {
      expect(file.content, file.path).toMatch(/^---\n/)
      expect(file.content, file.path).toMatch(/\nstatus: published\n/)
    }
  })

  it('uses root-relative internal links without production docs URLs', async () => {
    const files = await walkDocsFiles({
      root: docsRoot,
    })

    for (const file of files) {
      const links = [...file.content.matchAll(markdownLinkRegex)].map((match) => match[1])

      for (const link of links) {
        if (
          link.startsWith('http://') ||
          link.startsWith('https://') ||
          link.startsWith('#') ||
          link.startsWith('mailto:')
        ) {
          expect(link).not.toContain('docs.valkyrianlabs.com/plugins/payload-markdown-docs')
          continue
        }

        expect(link, `${file.path} uses a non-root docs link`).toMatch(/^\//)
      }
    }
  })

  it('contains examples of required payload-markdown directives', async () => {
    const files = await walkDocsFiles({
      root: docsRoot,
    })
    const docsContent = files.map((file) => file.content).join('\n\n')

    for (const directive of requiredDirectives) {
      expect(docsContent).toContain(directive)
    }
  })

  it('does not describe unsupported roadmap items as implemented', async () => {
    const files = await walkDocsFiles({
      root: docsRoot,
    })
    const docsContent = files.map((file) => file.content).join('\n\n')

    expect(docsContent).not.toMatch(/existing collection targets? (?:are |is )?implemented/i)
    expect(docsContent).not.toMatch(/inline override editing (?:is )?implemented/i)
  })
})

describe('GitHub Actions workflow docs asset', () => {
  it('uses supported commands and documents PR dry-run plus main publish sync', async () => {
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
    expect(workflow).toContain('sync.allowWrites: true')
    expect(workflow).toContain('sync.allowPublish: true')
    expect(workflow).toContain('target.enableDrafts: true')
    expect(workflow).not.toContain('--push')
    expect(workflow).not.toContain('--publish-mode')
  })
})
