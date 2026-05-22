import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_DOCS_ASSETS_COLLECTION_SLUG } from '../constants.js'
import { normalizeSkills, resolveDocsSetSkills } from './normalizeSkills.js'

describe('docs set skill CTA resolution', () => {
  it('generates skill buttons from docs asset records for the selected docs set', async () => {
    const find = vi.fn(() =>
      Promise.resolve({
        docs: [
          {
            docsSet: 'set-1',
            kind: 'skill',
            route: '/plugins/payload-markdown/skills/codex/reference/workflow.md',
            sourcePath: 'skills/payload-markdown/codex/reference/workflow.md',
          },
          {
            docsSet: 'set-1',
            kind: 'skill',
            route: '/plugins/payload-markdown/skills/codex/SKILL.md',
            sourcePath: 'skills/payload-markdown/codex/SKILL.md',
          },
          {
            docsSet: {
              id: 'set-1',
            },
            kind: 'skill',
            route: '/plugins/payload-markdown/skills/claude/SKILL.md',
            sourcePath: 'skills/payload-markdown/claude/SKILL.md',
          },
          {
            docsSet: 'set-1',
            kind: 'static',
            route: '/plugins/payload-markdown/logo.png',
            sourcePath: 'static/logo.png',
          },
          {
            docsSet: 'set-2',
            kind: 'skill',
            route: '/plugins/other/skills/codex/SKILL.md',
            sourcePath: 'skills/other/codex/SKILL.md',
          },
          {
            docsSet: 'set-1',
            kind: 'skill',
            route: '/plugins/payload-markdown/skills/zed/SKILL.md',
            sourcePath: 'skills/payload-markdown/zed/SKILL.md',
          },
          {
            docsSet: 'set-1',
            kind: 'skill',
            route: '/plugins/payload-markdown/skills/archived/SKILL.md',
            sourcePath: 'skills/payload-markdown/archived/SKILL.md',
            sync: {
              archived: true,
            },
          },
        ],
      }),
    )

    const resolved = await resolveDocsSetSkills({
      docsSet: {
        id: 'set-1',
      },
      payload: {
        find,
      },
      skills: {
        display: 'buttons',
        enabled: true,
      },
    })

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: DEFAULT_DOCS_ASSETS_COLLECTION_SLUG,
        depth: 0,
        where: {
          and: [
            {
              docsSet: {
                equals: 'set-1',
              },
            },
            {
              kind: {
                equals: 'skill',
              },
            },
            {
              'sync.archived': {
                not_equals: true,
              },
            },
          ],
        },
      }),
    )
    expect(normalizeSkills(resolved)?.items).toEqual([
      {
        type: 'claude',
        agent: 'claude',
        href: '/plugins/payload-markdown/skills/claude.zip',
        icon: 'claude',
        label: 'Claude skill',
      },
      {
        type: 'codex',
        agent: 'codex',
        href: '/plugins/payload-markdown/skills/codex.zip',
        icon: 'codex',
        label: 'Codex skill',
      },
      {
        type: 'zed',
        agent: 'zed',
        href: '/plugins/payload-markdown/skills/zed.zip',
        icon: 'zed',
        label: 'Zed skill',
      },
    ])
  })

  it('does not create auto skill buttons from supporting files alone', async () => {
    const resolved = await resolveDocsSetSkills({
      docsSet: {
        id: 'set-1',
      },
      payload: {
        find: vi.fn(() =>
          Promise.resolve({
            docs: [
              {
                docsSet: 'set-1',
                kind: 'skill',
                route: '/plugins/payload-markdown/skills/codex/reference/workflow.md',
                sourcePath: 'skills/payload-markdown/codex/reference/workflow.md',
              },
            ],
          }),
        ),
      },
      skills: {
        display: 'buttons',
        enabled: true,
      },
    })

    expect(normalizeSkills(resolved)).toBeUndefined()
  })

  it('merges auto skill labels and descriptions by agent', async () => {
    const resolved = await resolveDocsSetSkills({
      docsSet: {
        id: 'set-1',
      },
      payload: {
        find: vi.fn(() =>
          Promise.resolve({
            docs: [
              {
                docsSet: 'set-1',
                kind: 'skill',
                route: '/plugins/payload-markdown/skills/codex/SKILL.md',
                sourcePath: 'skills/payload-markdown/codex/SKILL.md',
              },
            ],
          }),
        ),
      },
      skills: {
        display: 'buttons',
        enabled: true,
        skillOverrides: [
          {
            agent: 'codex',
            description: 'Use the Codex workflow.',
            label: 'Open in Codex',
          },
        ],
      },
    })

    expect(normalizeSkills(resolved)?.items).toEqual([
      {
        type: 'codex',
        agent: 'codex',
        description: 'Use the Codex workflow.',
        href: '/plugins/payload-markdown/skills/codex.zip',
        icon: 'codex',
        label: 'Open in Codex',
      },
    ])
  })
})
