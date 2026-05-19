---
title: In-Page Docs Blocks
navTitle: In-Page Blocks
description: Install and render the compact v1 docs block for page layouts.
order: 450
status: published
tags:
  - frontend
  - blocks
---

# In-Page Docs Blocks

`payload-markdown-docs/blocks` exports one optional v1 Payload Block for page
layouts:

- `docsCTA`: what should the reader do next?

Generated docs routes keep working the same way. This block is only for app
layouts that wrap or reference generated documentation.

## Manual Block Installation

```ts
import type { CollectionConfig } from 'payload'

import { DocsCTABlock } from '@valkyrianlabs/payload-markdown-docs/blocks'

export const Pages: CollectionConfig = {
  slug: 'pages',
  fields: [
    {
      name: 'layout',
      type: 'blocks',
      blocks: [DocsCTABlock],
    },
  ],
}
```

## Docs CTA

Docs CTA is docs-set-first. Editors select one docs set, and the block derives
the title, description, docs link, and skill buttons from that set whenever
possible.

It supports exactly one action mode:

- one button linking to the selected docs set's docs route
- skill buttons detected from synced skill assets for the selected docs set

Docs CTA does not render both modes at the same time. Optional skill overrides
only change detected skill labels and descriptions by agent.

## Roadmap

Docs Excerpt is deferred until a first-class read-only markdown highlighter is
available.

## Auto Install

Auto-install appends Docs CTA to existing `blocks` fields on eligible
collections. It does not create new collections or inject a new layout field.

```ts
import { payloadMarkdownDocs } from '@valkyrianlabs/payload-markdown-docs'

payloadMarkdownDocs({
  blocks: true,
})
```

Select the block explicitly when needed:

```ts
payloadMarkdownDocs({
  blocks: {
    docsCTA: true,
  },
})
```

Use collection-scoped settings to install Docs CTA into a specific collection:

```ts
payloadMarkdownDocs({
  collections: {
    pages: {
      blocks: {
        docsCTA: true,
      },
    },
  },
})
```

## Rendering Blocks

Render the block in your app's normal `RenderBlocks.tsx` component map.

```tsx
import { DocsCTA } from '@valkyrianlabs/payload-markdown-docs/next'

const blockComponents = {
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

Docs hero fields and components are documented separately in
[Docs Heroes](/frontend/docs-heroes).
