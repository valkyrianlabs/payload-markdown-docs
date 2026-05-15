# Docs Package Structure

`payload-markdown-docs` treats a repository as a docs package with separate
source docs and static AI-facing assets.

Default layout:

```text
docs/
  index.md
  getting-started/
    installation.md
skills/
  <source>/
    codex/
      SKILL.md
    claude/
      SKILL.md
llms.txt
llms-full.txt
```

Rules:

- Markdown files under `docs/` become manifest `files` and generated docs
  records.
- Skill files under `skills/<source>/<agent>/` become manifest `assets`.
- `llms.txt` and `llms-full.txt` become manifest `assets`.
- Asset files are served raw and are not parsed as docs pages.
- Asset files do not need docs frontmatter.
- `index.md` routes to the docs set route base.
- Nested docs paths route below the docs set route base.
- A frontmatter `slug` only overrides the final route segment.
- Move Markdown files to change route hierarchy.
- Use root-relative internal docs links inside the docs set.

The package-specific skill source for this project is:

```text
skills/payload-markdown-docs/codex/
skills/payload-markdown-docs/claude/
```

The companion Payload Markdown authoring skill is installed beside this skill
as `payload-markdown`.
