# Agent Docs Workflow

Use this workflow when editing docs source files.

1. Inspect the docs tree, usually `{{docsRoot}}`.
2. Edit Markdown files in place.
3. Keep frontmatter valid and simple.
4. Keep internal docs links root-relative.
5. Use only supported `payload-markdown` directives.
6. Run validation.
7. Run plan when sync impact matters.
8. Only push when the user asks for upload/sync and provides endpoint/auth context.

Validation:

```bash
{{packageManager}} exec payload-markdown-docs validate {{docsRoot}} --source main-docs
```

Plan:

```bash
{{packageManager}} exec payload-markdown-docs plan {{docsRoot}} --source main-docs
```

Dry-run upload with GitHub OIDC:

```bash
{{packageManager}} exec payload-markdown-docs push {{docsRoot}} \
  --endpoint "$DOCS_SYNC_ENDPOINT" \
  --source main-docs \
  --github-oidc \
  --oidc-audience payload-markdown-docs \
  --dry-run
```

Use Ed25519 key flags only when the project is not using GitHub OIDC.

Do not directly edit generated Payload docs records unless the user specifically asks for Payload-side overrides.
