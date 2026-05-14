---
name: payload-markdown-docs
description: Use this skill when maintaining Git-backed documentation for a project that uses `@valkyrianlabs/payload-markdown-docs`.
---

# Payload Markdown Docs Skill

Use this skill in Codex when maintaining Git-backed documentation for a project
that uses `@valkyrianlabs/payload-markdown-docs`.

The docs source lives in `{{docsRoot}}` unless the user says otherwise. Edit
repo-local Markdown source files first. Treat generated Payload docs records as
server-owned output, not as source of truth.

This skill may be installed at `.agents/skills/payload-markdown-docs` by the CLI
or served from the package `skills/payload-markdown-docs/codex` directory.

## Core Rules

- Keep human docs in repo-local `.md` files.
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
- Treat sync, publishing, drafts, and hard delete as CMS/server-owned decisions.
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
{{packageManager}} exec payload-markdown-docs validate {{docsRoot}} --source main-docs
{{packageManager}} exec payload-markdown-docs plan {{docsRoot}} --source main-docs
```

Only push when the user asks for an upload and provides endpoint/auth context.
Prefer GitHub OIDC in GitHub Actions:

```bash
{{packageManager}} exec payload-markdown-docs push {{docsRoot}} \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc \
  --dry-run
```

Ed25519 signed sync is still supported for non-GitHub CI or local workflows:

```bash
{{packageManager}} exec payload-markdown-docs push {{docsRoot}} \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --key-id github-actions-main \
  --private-key-env DOCS_SYNC_PRIVATE_KEY \
  --sync
```

Sync writes require `sync.allowWrites: true`. Publishing additionally requires
`sync.allowPublish: true` and a draft-enabled docs collection.

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
