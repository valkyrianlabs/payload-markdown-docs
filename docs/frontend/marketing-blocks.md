---
title: Marketing Blocks
navTitle: Marketing Blocks
description: Install and render docs marketing blocks around generated documentation routes.
order: 450
status: published
tags:
  - frontend
  - blocks
---

# Marketing Blocks

`payload-markdown-docs/blocks` exports optional Payload Blocks and field
helpers. `/next` exports the matching render components for building product
pages, docs previews, callouts, banners, and skill download CTAs around selected
docs sets.

The blocks are opt-in. Generated docs routes keep working the same way.

## Manual Block Installation

```ts
import type { CollectionConfig } from 'payload'

import {
  DocsBannerBlock,
  DocsCalloutBlock,
  DocsCTABlock,
  DocsPreviewBlock,
} from '@valkyrianlabs/payload-markdown-docs/blocks'

export const Pages: CollectionConfig = {
  slug: 'pages',
  fields: [
    {
      name: 'layout',
      type: 'blocks',
      blocks: [DocsCTABlock, DocsPreviewBlock, DocsCalloutBlock, DocsBannerBlock],
    },
  ],
}
```

Reusable field helpers are also exported:

```ts
import {
  backgroundMediaFields,
  ctaButtonsField,
  docsPageRelationshipField,
  docsSetRelationshipField,
  skillCTAFields,
} from '@valkyrianlabs/payload-markdown-docs/blocks'
```

## Authoring Model

The included marketing blocks are docs-set-first. Editors select a `Docs set`,
and block links, page choices, fallback actions, and skill buttons derive from
that set.

- `docsPreview` links to the selected docs set and can use the set title and
  description as defaults.
- `docsCTA` links to the selected docs set when no CTA buttons are configured.
- `docsCallout` selects a docs page filtered to the selected docs set.
- `docsBanner` uses the selected docs set title and description as defaults.

CTA buttons are scoped to the same selected docs set. Each button targets the
selected set, a page inside the selected set, or a custom URL. Generic docs
page, docs group, route, and manual-reference targets are not exposed.

Skill CTAs are automatic. When skills are enabled, renderers should resolve
available `payload-markdown-docs-assets` records for the selected docs set with
`kind: 'skill'` and pass the generated items to the component. Editors do not
paste skill download URLs.

```ts
import { resolveDocsSetSkills } from '@valkyrianlabs/payload-markdown-docs/next'

const skills = await resolveDocsSetSkills({
  docsSet: block.docsSet,
  payload,
  skills: block.skills,
})
```

Badges and eyebrow fields remain optional visual metadata. `eyebrow` is small
uppercase pre-heading text. `badges` and `badge` render pill labels near a
heading for status, version, category, or launch metadata.

Background media is decorative. Blocks keep media and position controls by
default; fit, overlay, opacity, overlay variant, and gradient are hidden until
advanced background controls are enabled. Background captions are not rendered.

## Global Auto Install

Auto-install appends docs marketing blocks to existing `blocks` fields on
eligible collections. It does not create new collections or inject a new layout
field.

```ts
import { payloadMarkdownDocs } from '@valkyrianlabs/payload-markdown-docs'

payloadMarkdownDocs({
  blocks: true,
})
```

## Global Selected Blocks

```ts
payloadMarkdownDocs({
  blocks: {
    cta: true,
    preview: true,
  },
})
```

## Scoped Collection Install

The terse collection form installs all docs marketing blocks into matching block
fields on that collection.

```ts
payloadMarkdownDocs({
  collections: {
    pages: true,
  },
})
```

The explicit object form is equivalent and leaves room for future collection
settings.

```ts
payloadMarkdownDocs({
  collections: {
    pages: {
      blocks: true,
    },
  },
})
```

Install only selected blocks into a collection:

```ts
payloadMarkdownDocs({
  collections: {
    pages: {
      blocks: {
        cta: true,
        banner: true,
      },
    },
  },
})
```

Global and scoped settings can be mixed. Collection settings override the global
selection for that collection.

```ts
payloadMarkdownDocs({
  blocks: {
    cta: true,
    callout: true,
  },
  collections: {
    pages: {
      blocks: {
        preview: true,
        banner: true,
      },
    },
    landingPages: true,
  },
})
```

When a collection already has a block with the same slug, the installer keeps the
existing block and skips the duplicate.

## Rendering Blocks

Render the blocks in your app's normal `RenderBlocks.tsx` component map. The
docs block components accept the same spread Payload block props shape used by
generated `layout` arrays.

```tsx
import {
  DocsBanner,
  DocsCallout,
  DocsCTA,
  DocsPreview,
} from '@valkyrianlabs/payload-markdown-docs/next'

const blockComponents = {
  docsPreview: DocsPreview,
  docsBanner: DocsBanner,
  docsCallout: DocsCallout,
  docsCTA: DocsCTA,
}

export function RenderBlocks({ blocks }: { blocks?: { blockType?: string }[] }) {
  return blocks?.map((block, index) => {
    const Block = block.blockType
      ? blockComponents[block.blockType as keyof typeof blockComponents]
      : undefined

    return Block ? <Block key={index} {...block} /> : null
  })
}
```

## Hero Usage

Use heroes directly on custom Set or Group pages. Pass URLs from your own route
logic or from already-resolved docs data.

```tsx
import { DocsProductHero } from '@valkyrianlabs/payload-markdown-docs/next'

export function SetLandingPage({
  set,
}: {
  set?: { description?: string; href?: string; title?: string }
}) {
  return (
    <DocsProductHero
      eyebrow={set?.title}
      heading="Build faster with the docs"
      description={set?.description ?? 'Explore guides, API references, and downloadable skills.'}
      primaryAction={{
        label: 'Read the docs',
        href: set?.href ?? '/docs',
      }}
      skills={{
        enabled: true,
        display: 'buttons',
        resolvedItems: [
          {
            label: 'Codex skill',
            type: 'codex',
            href: '/plugins/payload-markdown-docs/skills/codex',
          },
        ],
      }}
    />
  )
}
```

For docs-native pages, use `DocsNativeHero`:

```tsx
import { DocsNativeHero } from '@valkyrianlabs/payload-markdown-docs/next'

<DocsNativeHero
  breadcrumb={[
    { label: 'Docs', href: '/docs' },
    { label: 'Configuration' },
  ]}
  title="Configuration"
  description="Plugin options, routing behavior, and sync settings."
/>
```

## Included Blocks

- `docsCTA`: a docs-set-scoped call-to-action section with optional badges.
- `docsPreview`: a selected-docs-set preview with set-aware actions.
- `docsCallout`: a callout for a page inside the selected docs set.
- `docsBanner`: a large media-backed banner scoped to a selected docs set.

All blocks support partial data at render time. Missing media, empty CTAs,
unresolved relationships, and empty skill groups are ignored instead of crashing the
page.
