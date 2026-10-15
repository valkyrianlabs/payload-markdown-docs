import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-expect-error -- plain ESM script without type declarations
import { skillDrift, VENDORED_SKILL_DIR } from '../scripts/sync-payload-markdown-skill.mjs'

const agents = ['claude', 'codex'] as const

describe('payload-markdown companion skill', () => {
  it('vendors the installed payload-markdown skill byte for byte', () => {
    // Fails after a payload-markdown upgrade until `pnpm sync:pm-skill` is committed.
    expect(skillDrift()).toEqual([])
  })

  it.each(agents)('resolves every ../payload-markdown link in the %s docs skill', (agent) => {
    const skillDir = path.join('skills', 'payload-markdown-docs', agent)
    const links = new Set<string>()

    for (const file of fs.readdirSync(skillDir, { recursive: true, withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith('.md')) {
        continue
      }

      const content = fs.readFileSync(path.join(file.parentPath, file.name), 'utf8')

      for (const match of content.matchAll(/\.\.\/payload-markdown\/([\w./-]+)/g)) {
        links.add(match[1].replace(/[.)]+$/, ''))
      }
    }

    expect(links.size).toBeGreaterThan(0)

    const missing = [...links].filter(
      (link) => !fs.existsSync(path.join(VENDORED_SKILL_DIR, agent, link)),
    )

    expect(missing).toEqual([])
  })
})
