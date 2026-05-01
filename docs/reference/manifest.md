---
title: Manifest Reference
navTitle: Manifest
description: JSON manifest shape and validation rules.
order: 610
status: published
tags:
  - reference
  - manifest
---

# Manifest Reference

The sync protocol uses JSON manifest uploads, not ZIP files.

```json
{
  "version": 1,
  "source": {
    "id": "main-docs",
    "root": "docs",
    "commit": "abc123",
    "branch": "main",
    "repository": "valkyrianlabs/payload-markdown-docs"
  },
  "mode": "dry-run",
  "deleteBehavior": "archive",
  "publish": false,
  "files": [
    {
      "path": "getting-started/installation.md",
      "sha256": "...",
      "content": "# Installation\n\n..."
    }
  ]
}
```

## Validation Rules

- `version` must be `1`
- `source.id` is required
- only `.md` files are accepted
- paths must be relative and cannot contain traversal
- duplicate normalized paths are rejected
- declared SHA-256 must match content
- frontmatter must use the supported subset
- file count and size limits are enforced

:::callout {variant="info" title="No target config in the manifest"}
The manifest does not include target collection, target fields, route base, publish authority, or hard-delete authority.
:::

See [frontmatter](/reference/frontmatter).
