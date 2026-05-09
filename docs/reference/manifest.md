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

## AI Export Manifest

`docs/index.ai.yml` is a separate source-controlled YAML manifest for the
AI-facing raw Markdown export. The CLI parses it during manifest generation and
the sync endpoint stores the validated control data on the docs set. The file is
not a docs page and is not shown in human docs navigation.

Preferred path:

```text
docs/index.ai.yml
```

`docs/index.ai.yaml` is also supported. Plain `docs/index.yml` is intentionally
not used because that name is too generic for future human docs navigation,
metadata, sidebar, or indexing features.

```yaml
version: 1
title: Payload Markdown Documentation
canonical: /plugins/payload-markdown
output: /plugins/payload-markdown.md
description: >
  Consolidated AI-facing documentation export for Payload Markdown.
preamble: |
  This file is intended for AI agents, editor tooling, Codex, ChatGPT,
  and offline reference.
order:
  - ./index.md
  - ./install.md
orphans: append
headingMode: normalize
```

Supported first-pass behavior:

- `orphans: append` includes unlisted docs at the end using deterministic fallback order.
- `orphans: ignore` omits unlisted docs.
- `headingMode: normalize` renders each page under a generated section heading and shifts nested headings down.
- `headingMode: preserve` keeps original Markdown headings as-is.

Defaults are `orphans: append` and `headingMode: normalize`.

## Raw Markdown Route

The `output` field is the intended public `.md` URL. The plugin stores the
validated manifest data on the docs set during sync, and the `/next` helper uses
that data to assemble one Markdown response from generated docs records.

The route is served by a Next route handler, not by a generated Payload Page.
If `output` is omitted, the fallback route is the docs set route base with `.md`
appended, such as `/plugins/payload-markdown-docs.md`.

Keep `canonical` pointed at the human docs route and `output` pointed at the raw
Markdown route.
