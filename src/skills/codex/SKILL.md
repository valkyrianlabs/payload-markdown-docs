# Payload Markdown Docs Skill

Use this skill when maintaining Git-backed documentation for a project that uses `@valkyrianlabs/payload-markdown-docs`.

The docs source lives in `{{docsRoot}}` unless the user says otherwise. Edit Markdown source files first. Do not directly mutate generated Payload docs records unless the user explicitly asks for an admin-side override change.

## Core Rules

- Keep docs in repo-local Markdown files.
- Use `.md` files only. Do not introduce MDX unless the project explicitly enables it in a future version.
- Use supported frontmatter only.
- Keep internal docs links root-relative inside the docs set, such as `/getting-started/quick-start`.
- Use `payload-markdown` directives only when they are supported.
- Do not invent directives, frontmatter fields, CLI flags, sync modes, or runtime features.
- Do not describe unsupported features as implemented.
- Run validation before finishing docs edits.
- Treat sync and publishing as server-owned. The request may ask; the Payload plugin decides.

## Default Workflow

```bash
{{packageManager}} exec payload-markdown-docs validate {{docsRoot}} --source main-docs
{{packageManager}} exec payload-markdown-docs plan {{docsRoot}} --source main-docs
```

Only push when the user asks for an upload and provides endpoint/auth context. Prefer GitHub OIDC in GitHub Actions:

```bash
{{packageManager}} exec payload-markdown-docs push {{docsRoot}} \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc \
  --oidc-audience payload-markdown-docs \
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

Sync writes require `sync.allowWrites: true`. Publishing additionally requires `sync.allowPublish: true` and a draft-enabled docs collection.

## References

- `reference/payload-markdown-directives.md`
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
2. Confirm internal links are root-relative.
3. Confirm directives match the reference.
4. Run validate.
5. Run plan when sync behavior matters.
6. Report any validation failures instead of guessing.
