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
    "commit": "abc123",
    "branch": "main",
    "repository": "valkyrianlabs/payload-markdown-docs"
  },
  "mode": "sync",
  "deleteBehavior": "archive",
  "publish": false,
  "files": [
    {
      "path": "getting-started/installation.md",
      "sha256": "...",
      "content": "# Installation\n\n..."
    }
  ],
  "assets": [
    {
      "kind": "skill",
      "path": "skills/main-docs/codex/SKILL.md",
      "route": "/plugins/main-docs/skills/codex/SKILL.md",
      "contentType": "text/markdown; charset=utf-8",
      "sha256": "...",
      "content": "# Skill\n\n..."
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

## Static Assets

`files` are docs records and use frontmatter, title resolution, and route
derivation. `assets` are native skill artifacts and optional static fallback
artifacts stored separately. They do not require frontmatter and are not parsed
as docs pages.

Supported asset kinds:

- `llms`
- `llms-full`
- `skill`
- `static`

`llms` and `llms-full` assets are optional custom static fallback files. By
default, `/llms.txt`, `/llms-full.txt`, and docs-set `llms` files are generated
by the plugin from synced docs, docs set metadata, dependencies, and skills.
Skill routes are derived from the docs set route base, so
`skills/main-docs/codex/SKILL.md` serves under
`<docsSet.routeBase>/skills/codex/SKILL.md`.

:::callout {variant="info" title="No target config in the manifest"}
The manifest does not include target collection, target fields, route base, publish authority, or hard-delete authority.
:::

See [frontmatter](/reference/frontmatter).

## Agent Artifacts

The sync manifest is not the AI workflow artifact. AI-first support is delivered
through native skill directories under `skills/payload-markdown-docs/<agent>/`.
Those files can be installed by the CLI, packaged with the npm build, or served
by a docs website for direct download.

Keep `/docs` focused on human documentation and `/skills` focused on
agent-native workflow instructions.
