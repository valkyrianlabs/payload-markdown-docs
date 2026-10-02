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
- derived route segments must not contain `?`, `#`, or control characters
- file count and size limits are enforced; the binding size limit is the byte
  length of the JSON request body (`maxBodyBytes`, 5,000,000 by default)
- two files or assets that derive the same route are rejected by the sync
  endpoint as a route collision
- client-supplied asset `route` values are confined: skill routes are always
  derived from the docs set, `llms`/`llms-full` routes must be `/llms.txt` /
  `/llms-full.txt` (or that file under the docs set route), and `static`
  routes must stay under the docs set route without `.`/`..`, `%`, `?`, or `#`

## Static Assets

`files` are docs records and use frontmatter, title resolution, and route
derivation. `assets` are native skill artifacts and optional static fallback
artifacts stored separately. They do not require frontmatter and are not parsed
as docs pages.

`pmdocs` emits only these asset content types, chosen by file extension:
`text/markdown; charset=utf-8` (`.md`), `application/json; charset=utf-8`
(`.json`), `application/yaml; charset=utf-8` (`.yaml`, `.yml`), and
`text/plain; charset=utf-8` (everything else, such as `llms.txt`).

Supported asset kinds:

- `llms`
- `llms-full`
- `skill`
- `static`

`llms` and `llms-full` assets are optional custom static fallback files. By
default, `/llms.txt`, `/llms-full.txt`, and docs-set `llms` files are generated
by the plugin from synced docs, docs set metadata, dependencies, and skills.
Skill routes are always derived from the computed docs set route (a `route` sent
for a skill asset is ignored with a warning), so
`skills/main-docs/codex/SKILL.md` serves under a public route such as
`/plugins/main-docs/skills/codex/SKILL.md`. The agent root route, for example
`/plugins/main-docs/skills/codex`, is generated as a Markdown directory index,
and `/plugins/main-docs/skills/codex.zip` is generated from the synced text
artifacts rather than stored as a static ZIP asset.

:::callout {variant="info" title="No target config in the manifest"}
The manifest does not include target collection, target fields, route identity,
publish authority, or hard-delete authority.
:::

See [frontmatter](/reference/frontmatter).

## Agent Artifacts

The sync manifest is not the AI workflow artifact. AI-first support is delivered
through native skill directories under `skills/payload-markdown-docs/<agent>/`.
Those files can be installed by `pmdocs`, included in the plugin package, or
served by a docs website for direct download.

Keep `/docs` focused on human documentation and `/skills` focused on
agent-native workflow instructions.
