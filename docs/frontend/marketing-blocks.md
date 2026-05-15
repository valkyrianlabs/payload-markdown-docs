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

`payload-markdown-docs` exports optional Payload Blocks and `/next` render
components for building product pages, group landing pages, docs previews, and
skill download CTAs around generated docs routes.

The blocks are opt-in. Generated docs routes keep working the same way.

## Manual Block Installation

```ts
import type { CollectionConfig } from 'payload'

import {
  DocsBannerBlock,
  DocsCalloutBlock,
  DocsCTABlock,
  DocsPreviewBlock,
} from '@valkyrianlabs/payload-markdown-docs'

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
  skillCTAFields,
} from '@valkyrianlabs/payload-markdown-docs'
```

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

Render the blocks in your app's normal `RenderBlocks.tsx` switch or component
map.

```tsx
import {
  DocsBanner,
  DocsCallout,
  DocsCTA,
  DocsPreview,
} from '@valkyrianlabs/payload-markdown-docs/next'

const blockComponents = {
  docsCTA: DocsCTA,
  docsPreview: DocsPreview,
  docsCallout: DocsCallout,
  docsBanner: DocsBanner,
}

export function RenderBlocks({ blocks }: { blocks?: { blockType?: string }[] }) {
  if (!blocks?.length) {
    return null
  }

  return blocks.map((block, index) => {
    const Component = block.blockType
      ? blockComponents[block.blockType as keyof typeof blockComponents]
      : undefined

    return Component ? <Component key={index} {...block} /> : null
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
  set?: { description?: string; routeBase?: string; title?: string }
}) {
  return (
    <DocsProductHero
      eyebrow={set?.title}
      heading="Build faster with the docs"
      description={set?.description ?? 'Explore guides, API references, and downloadable skills.'}
      primaryAction={{
        label: 'Read the docs',
        href: set?.routeBase ?? '/docs',
      }}
      skills={{
        enabled: true,
        display: 'buttons',
        items: [
          {
            label: 'Codex skill',
            type: 'codex',
            href: '/plugins/payload-markdown-docs/skills/codex',
            downloadLabel: 'Download Codex skill',
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

- `docsCTA`: a configurable docs call-to-action section.
- `docsPreview`: manual or reference-backed docs preview cards.
- `docsCallout`: linked docs callouts for pages, sections, or custom URLs.
- `docsBanner`: a large media-backed banner with required background media in Payload.

All blocks support partial data at render time. Missing media, empty CTAs,
unresolved references, and empty skill groups are ignored instead of crashing the
page.
