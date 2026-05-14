---
title: Formatting Reference
navTitle: Formatting
description: Markdown formatting expectations for synced docs packages.
order: 630
status: published
tags:
  - reference
  - formatting
---

# Formatting Reference

Docs are plain `.md` files that pass through `@valkyrianlabs/payload-markdown`.
Keep them readable in Git first; the renderer can enhance supported directives
without turning the source into MDX.

## Expected Shape

Each page should have:

- supported frontmatter
- one H1 that matches the page topic
- short sections with H2 and H3 headings
- root-relative internal links
- supported `payload-markdown` directives only when they add clarity

```md
---
title: Quick Start
navTitle: Quick Start
description: Run the default docs workflow.
order: 20
status: published
tags:
  - getting-started
---

# Quick Start

Introductory paragraph.

## Validate Local Docs

Run the validator before syncing.
```

## Links

Use root-relative docs links inside the docs set:

```md
[Publishing](/workflow/publishing)
```

Do not use relative links for internal docs pages:

`../workflow/publishing.md`

Do not hardcode production docs domains for internal navigation.

## Directives

Supported directives are:

- `:::toc`
- `:::callout`
- `:::details`
- `:::steps`
- `:::cards`
- `:::card`

Keep blank lines around nested directive content. Do not invent directive names,
props, layout modes, or MDX components.

## What Not To Add

- `.mdx` files
- arbitrary YAML frontmatter objects
- inline frontmatter arrays such as `tags: [api, sync]`
- HTML scripts, iframes, or client-side widgets
- one Payload Page per Markdown file
- hidden docs files as a substitute for clean navigation metadata
- links to generated Payload Admin records as if they were public docs routes

## Agent Skills

Agent skill files are not human docs pages. Keep them under `/skills` or in the
project-local agent install directory, and keep `/docs` focused on rendered
Markdown documentation.
