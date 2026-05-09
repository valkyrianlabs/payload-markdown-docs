---
title: Frontmatter Reference
navTitle: Frontmatter
description: Supported frontmatter fields for synced docs pages.
order: 620
status: published
tags:
  - reference
  - frontmatter
---

# Frontmatter Reference

Every docs page should use the supported frontmatter subset.

```md
---
title: Installation
navTitle: Install
description: Install and configure payload-markdown-docs.
order: 10
status: published
tags:
  - getting-started
redirectFrom:
  - /docs/install
---
```

## Supported Fields

- `title`
- `navTitle`
- `description`
- `order`
- `status`
- `slug`
- `tags`
- `redirectFrom`
- `draft`

## Rules

- `status` must be `draft` or `published`
- `order` must be a number
- `tags` and `redirectFrom` must use list item syntax
- `slug` may contain letters, numbers, and hyphens
- unknown fields produce warnings
- nested YAML objects are not supported
- arrays must be written as block lists, not inline arrays
- `draft` must be `true` or `false`
- `title`, `navTitle`, `description`, and `slug` are plain strings

## Formatting Expectations

Frontmatter is parsed with a deliberately small YAML subset so docs stay easy to
review in Git and predictable in CI.

Use this shape:

```yaml
---
title: Quick Start
navTitle: Quick Start
description: Run the default docs workflow.
order: 20
status: published
tags:
  - getting-started
---
```

Do not use this shape:

```yaml
---
title:
  text: Quick Start
tags: [getting-started, workflow]
hero:
  image: /hero.png
---
```

Unsupported keys are ignored with warnings. Unsupported syntax that cannot be
parsed fails validation.

## Route Fields

The file path controls the default route:

- `index.md` routes to the docs set route base
- `getting-started/quick-start.md` routes below the docs set route base
- `slug: quickstart` changes only the final route segment

Do not use `slug` for nested paths. Move or rename the file when the route
hierarchy changes.

:::details {title="Title fallback"}
If `title` is missing, validation can fall back to the first `# Heading`. If no heading exists, it falls back to a filename-derived title.
:::
