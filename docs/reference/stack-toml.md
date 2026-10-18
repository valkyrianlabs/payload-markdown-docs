---
title: stack.toml Reference
navTitle: stack.toml
description: Agent-maintained project metadata and technology stack for a docs set.
order: 622
status: published
tags:
  - reference
  - stack
---

# stack.toml Reference

`docs/stack.toml` describes the product a docs set documents: an optional title
and description, and its technology stack grouped into categories. It lives at
the docs root, next to `index.md`, and is maintained in Git (by agents, through
the bundled skill, or by hand).

`pmdocs` validates the file and sends it with every sync. The plugin stores the
stack on the docs set, shows it on the default preview cards, and serves it
from the [public projects API](/reference/projects-api).

```toml
[project]
title = "Vaulthalla"
description = "The Final Cloud — encrypted storage."

[[stack.languages]]
name = "C++23"

[[stack.languages]]
name = "TypeScript"

[[stack.libraries]]
name = "libfuse3"

[[stack.libraries]]
name = "libpqxx"

[[stack.databases]]
name = "PostgreSQL"

[[stack.infrastructure]]
name = "AWS S3"

[[stack.tooling]]
name = "Meson"
```

`stack.toml` is metadata, not a docs page: it never becomes a route.

## Format

- `[project]` takes `title` (one line, at most 256 UTF-8 bytes) and
  `description` (may span lines, at most 2048 bytes). Both are optional and
  must not be blank: to leave one unset, remove the key.
- Each stack category is `[[stack.<category>]]`, an array of tables. The inline
  form `languages = [{ name = "Go" }]` under `[stack]` is equivalent. A single
  `[stack.languages]` table is an error.
- Category names are free-form keys made of letters, digits, `-` and `_`,
  starting with a letter or digit (for example `languages`, `engines`,
  `security`, `machine-learning`). There is no fixed list.
- Every technology needs a `name`: one line of plain text, at most 128 bytes.
  There are no icons or identifiers.
- Categories keep their order in the file, and technologies keep their order
  within a category.
- Duplicate categories, and duplicate names within one category, are errors.
  Both comparisons ignore case. The same name may appear in two categories.
- Limits: 32 categories, 64 technologies per category, 256 technologies in
  total.
- Unknown keys produce `unknown_project_field` warnings and are ignored, so
  later versions can add optional properties.

## Sync behavior

| `stack.toml` | Effect on the docs set |
| --- | --- |
| Missing | Nothing changes: same manifest as before this feature. |
| Has categories | The stored stack is replaced. |
| `[stack]` with no categories | The stack is cleared. |
| No `[stack]` table | The stack is cleared, with a `missing_stack` warning. |
| A category with no technologies | That category is dropped, with an `empty_stack_category` warning. |

`title` and `description` follow the docs set's **Manually manage title/desc**
setting:

1. When it is on, the admin's title and description are kept, and the
   agent's values are ignored.
2. When it is off, a title or description from `stack.toml` replaces the docs
   set's value on every sync.
3. A value that `stack.toml` does not set is never blanked. The docs set keeps
   its current text.

New docs sets start with the setting off. Docs sets that existed before 1.3
behave as if it were on, so upgrading never replaces a title an admin wrote.
SEO fields (`meta`) are never written by sync and keep precedence in page
metadata and the projects API.

The stack and the last synced title and description are Git-owned. Admin edits,
API writes, publishing an older draft, and restoring a saved version all keep
the values from the last sync.

## Validation

`pmdocs validate`, `plan`, `manifest` and `push` read the file. Errors fail the
command and name the key to fix:

```text
- stack.toml: stack.languages[0].name must not be empty.
```

| Code | Meaning |
| --- | --- |
| `invalid_stack_toml` | TOML syntax error, such as a duplicate key (with line and column), or the file is not valid UTF-8. |
| `invalid_project` | `project` is not a table. |
| `invalid_project_title` / `invalid_project_description` | Blank, wrong type, control characters, or too long. |
| `invalid_stack` | `stack` is not a table of categories. |
| `invalid_stack_category` | Invalid category name, or the category is not an array of tables. |
| `invalid_stack_item` | A technology is not a table, or its `name` is missing, blank, multi-line or too long. |
| `duplicate_stack_category` / `duplicate_stack_item` | The category or name already appears (case-insensitive). |
| `stack_limit_exceeded` | More categories or technologies than the limits allow. |

The sync endpoint applies the same rules to the manifest's `project` object (see
[Manifest](/reference/manifest)).

## Version compatibility

- `pmdocs` from 1.3 sends `stack.toml`. Older `pmdocs` versions never send
  project metadata, so the stored stack stays as it was.
- When the server is older than 1.3, it ignores project metadata. `pmdocs
  push` then warns that the stack was not synchronized. The docs still sync.
