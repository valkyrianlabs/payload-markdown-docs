import { describe, expect, it, vi } from 'vitest'

import type {
  DocsAssetReference,
  DocsBackgroundMediaInput,
  DocsCTAButtonInput,
  DocsMediaReference,
  DocsPageReference,
  DocsRelationship,
  DocsRelationshipID,
  DocsSetReference,
  SkillCTAGroupInput,
} from '../marketing/types.js'

import { resolveDocsMarketingBlocksAfterRead } from './resolveDocsMarketingBlocks.js'

type FindArgs = {
  collection: string
  depth?: number
  limit?: number
  overrideAccess?: boolean
  sort?: string
  where?: unknown
}

type FindByIDArgs = {
  collection: string
  depth?: number
  id: DocsRelationshipID
  overrideAccess?: boolean
}

type TestMarketingBlock = {
  background?: DocsBackgroundMediaInput | null
  blockType?: 'docsBanner' | 'docsCallout' | 'docsCTA' | 'docsPreview'
  ctaButtons?: DocsCTAButtonInput[] | null
  docsPage?: DocsRelationship<DocsPageReference> | null
  docsSet?: DocsRelationship<DocsSetReference> | null
  image?: DocsRelationship<DocsMediaReference> | null
  skills?: null | SkillCTAGroupInput
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

const docsPage: DocsPageReference = {
  id: 'page-1',
  description: 'Resolved page description.',
  route: '/plugins/payload-markdown/docs/configuration',
  title: 'Resolved page title',
}

describe('resolveDocsMarketingBlocksAfterRead', () => {
  it('hydrates docs sets, docs pages, CTA pages, and automatic skill items', async () => {
    const skillAssets: DocsAssetReference[] = [
      {
        docsSet: 'set-1',
        kind: 'skill',
        route: '/plugins/payload-markdown/skills/codex/SKILL.md',
        sourcePath: 'skills/payload-markdown/codex/SKILL.md',
      },
      {
        docsSet: 'set-2',
        kind: 'skill',
        route: '/plugins/other/skills/claude/SKILL.md',
        sourcePath: 'skills/other/claude/SKILL.md',
      },
    ]
    const find = vi.fn((args: FindArgs) =>
      Promise.resolve({
        docs: args.collection === 'payload-markdown-docs-assets' ? skillAssets : [],
      }),
    )
    const findByID = vi.fn((args: FindByIDArgs) =>
      Promise.resolve(
        args.collection === 'docs-sets'
          ? docsSet
          : args.collection === 'docs'
            ? docsPage
            : null,
      ),
    )
    const hook = resolveDocsMarketingBlocksAfterRead({
      docsAssetsCollectionSlug: 'payload-markdown-docs-assets',
      docsCollectionSlug: 'docs',
      docsSetsCollectionSlug: 'docs-sets',
    })
    const doc: TestPageDoc = {
      id: 'page-with-blocks',
      layout: [
        {
          blockType: 'docsPreview',
          docsSet: 'set-1',
          skills: {
            enabled: true,
          },
        },
        {
          blockType: 'docsCallout',
          docsPage: 'page-1',
          docsSet: 'set-1',
        },
        {
          blockType: 'docsCTA',
          ctaButtons: [
            {
              label: 'Configuration',
              page: 'page-1',
              target: 'setPage',
              variant: 'primary',
            },
          ],
          docsSet: 'set-1',
        },
        {
          type: 'docsSetFullWidth',
          docsSet: 'set-1',
          skills: {
            enabled: true,
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
    expect(result.layout[0]?.skills?.resolvedItems).toEqual([
      {
        type: 'codex',
        href: '/plugins/payload-markdown/skills/codex.zip',
        icon: 'codex',
        label: 'Codex skill',
      },
    ])
    expect(result.layout[1]?.docsPage).toMatchObject({
      route: '/plugins/payload-markdown/docs/configuration',
      title: 'Resolved page title',
    })
    expect(result.layout[2]?.ctaButtons?.[0]?.page).toMatchObject({
      title: 'Resolved page title',
    })
    expect(result.layout[3]?.docsSet).toMatchObject({
      title: 'Resolved set title',
    })
    expect(result.layout[3]?.skills?.resolvedItems).toEqual([
      {
        type: 'codex',
        href: '/plugins/payload-markdown/skills/codex.zip',
        icon: 'codex',
        label: 'Codex skill',
      },
    ])
    expect(findByID).toHaveBeenCalledTimes(2)
    expect(findByID).toHaveBeenCalledWith({
      id: 'set-1',
      collection: 'docs-sets',
      depth: 2,
      overrideAccess: true,
    })
    expect(findByID).toHaveBeenCalledWith({
      id: 'page-1',
      collection: 'docs',
      depth: 1,
      overrideAccess: true,
    })
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'payload-markdown-docs-assets',
        depth: 0,
        overrideAccess: true,
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
  })

  it('hydrates shallow product-nested docs sets before deriving block routes', async () => {
    const find = vi.fn(() =>
      Promise.resolve({
        docs: [],
      }),
    )
    const findByID = vi.fn(() => Promise.resolve(docsSet))
    const hook = resolveDocsMarketingBlocksAfterRead({
      docsAssetsCollectionSlug: 'payload-markdown-docs-assets',
      docsCollectionSlug: 'docs',
      docsSetsCollectionSlug: 'docs-sets',
    })
    const doc: TestPageDoc = {
      id: 'page-with-shallow-docs-set',
      layout: [
        {
          blockType: 'docsPreview',
          docsSet: {
            id: 'set-1',
            slug: 'payload-markdown',
            group: 'group-1',
            routeMode: 'product-nested',
            title: 'Partial set title',
          },
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
      group: {
        slug: 'plugins',
      },
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

  it('hydrates shallow docs hero media references', async () => {
    const media: DocsMediaReference = {
      id: 'media-1',
      alt: 'Docs hero image',
      height: 900,
      url: '/media/docs-hero.png',
      width: 1600,
    }
    const find = vi.fn(() =>
      Promise.resolve({
        docs: [],
      }),
    )
    const findByID = vi.fn((args: FindByIDArgs) =>
      Promise.resolve(args.collection === 'media' ? media : null),
    )
    const hook = resolveDocsMarketingBlocksAfterRead({
      docsAssetsCollectionSlug: 'payload-markdown-docs-assets',
      docsCollectionSlug: 'docs',
      docsSetsCollectionSlug: 'docs-sets',
    })
    const doc: TestPageDoc = {
      id: 'page-with-shallow-media',
      hero: {
        type: 'docsSetSideImage',
        background: {
          media: 'media-1',
        },
        docsSet,
        image: 'media-1',
      },
      layout: [],
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

    expect(result.hero?.image).toMatchObject({
      url: '/media/docs-hero.png',
    })
    expect(result.hero?.background?.media).toMatchObject({
      alt: 'Docs hero image',
      url: '/media/docs-hero.png',
    })
    expect(findByID).toHaveBeenCalledTimes(1)
    expect(findByID).toHaveBeenCalledWith({
      id: 'media-1',
      collection: 'media',
      depth: 0,
      overrideAccess: true,
    })
    expect(find).not.toHaveBeenCalled()
  })

  it('does not query unrelated records when relationships are already hydrated', async () => {
    const find = vi.fn(() =>
      Promise.resolve({
        docs: [],
      }),
    )
    const findByID = vi.fn(() => Promise.resolve(null))
    const hook = resolveDocsMarketingBlocksAfterRead({
      docsAssetsCollectionSlug: 'payload-markdown-docs-assets',
      docsCollectionSlug: 'docs',
      docsSetsCollectionSlug: 'docs-sets',
    })
    const doc: TestPageDoc = {
      id: 'page-with-hydrated-block',
      layout: [
        {
          blockType: 'docsBanner',
          ctaButtons: [],
          docsSet,
          skills: {
            enabled: false,
          },
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
