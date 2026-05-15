---
name: payload-markdown-docs
description: Use this skill when maintaining Git-backed documentation for a project that uses `@valkyrianlabs/payload-markdown-docs`.
---

# Payload Markdown Docs Skill

Use this skill in Codex when maintaining Git-backed documentation for a project
that uses `@valkyrianlabs/payload-markdown-docs`.

Edit repo-local source files first. Treat generated Payload docs records and
synced static assets as server-owned output, not as source of truth.

This skill may be installed at `.agents/skills/payload-markdown-docs` by the CLI
or served from the package `skills/payload-markdown-docs/codex` directory.

## Current Model

- Human docs records live in `./docs`.
- Native agent skill assets live in `./skills/<source>/<agent>/`.
- Root AI discovery assets live at `./llms.txt` and `./llms-full.txt`.
- `validate`, `manifest`, `plan`, and `push` read that conventional package
  layout by default.
- Manifest `files` are docs records.
- Manifest `assets` are skill files, `llms.txt`, `llms-full.txt`, and other
  static AI-facing files.
- Skill files are not docs records and do not need docs frontmatter.
- `push` defaults to sync mode. Use `--dry-run` only for an explicit dry-run.
- `--sync` is a compatibility flag, not a required primary flag.
- `--publish` is separate from sync mode and only requests published output.
- Server config owns writes, publishing, drafts, hard delete, auth, and route
  collision behavior.
- Public raw asset URLs require committed Next route files from
  `payload-markdown-docs install routes`.
- `/api/...` asset URLs are implementation/internal fallback URLs, not public
  canonical docs URLs.

## Authoring Rules

- Keep human docs in repo-local `.md` files under `./docs` unless configured
  otherwise.
- Do not introduce MDX unless a future project config explicitly enables it.
- Prefer plain Markdown structure before using directives.
- Use supported frontmatter only.
- Use supported `payload-markdown` directives only when they improve the page.
- Avoid decorative directive spam.
- Keep internal docs links route-aware and root-relative inside the docs set,
  such as `/getting-started/quick-start`.
- Run validation before finishing docs edits.
- Run plan when sync behavior, route changes, publishing, archive behavior, or
  delete behavior matters.
- Do not directly mutate generated Payload records unless the user explicitly
  asks for admin-side overrides.
- Do not invent directives, frontmatter fields, CLI flags, sync modes, runtime
  features, route helpers, or publishing behavior.
- Do not describe unsupported features as implemented.

## Negative Rules

- Do not create `index.ai.yml`.
- Do not create `index.ai.yaml`.
- Do not create a single consolidated AI Markdown export file.
- Do not maintain `/plugins/<name>.md` AI export routes.
- Do not invent unsupported `payload-markdown` directives.
- Do not treat generated Payload records as source of truth.

## Default Workflow

```bash
{{packageManager}} exec payload-markdown-docs validate --source main-docs
{{packageManager}} exec payload-markdown-docs plan --source main-docs
```

If the project does not use the conventional `./docs` location, add
`--docs {{docsRoot}}`.

Only push when the user asks for an upload and provides endpoint/auth context.
GitHub OIDC sync:

```bash
{{packageManager}} exec payload-markdown-docs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc
```

Explicit dry-run:

```bash
{{packageManager}} exec payload-markdown-docs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc \
  --dry-run
```

Ed25519 sync:

```bash
{{packageManager}} exec payload-markdown-docs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY
```

Publishing request, only when the user explicitly wants published output:

```bash
{{packageManager}} exec payload-markdown-docs push \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc \
  --publish
```

Sync writes require `sync.allowWrites: true`. Publishing additionally requires
`sync.allowPublish: true` and a draft-enabled docs collection.

Install public raw asset route files in a Next app when the user needs
`/llms.txt`, `/llms-full.txt`, or docs-set skill URLs to work outside `/api`:

```bash
{{packageManager}} exec payload-markdown-docs install routes --payload-app "src/app/(payload)"
```

## References

- `reference/payload-markdown-directives.md`
- `reference/formatting.md`
- `reference/frontmatter.md`
- `reference/workflow.md`
- `reference/sync.md`
- `reference/routing.md`
- `reference/admin.md`
- `reference/troubleshooting.md`
- `examples/docs-page.md`
- `examples/github-actions.md`

## Safety Checklist

Before finishing:

1. Confirm changed docs have valid frontmatter.
2. Confirm internal links are root-relative and route-aware.
3. Confirm directives match the reference.
4. Run validate.
5. Run plan when sync behavior matters.
6. Report validation or plan failures instead of guessing.
