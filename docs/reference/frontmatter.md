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

:::details {title="Title fallback"}
If `title` is missing, validation can fall back to the first `# Heading`. If no heading exists, it falls back to a filename-derived title.
:::
