import { describe, expect, it } from 'vitest'

import {
  getSkillBundleForAgent,
  getSkillDirectoryRoute,
  getSkillZipEntryPath,
  parseSkillSourcePath,
  renderSkillDirectoryIndex,
} from './skillBundles.js'

describe('skill bundle helpers', () => {
  const assets = [
    {
      content: '# Codex Skill\n',
      kind: 'skill',
      route: '/plugins/payload-markdown-docs/skills/codex/SKILL.md',
      sourcePath: 'skills/payload-markdown-docs/codex/SKILL.md',
    },
    {
      content: '# Docs Package\n',
      kind: 'skill',
      route: '/plugins/payload-markdown-docs/skills/codex/reference/docs-package.md',
      sourcePath: 'skills/payload-markdown-docs/codex/reference/docs-package.md',
    },
  ]

  it('derives index, raw file, directory, and archive routes from stored assets', () => {
    const bundle = getSkillBundleForAgent(assets, 'codex')

    expect(bundle?.rootRoute).toBe('/plugins/payload-markdown-docs/skills/codex')
    expect(bundle?.skillRoute).toBe('/plugins/payload-markdown-docs/skills/codex/SKILL.md')
    expect(bundle?.archiveRoute).toBe('/plugins/payload-markdown-docs/skills/codex.zip')
    expect(
      getSkillDirectoryRoute({
        directoryPath: 'reference',
        rootRoute: bundle?.rootRoute ?? '/',
      }),
    ).toBe('/plugins/payload-markdown-docs/skills/codex/reference')
    expect(
      getSkillZipEntryPath({
        packageSlug: bundle?.packageSlug ?? '',
        relativePath: 'reference/docs-package.md',
      }),
    ).toBe('payload-markdown-docs/reference/docs-package.md')
  })

  it('rejects traversal and does not create bundles without root SKILL.md', () => {
    expect(parseSkillSourcePath('skills/payload-markdown-docs/codex/../secret.md')).toBeUndefined()
    expect(
      getSkillBundleForAgent(
        [
          {
            kind: 'skill',
            route: '/plugins/payload-markdown-docs/skills/codex/reference/docs-package.md',
            sourcePath: 'skills/payload-markdown-docs/codex/reference/docs-package.md',
          },
        ],
        'codex',
      ),
    ).toBeUndefined()
  })

  it('renders navigable Markdown indexes', () => {
    const bundle = getSkillBundleForAgent(assets, 'codex')
    const index = bundle ? renderSkillDirectoryIndex({ bundle }) : undefined
    const referenceIndex = bundle
      ? renderSkillDirectoryIndex({
          bundle,
          directoryPath: 'reference',
        })
      : undefined

    expect(index).toContain('# Codex Skill: Payload Markdown Docs')
    expect(index).toContain('/plugins/payload-markdown-docs/skills/codex.zip')
    expect(index).toContain('/plugins/payload-markdown-docs/skills/codex/reference')
    expect(index).toContain('/plugins/payload-markdown-docs/skills/codex/reference/docs-package.md')
    expect(referenceIndex).toContain('Parent:\n- /plugins/payload-markdown-docs/skills/codex')
    expect(referenceIndex).toContain(
      '/plugins/payload-markdown-docs/skills/codex/reference/docs-package.md',
    )
  })
})
