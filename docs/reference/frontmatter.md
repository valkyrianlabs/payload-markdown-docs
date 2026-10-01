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
dependencies:
  - "@valkyrianlabs/payload-markdown"
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
- `dependencies`
- `redirectFrom`
- `draft`

## Rules

- `status` must be `draft` or `published`
- `order` must be a number: decimal (`10`, `-2.5`, `.5`, `1e3`) or an unsigned
  `0x`/`0o`/`0b` integer; an empty `order:` is treated as `0` with a warning
- `tags`, `dependencies`, and `redirectFrom` use `- item` lines or a
  single-line flow list such as `[getting-started, workflow]`
- `slug` may contain letters, numbers, and hyphens and must start with a letter
  or number; an empty `slug` is ignored with a warning
- `draft` must be `true` or `false`
- `title`, `navTitle`, `description`, and `slug` are single-line plain strings;
  one pair of matching outer quotes is removed and escapes are not interpreted
- an empty `title` is ignored for the page title (with a warning)
- keys use letters, digits, `_` and `-`; unknown fields produce warnings and
  are ignored together with anything nested below them
- nested values, multi-line values, and YAML block scalars (`|`, `>`) are not
  supported on known fields and fail validation instead of being misread
- full-line `# comments` are ignored; text after a value such as
  `title: Issue #42` is part of the value (there are no inline comments)
- a UTF-8 byte order mark before the opening `---` is ignored, and CRLF or CR
  line endings are accepted
- `dependencies` should use fully qualified package names; the generated
  `llms` endpoints strip npm scopes when matching a dependency to another docs
  set slug

The CLI and the server share these rules through the contract vectors in
`contracts/vectors/` of the payload-markdown-docs repository.

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
description: >
  A folded block scalar
---
```

Unsupported keys (for example `hero:` with nested values) are ignored with
warnings. Unsupported syntax on supported fields fails validation.

## Route Fields

The file path controls the default route:

- `index.md` (any letter case, such as `Index.md`) routes to its directory, so
  the root `index.md` routes to the docs set route base
- `getting-started/quick-start.md` routes below the docs set route base
- `slug: quickstart` changes only the final route segment
- only lowercase `.md` files are docs pages
- path segments containing `?`, `#`, or control characters cannot be served and
  fail validation; segments with spaces produce a warning
- two files that derive the same route (for example `guide.md` and
  `guide/index.md`) are rejected; routes that differ only in letter case
  produce a warning

Do not use `slug` for nested paths. Move or rename the file when the route
hierarchy changes.

:::details {title="Title fallback"}
If `title` is missing or empty, the title comes from the first level-1 heading
(`# Heading` or a `===` underlined heading) outside code blocks, blockquotes and
lists, with inline Markdown such as `**bold**`, `` `code` `` and links reduced to
plain text. If no heading exists, it falls back to a filename-derived title.
:::
