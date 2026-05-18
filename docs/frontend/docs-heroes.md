---
title: Docs Heroes
navTitle: Docs Heroes
description: Install and render docs-set-first hero fields and reusable docs hero components.
order: 440
status: published
tags:
  - frontend
  - heroes
---

# Docs Heroes

Docs heroes are docs-set-first hero fields and components for product, landing,
and docs entry pages. They link directly to a docs set and can use the selected
docs set for default headings, descriptions, action hrefs, media, and skill
buttons.

## Field Helper

`docsHeroField` adds the docs hero variants to a Payload hero field. It can
stand alone, or it can merge into an existing Payload website template hero
group.

```ts
import type { CollectionConfig } from 'payload'

import { docsHeroField } from '@valkyrianlabs/payload-markdown-docs/fields'
import { hero } from '@/heros/config'

export const Pages: CollectionConfig = {
  slug: 'pages',
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Hero',
          fields: [
            docsHeroField({
              hero,
            }),
          ],
        },
      ],
    },
  ],
}
```

When a local hero field is provided, its existing `type` picker is preserved and
the docs variants are appended:

- `docsSetFullWidth`
- `docsSetSideImage`

Local hero fields are hidden while a docs hero variant is selected. Docs hero
fields are hidden while a local hero variant is selected.

## Standalone Field

If the app does not have a local hero field, use the standalone docs hero field:

```ts
import { docsHeroField } from '@valkyrianlabs/payload-markdown-docs/fields'

fields: [docsHeroField()]
```

Docs heroes are scoped to a selected docs set. The heading field is optional
only when the selected docs set has a title. Description remains optional.

## Plugin Install

The plugin can wrap existing `hero` fields on the configured pages collection:

```ts
import { payloadMarkdownDocs } from '@valkyrianlabs/payload-markdown-docs'

payloadMarkdownDocs({
  heros: true,
})
```

`heroes` is also accepted:

```ts
payloadMarkdownDocs({
  heroes: true,
})
```

For pages-only scoping:

```ts
payloadMarkdownDocs({
  pages: {
    heros: true,
  },
})
```

For collection-level scoping:

```ts
payloadMarkdownDocs({
  collections: {
    pages: {
      heros: true,
    },
  },
})
```

The installer searches the collection fields, including tabs, for a group named
`hero`. If it finds one, it wraps it. If it does not find one, it installs a
standalone docs hero field named `hero`.

## Rendering

Render docs hero variants inside your existing hero renderer:

```tsx
import type { FC } from 'react'
import type { Page } from '@/payload-types'

import { docsHeroComponents } from '@valkyrianlabs/payload-markdown-docs/next'

import { HighImpactHero } from './HighImpact'
import { LowImpactHero } from './LowImpact'

const heroes: Record<string, FC<Page['hero']>> = {
  ...docsHeroComponents,
  highImpact: HighImpactHero,
  lowImpact: LowImpactHero,
}

export function RenderHero(props: Page['hero']) {
  const { type } = props || {}

  if (!type || type === 'none') return null

  const HeroToRender = heroes[type]

  if (!HeroToRender) return null

  return <HeroToRender {...props} />
}
```

The docs hero components accept the normal spread Payload field shape. Data
hydration runs through the plugin `afterRead` resolver, so id-only docs set
relationships are expanded before render when the plugin installed or wrapped the
field.

## Custom Components

Use hero components directly on custom Set or Group pages. Pass URLs from your
own route logic or from already-resolved docs data.

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
  breadcrumb={[{ label: 'Docs', href: '/docs' }, { label: 'Configuration' }]}
  title="Configuration"
  description="Plugin options, routing behavior, and sync settings."
/>
```
