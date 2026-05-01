# Frontmatter

Use only this supported frontmatter subset.

```yaml
---
title: Installation
navTitle: Install
description: Install and configure docs sync.
order: 10
status: published
tags:
  - getting-started
redirectFrom:
  - /docs/install
---
```

Supported fields:

- `title`
- `navTitle`
- `description`
- `order`
- `status`
- `slug`
- `tags`
- `redirectFrom`
- `draft`

Rules:

- `status` must be `draft` or `published`.
- `order` must be a number.
- `tags` and `redirectFrom` must use list item syntax.
- `slug` may contain letters, numbers, and hyphens.
- Avoid arbitrary nested YAML objects.
- Avoid unsupported fields unless the user accepts validation warnings.
- Explicit `title` is preferred even though title fallback exists.
