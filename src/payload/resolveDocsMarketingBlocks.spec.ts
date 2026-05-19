import { describe, expect, it, vi } from 'vitest'

import type {
  DocsRelationship,
  DocsRelationshipID,
  DocsSetReference,
} from '../marketing/types.js'

import { resolveDocsMarketingBlocksAfterRead } from './resolveDocsMarketingBlocks.js'

type FindByIDArgs = {
  collection: string
  depth?: number
  draft?: boolean
  id: DocsRelationshipID
  locale?: string
  overrideAccess?: boolean
  user?: unknown
}

type TestMarketingBlock = {
  actionType?: 'docsLink' | 'skills'
  blockType?: 'cta' | 'docsCTA'
  docsSet?: DocsRelationship<DocsSetReference> | null
  skillOverrides?: {
    agent?: string
    description?: string
    label?: string
  }[]
  skills?: null | Record<string, unknown>
  type?: 'docsSetFullWidth' | 'docsSetSideImage' | 'docsSetSideInfo'
} & Record<string, unknown>

type TestPageDoc = {
  hero?: TestMarketingBlock
  id: string
  layout: TestMarketingBlock[]
}

const docsSet: DocsSetReference = {
  id: 'set-1',
  slug: 'payload-markdown',
  description: 'Resolved set description.',
  group: {
    id: 'group-1',
    slug: 'plugins',
    title: 'Plugins',
  },
  routeMode: 'product-nested',
  title: 'Resolved set title',
}

const hook = resolveDocsMarketingBlocksAfterRead({
  docsAssetsCollectionSlug: 'payload-markdown-docs-assets',
  docsCollectionSlug: 'docs',
  docsSetsCollectionSlug: 'docs-sets',
})

describe('resolveDocsMarketingBlocksAfterRead', () => {
  it('hydrates Docs CTA docsSet without resolving skills in docsLink mode', async () => {
    const find = vi.fn(() =>
      Promise.resolve({
        docs: [],
      }),
    )
    const findByID = vi.fn((args: FindByIDArgs) =>
      Promise.resolve(args.collection === 'docs-sets' ? docsSet : null),
    )
    const doc: TestPageDoc = {
      id: 'page-with-blocks',
      layout: [
        {
          actionType: 'docsLink',
          blockType: 'docsCTA',
          docsSet: 'set-1',
        },
        {
          type: 'docsSetFullWidth',
          docsSet: 'set-1',
          skills: {
            enabled: false,
          },
        },
      ],
    }

    const result = (await hook({
      doc,
      req: {
        payload: {
          find,
          findByID,
        },
      },
    } as Parameters<typeof hook>[0])) as TestPageDoc

    expect(result.layout[0]?.docsSet).toMatchObject({
      title: 'Resolved set title',
    })
    expect(result.layout[0]?.skills).toBeUndefined()
    expect(result.layout[1]?.docsSet).toMatchObject({
      title: 'Resolved set title',
    })
    expect(find).not.toHaveBeenCalled()
    expect(findByID).toHaveBeenCalledWith({
      id: 'set-1',
      collection: 'docs-sets',
      depth: 2,
      overrideAccess: true,
    })
  })

  it('resolves Docs CTA skills from selected docsSet skill assets', async () => {
    const find = vi.fn(() =>
      Promise.resolve({
        docs: [
          {
            docsSet: 'set-1',
            kind: 'skill',
            route: '/plugins/payload-markdown/skills/codex/SKILL.md',
            sourcePath: 'skills/payload-markdown/codex/SKILL.md',
          },
          {
            docsSet: 'set-1',
            kind: 'skill',
            route: '/plugins/payload-markdown/skills/codex/reference/workflow.md',
            sourcePath: 'skills/payload-markdown/codex/reference/workflow.md',
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
          {
            docsSet: 'set-2',
            kind: 'skill',
            route: '/plugins/other/skills/claude/SKILL.md',
            sourcePath: 'skills/other/claude/SKILL.md',
          },
        ],
      }),
    )
    const findByID = vi.fn((args: FindByIDArgs) =>
      Promise.resolve(args.collection === 'docs-sets' ? docsSet : null),
    )
    const doc: TestPageDoc = {
      id: 'page-with-skills',
      layout: [
        {
          actionType: 'skills',
          blockType: 'docsCTA',
          docsSet: 'set-1',
          skillOverrides: [
            {
              agent: 'codex',
              description: 'Use the Codex workflow.',
              label: 'Open in Codex',
            },
          ],
        },
      ],
    }

    const result = (await hook({
      doc,
      req: {
        payload: {
          find,
          findByID,
        },
      },
    } as Parameters<typeof hook>[0])) as TestPageDoc

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'payload-markdown-docs-assets',
        depth: 0,
        limit: 1000,
        overrideAccess: true,
        sort: 'sourcePath',
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
    expect(result.layout[0]?.skills?.resolvedItems).toEqual([
      {
        type: 'codex',
        agent: 'codex',
        description: 'Use the Codex workflow.',
        href: '/plugins/payload-markdown/skills/codex.zip',
        icon: 'codex',
        label: 'Open in Codex',
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

  it('maps legacy cta block data to docsCTA internally', async () => {
    const find = vi.fn(() =>
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
    )
    const findByID = vi.fn((args: FindByIDArgs) =>
      Promise.resolve(args.collection === 'docs-sets' ? docsSet : null),
    )
    const doc: TestPageDoc = {
      id: 'legacy-page',
      layout: [
        {
          blockType: 'cta',
          docsSet: 'set-1',
          skills: {
            enabled: true,
          },
          title: 'Legacy CTA title',
        },
      ],
    }

    const result = (await hook({
      doc,
      req: {
        payload: {
          find,
          findByID,
        },
      },
    } as Parameters<typeof hook>[0])) as TestPageDoc

    expect(result.layout[0]).toMatchObject({
      actionType: 'skills',
      blockType: 'docsCTA',
      heading: 'Legacy CTA title',
      overrideContent: true,
    })
    expect(result.layout[0]?.skills?.resolvedItems?.[0]).toMatchObject({
      agent: 'codex',
      href: '/plugins/payload-markdown/skills/codex.zip',
    })
  })

  it('hydrates Docs CTA background media only for the full variant', async () => {
    const find = vi.fn(() =>
      Promise.resolve({
        docs: [],
      }),
    )
    const findByID = vi.fn((args: FindByIDArgs) =>
      Promise.resolve(
        args.collection === 'media'
          ? {
              id: 'media-1',
              url: '/media/docs-cta.jpg',
            }
          : null,
      ),
    )
    const doc: TestPageDoc = {
      id: 'page-with-media-cta',
      layout: [
        {
          actionType: 'docsLink',
          background: {
            media: 'media-1',
          },
          blockType: 'docsCTA',
          docsSet,
          variant: 'full',
        },
        {
          actionType: 'docsLink',
          background: {
            media: 'media-2',
          },
          blockType: 'docsCTA',
          docsSet,
          variant: 'normal',
        },
      ],
    }

    const result = (await hook({
      doc,
      req: {
        payload: {
          find,
          findByID,
        },
      },
    } as Parameters<typeof hook>[0])) as TestPageDoc

    expect(result.layout[0]?.background).toMatchObject({
      media: {
        id: 'media-1',
        url: '/media/docs-cta.jpg',
      },
    })
    expect(result.layout[1]?.background).toEqual({
      media: 'media-2',
    })
    expect(findByID).toHaveBeenCalledTimes(1)
    expect(findByID).toHaveBeenCalledWith({
      id: 'media-1',
      collection: 'media',
      depth: 0,
      overrideAccess: true,
    })
  })

  it('does not query unrelated records when relationships are already hydrated', async () => {
    const find = vi.fn(() =>
      Promise.resolve({
        docs: [],
      }),
    )
    const findByID = vi.fn(() => Promise.resolve(null))
    const doc: TestPageDoc = {
      id: 'page-with-hydrated-block',
      layout: [
        {
          actionType: 'docsLink',
          blockType: 'docsCTA',
          docsSet,
        },
      ],
    }

    await hook({
      doc,
      req: {
        payload: {
          find,
          findByID,
        },
      },
    } as Parameters<typeof hook>[0])

    expect(find).not.toHaveBeenCalled()
    expect(findByID).not.toHaveBeenCalled()
  })
})
